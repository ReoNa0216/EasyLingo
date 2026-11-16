const { test, expect } = require('@playwright/test');
const { fixture } = require('../support.cjs');
const base = process.env.EASYLINGO_TEST_URL || 'http://127.0.0.1:1427';

async function openApp(page, handler) {
  const f = fixture();
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.exposeFunction('nativeInvoke', async (cmd, args) => {
    if (handler) {
      const result = await handler(cmd, args);
      if (result !== undefined) return result;
    }
    if (cmd === 'plugin:dialog|message') { dialogs.push(args.options.message); return null; }
    if (cmd === 'plugin:dialog|ask') return true;
    return f.invoke(cmd, args);
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto(base);
  await page.waitForFunction(() => app.isReady);
  return { ...f, dialogs };
}

test('delayed module queries cannot overwrite the currently selected module', async ({ page }) => {
  const { db, sql } = await openApp(page);
  for (const moduleId of ['english', 'german']) {
    await db.putMaterial({ id: `mat_${moduleId}`, moduleId, title: `${moduleId} material`, content: 'text', status: 'completed', createdAt: new Date() });
    await db.putEntry({ moduleId, type: 'word', original: `${moduleId} word`, translation: '词', nextReview: new Date() });
  }
  await page.evaluate(() => {
    const original = dbAdapter.getMaterialsByModule.bind(dbAdapter);
    dbAdapter.getMaterialsByModule = async id => {
      const rows = await original(id);
      if (id === 'english') await new Promise(resolve => { window.releaseMaterials = resolve; });
      return rows;
    };
    window.oldSwitch = app.switchModule('english');
  });
  await page.waitForFunction(() => window.releaseMaterials);
  await page.evaluate(() => app.switchModule('german'));
  await page.evaluate(async () => { releaseMaterials(); await oldSwitch; });
  await expect(page.locator('#page-title')).toHaveText('德语');
  await expect(page.locator('#materials-list')).toContainText('german material');
  await expect(page.locator('#materials-list')).not.toContainText('english material');

  await page.evaluate(() => {
    const original = dbAdapter.getEntriesByModule.bind(dbAdapter);
    let paused = false;
    dbAdapter.getEntriesByModule = async id => {
      const rows = await original(id);
      if (id === 'english' && !paused) { paused = true; await new Promise(resolve => { window.releaseEntries = resolve; }); }
      return rows;
    };
    app.currentModule = 'english';
    window.oldEntries = app.loadEntries();
  });
  await page.waitForFunction(() => window.releaseEntries);
  await page.evaluate(() => app.switchModule('german'));
  await page.evaluate(async () => { releaseEntries(); await oldEntries; });
  await expect(page.locator('#entries-words')).toContainText('german word');
  await expect(page.locator('#entries-words')).not.toContainText('english word');
  sql.close();
});

test('returning to a module preserves a fetched news preview and its extraction action', async ({ page }) => {
  const link = 'https://j.people.com.cn/n3/2026/1116/c1-1.html';
  const { sql } = await openApp(page, async cmd => {
    if (cmd === 'fetch_people_news') return [{ title: '日本語ニュース', link, pubDate: '2026-11-16' }];
    if (cmd === 'fetch_news_article') return { title: '日本語ニュース', content: '日本語のニュース本文。', source: '人民网日语版' };
  });
  await page.evaluate(async () => { await app.switchModule('japanese'); await app.fetchPeopleNews(); });
  await expect(page.locator('#people-preview')).toBeVisible();
  await page.evaluate(async () => { await app.switchModule('german'); await app.switchModule('japanese'); });
  await expect(page.locator('#people-preview')).toBeVisible();
  await expect(page.locator('#people-content')).toContainText('日本語のニュース本文。');
  await expect(page.locator('#people-process-btn')).toBeVisible();
  expect(await page.evaluate(() => app.fetchedPeopleFeeds.length)).toBe(1);
  sql.close();
});

test('a material cannot be deleted while extraction can still write its entries', async ({ page }) => {
  let release, requested = false;
  const { db, sql } = await openApp(page, async cmd => {
    if (cmd === 'request_ai') {
      requested = true;
      await new Promise(resolve => { release = resolve; });
      return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ type: 'word', original: 'cat', translation: '猫' }]) }, finish_reason: 'stop' }] }) };
    }
  });
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => { await app.switchModule('english'); window.pendingImport = app.saveMaterial('cat.txt', 'cat'); });
  await expect.poll(() => requested).toBe(true);
  const material = (await db.getAllMaterials())[0];
  await page.evaluate(id => app.deleteMaterial(id), material.id);
  const keptDuringProcessing = !!await db.getMaterial(material.id);
  release();
  await page.evaluate(() => window.pendingImport);
  expect(keptDuringProcessing).toBe(true);
  expect((await db.getAllEntries()).every(e => e.materialId === material.id)).toBe(true);
  expect(await db.getMaterial(material.id)).toBeTruthy();
  sql.close();
});

