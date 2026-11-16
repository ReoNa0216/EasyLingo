const { test, expect } = require('@playwright/test');
const { fixture } = require('../support.cjs');
const fs = require('node:fs');

test('offline UI, safe content, editing, review, statistics and custom modules', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:1427/') ? route.continue() : route.abort());
  await page.exposeFunction('nativeInvoke', async (cmd, args) => {
    if (cmd === 'plugin:dialog|message') return;
    if (cmd === 'plugin:dialog|ask') return true;
    return invoke(cmd, args);
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await expect(page.locator('#due-count')).toHaveText('0/20');
  await page.getByRole('button', { name: '帮助与关于' }).click();
  await expect(page.locator('#about-modal')).toContainText('开发者：陈挚');
  await expect(page.locator('#about-modal')).toContainText('开发单位：清华大学语言教学中心');
  await page.screenshot({ path: 'artifacts/about.png' });
  await page.locator('#about-modal button').click();

  const entry = { moduleId: 'english', type: 'word', original: 'say "hello" <img src=x onerror="window.pwned=1">', translation: '你好', explanation: '</textarea><img src=x onerror="window.pwned=1">', nextReview: new Date(), srsLevel: 0, interval: 0 };
  await db.putEntry(entry);
  await page.evaluate(() => app.switchModule('english'));
  await page.evaluate(() => app.switchModuleTab('words'));
  await page.locator(`#entry-${entry.id} button[title="编辑"]`).click();
  await expect(page.locator('#edit-original')).toHaveValue(entry.original);
  await page.locator('#edit-original').fill('hello');
  await page.locator('#entry-edit-modal button').filter({ hasText: '保存' }).click();
  await expect(page.locator('#entry-edit-modal')).toHaveCount(0);
  await expect(page.locator('#settings-modal')).toHaveCount(1);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();

  await db.putSetting({ id: 'dailyLimit', value: 1 });
  await page.evaluate(() => app.startSingleModuleReview('english'));
  await expect(page.locator('#review-progress')).toHaveText('1/1');
  await page.evaluate(() => app.flipCard());
  await page.evaluate(() => Promise.all([app.rateCard(3), app.rateCard(3)]));
  await expect(page.locator('#due-count')).toHaveText('1/1');
  expect((await db.getAllRecords()).filter(r => r.action === 'review').length).toBe(1);
  expect((await db.getEntry(entry.id)).srsLevel).toBe(1);

  await db.putModule({ id: 'custom_1', name: 'Français', language: 'French', flag: 'fr' });
  await page.reload();
  await expect(page.locator('#nav-custom_1')).toBeVisible();
  await page.evaluate(() => app.editModule('custom_1'));
  await page.locator('#edit-module-name').fill('法语课程');
  await page.locator('#edit-module-code').fill('FR');
  await page.evaluate(() => app.saveModuleEdit());
  await expect(page.locator('#nav-custom_1')).toContainText('法语课程');
  await page.evaluate(() => app.showStats());
  await expect(page.locator('#stats-view')).toBeVisible();
  await page.evaluate(() => app.showCalendar());
  await expect(page.locator('#calendar-view')).toBeVisible();
  expect(errors).toEqual([]);
  sql.close();
});

test('failed AI extraction is visible and PDF/Word parsers load locally', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  await page.exposeFunction('nativeInvoke', async (cmd, args) => {
    if (cmd === 'request_ai') return { status: 401, body: '{"error":{"message":"invalid key"}}' };
    if (cmd.startsWith('plugin:dialog')) return true;
    return invoke(cmd, args);
  });
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await expect(page.locator('#due-count')).toHaveText('0/20');
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => { await app.switchModule('english'); await app.saveMaterial('test.txt', 'Hello world.'); });
  const materials = await db.getAllMaterials();
  expect(materials[0].status).toBe('error');
  expect(materials[0].errorMsg).toContain('失败');
  const parserVersions = await page.evaluate(async () => {
    const pdf = await import('./vendor/pdf.mjs');
    return { pdf: pdf.version, docx: typeof mammoth.extractRawText };
  });
  expect(parserVersions.docx).toBe('function');
  expect(parserVersions.pdf).toMatch(/^6\./);
  for (const extension of ['pdf', 'docx']) {
    const bytes = [...fs.readFileSync(`tests/fixtures/sample.${extension}`)];
    const text = await page.evaluate(async ({ bytes, extension }) => {
      return app.parseFile(new File([new Uint8Array(bytes)], `sample.${extension}`));
    }, { bytes, extension });
    expect(text).toContain('Hello EasyLingo');
  }
  sql.close();
});