test('bulk completion preserves navigation and a newer input draft', async ({ page }) => {
  let release, requested = false;
  const { db, sql } = await openApp(page, async cmd => {
    if (cmd === 'request_ai') {
      requested = true;
      await new Promise(resolve => { release = resolve; });
      return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ original: 'cat', translation: '猫', wordType: '名词' }]) }, finish_reason: 'stop' }] }) };
    }
  });
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => {
    await app.switchModule('english');
    document.getElementById('bulk-import-text').value = 'cat';
    window.pendingBulk = app.bulkImportVocabulary();
  });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(async () => { await app.switchModule('german'); document.getElementById('bulk-import-text').value = 'Haus'; });
  release();
  await page.evaluate(() => window.pendingBulk);
  await expect(page.locator('#page-title')).toHaveText('德语');
  await expect(page.locator('#bulk-import-text')).toHaveValue('Haus');
  expect((await db.getAllEntries()).map(e => e.moduleId)).toEqual(['english']);
  sql.close();
});

test('invalid settings and cancelled or invalid backup actions preserve saved data', async ({ page }) => {
  let writes = 0;
  const { db, sql, dialogs } = await openApp(page, async cmd => {
    if (cmd === 'plugin:dialog|save') return null;
    if (cmd === 'plugin:fs|write_text_file') { writes++; return null; }
  });
  await db.putSetting({ id: 'model', value: 'kept-model' });
  await db.putEntry({ moduleId: 'english', type: 'word', original: 'kept', translation: '保留', nextReview: new Date() });
  await page.evaluate(() => app.showSettings());
  await page.locator('#setting-api-url').fill('http://example.com/v1');
  await page.locator('#setting-model').fill('unsaved-model');
  await page.evaluate(() => app.saveSettings());
  expect((await db.getSetting('model')).value).toBe('kept-model');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => app.exportData());
  expect(writes).toBe(0);
  await expect(page.locator('#progress-modal')).toHaveCount(0);
  await page.evaluate(() => app.importData({ target: { files: [new File(['{invalid json'], 'bad.json')], value: 'bad.json' } }));
  expect((await db.getAllEntries()).map(e => e.original)).toEqual(['kept']);
  expect(dialogs.some(d => d.includes('原有数据已保留'))).toBe(true);
  await expect(page.locator('#progress-modal')).toHaveCount(0);
  sql.close();
});

test('leaving review through navigation respects cancel and stops its timer on confirmation', async ({ page }) => {
  let accept = false;
  const { db, sql } = await openApp(page, async cmd => {
    if (cmd === 'plugin:dialog|ask') return accept;
  });
  for (const original of ['first', 'second']) {
    await db.putEntry({ moduleId: 'english', type: 'word', original, translation: '词', nextReview: new Date(), status: 'new' });
  }
  await page.evaluate(async () => { await app.switchModule('english'); await app.startSingleModuleReview('english'); });
  await expect(page.locator('#review-view')).toBeVisible();
  await page.locator('#nav-german').click();
  await expect(page.locator('#review-view')).toBeVisible();
  expect(await page.evaluate(() => app.currentModule)).toBe('english');
  expect(await page.evaluate(() => !!app.studyTimer)).toBe(true);
  accept = true;
  await page.locator('#nav-calendar').click();
  await expect(page.locator('#calendar-view')).toBeVisible();
  expect(await page.evaluate(() => app.studyTimer)).toBeNull();
  sql.close();
});

test('bulk selections cannot delete entries from the previously selected language', async ({ page }) => {
  const { db, sql } = await openApp(page);
  const english = { moduleId: 'english', type: 'word', original: 'cat', translation: '猫', nextReview: new Date() };
  await db.putEntry(english);
  await db.putEntry({ moduleId: 'german', type: 'word', original: 'Katze', translation: '猫', nextReview: new Date() });
  await page.evaluate(async id => {
    await app.switchModule('english');
    app.switchModuleTab('words');
    app.toggleBatchMode('word');
    app.toggleEntrySelection('word', id);
    await app.switchModule('german');
  }, english.id);
  await page.evaluate(() => app.batchDeleteEntries('word'));
  expect(await db.getEntry(english.id)).toBeTruthy();
  expect(await page.evaluate(() => app.selectedEntries.word.size)).toBe(0);
  await expect(page.locator('#words-delete-btn')).toBeHidden();
  sql.close();
});

test('file parsing keeps its target module and blocks deletion until import finishes', async ({ page }) => {
  const { db, sql } = await openApp(page);
  await db.putModule({ id: 'custom_fr', name: '法语', language: 'French', code: 'FR', flag: 'fr' });
  await page.reload();
  await page.waitForFunction(() => app.isReady);
  await page.evaluate(async () => {
    await app.switchModule('custom_fr');
    app.parseFile = async () => { await new Promise(resolve => { window.releaseFile = resolve; }); return 'Bonjour tout le monde.'; };
    window.pendingFile = app.processFiles([new File(['demo'], 'demo.txt')]);
    await app.switchModule('english');
    await app.deleteModule('custom_fr');
  });
  expect(await db.getModule('custom_fr')).toBeTruthy();
  await page.evaluate(async () => { releaseFile(); await pendingFile; });
  expect((await db.getAllMaterials()).map(m => m.moduleId)).toEqual(['custom_fr']);
  expect(await page.evaluate(() => app.fileImportCount)).toBe(0);
  await expect(page.locator('#page-title')).toHaveText('英语');
  // A processing flag left by an interrupted previous run must not lock deletion forever.
  await db.putMaterial({ id: 'interrupted', moduleId: 'english', title: 'Old task', content: 'text', status: 'processing', createdAt: new Date() });
  await page.evaluate(() => app.deleteMaterial('interrupted'));
  expect(await db.getMaterial('interrupted')).toBeNull();
  sql.close();
});

test('news that completes after navigation restores into the current module view', async ({ page }) => {
  let release, requested = false;
  const { sql } = await openApp(page, async cmd => {
    if (cmd === 'fetch_people_news') return [{ title: 'Pending news', link: 'https://j.people.com.cn/n3/2026/1116/c1-2.html', pubDate: '2026-11-16' }];
    if (cmd === 'fetch_news_article') {
      requested = true;
      await new Promise(resolve => { release = resolve; });
      return { title: 'Pending news', content: '学習の記事。', source: '人民网日语版' };
    }
  });
  await page.evaluate(async () => { await app.switchModule('japanese'); window.pendingNews = app.fetchPeopleNews(); });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(async () => { await app.switchModule('english'); await app.switchModule('japanese'); });
  release();
  await page.evaluate(() => window.pendingNews);
  await expect(page.locator('#people-preview')).toBeVisible();
  await expect(page.locator('#people-content')).toContainText('学習の記事。');
  sql.close();
});
