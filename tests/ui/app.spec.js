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
  await page.locator('#nav-home').click();
  await page.locator('#study-overview').getByRole('button', { name: '开始复习' }).click();
  await page.locator('.mixed-review-checkbox[value="english"]').check();
  await page.locator('#mixed-review-modal').getByRole('button', { name: '开始复习' }).click();
  await expect(page.locator('#review-progress')).toHaveText('1/1');
  await page.evaluate(() => app.flipCard());
  await page.evaluate(() => Promise.all([app.rateCard(3), app.rateCard(3)]));
  await expect(page.locator('#due-count')).toHaveText('1/1');
  expect((await db.getAllRecords()).filter(r => r.action === 'review').length).toBe(1);
  expect((await db.getAllRecords()).find(r => r.action === 'review').moduleId).toBe('english');
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

test('news failures remain retryable and untrusted previews stay text', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  let failArticle = true;
  let failAI = true;
  const payload = '<img src=x onerror="window.newsInjected=1">';
  await page.exposeFunction('nativeInvoke', async (cmd, args) => {
    if (cmd === 'fetch_chinadaily_news') return [{ title: 'China Daily news', link: 'https://www.chinadaily.com.cn/a/202611/16/WS1.html', pubDate: '2026-11-16T10:22' }];
    if (cmd === 'fetch_people_news') return [{ title: '日本語ニュース', link: 'https://j.people.com.cn/n3/2026/1116/c1-1.html', pubDate: '2026-11-16T09:00' }];
    if (cmd === 'request_ai') return failAI
      ? { status: 401, body: '{"error":{"message":"invalid key"}}' }
      : { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ type: 'word', original: '猫', translation: '猫', explanation: 'ねこ', example: '猫がいます。' }]) }, finish_reason: 'stop' }] }) };
    if (cmd === 'fetch_news_rss') return `<rss><channel><item><title>News</title><link>https://example.com/${args.source}</link><description></description><pubDate><![CDATA[${payload}]]></pubDate></item></channel></rss>`;
    if (cmd === 'fetch_news_article') {
      if (failArticle) throw new Error('connection timeout');
      return { title: payload, content: payload + ' Article body.', source: args.source };
    }
    if (cmd.startsWith('plugin:dialog')) return true;
    return invoke(cmd, args);
  });
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await page.evaluate(async () => { await app.switchModule('english'); app.switchModuleTab('upload'); });
  await expect(page.locator('#panel-npr')).toBeVisible();
  await expect(page.locator('#panel-bbc')).toBeHidden();
  await expect(page.locator('#tab-bbc')).toContainText('需代理');
  await expect(page.locator('#tab-guardian')).toContainText('需代理');
  await page.locator('#tab-chinadaily').click();
  await expect(page.locator('#panel-chinadaily')).toBeVisible();
  for (const source of ['bbc', 'guardian', 'npr', 'people', 'zdf', 'chinadaily']) {
    const names = { bbc: 'BBC', guardian: 'Guardian', npr: 'NPR', people: 'People', zdf: 'ZDF', chinadaily: 'ChinaDaily' };
    const suffix = names[source];
    await page.evaluate(async source => {
      await app.switchModule(source === 'zdf' ? 'german' : source === 'people' ? 'japanese' : 'english');
    }, source);
    failArticle = true;
    await page.evaluate(suffix => app[`fetch${suffix}News`](), suffix);
    expect(await page.evaluate(suffix => app[`fetched${suffix}Feeds`].length, suffix)).toBe(0);
    await expect(page.locator(`#${source}-status`)).toContainText('获取失败');
    failArticle = false;
    await page.evaluate(suffix => app[`fetch${suffix}News`](), suffix);
    expect(await page.evaluate(suffix => app[`fetched${suffix}Feeds`].length, suffix)).toBe(1);
    await expect(page.locator(`#${source}-content`)).toContainText('Article body.');
    await expect(page.locator(`#${source}-content img`)).toHaveCount(0);
    expect(await page.evaluate(() => window.newsInjected)).toBeUndefined();
    // Exhausting the feed must reset persisted history before fetching again.
    await page.evaluate(suffix => app[`fetch${suffix}News`](), suffix);
    expect(await page.evaluate(suffix => app[`fetched${suffix}Feeds`].length, suffix)).toBe(1);
    await db.putSetting({ id: 'apiKey', value: 'test-only' });
    failAI = true;
    await page.evaluate(suffix => app[`process${suffix}Content`](), suffix);
    expect((await db.getAllMaterials()).at(-1).status).toBe('error');
    expect(await page.evaluate(source => app[`${source}CurrentArticle`] !== null, source)).toBe(true);
    failAI = false;
    const completedBefore = (await db.getAllMaterials()).filter(m => m.status === 'completed').length;
    await page.evaluate(suffix => Promise.all([app[`process${suffix}Content`](), app[`process${suffix}Content`]()]), suffix);
    const materials = await db.getAllMaterials();
    expect(materials.filter(m => m.status === 'completed')).toHaveLength(completedBefore + 1);
    const material = materials.at(-1);
    expect(material.moduleId).toBe(source === 'people' ? 'japanese' : source === 'zdf' ? 'german' : 'english');
    expect(material.sourceFile).toBe(source === 'people' ? 'https://j.people.com.cn/n3/2026/1116/c1-1.html' : source === 'chinadaily' ? 'https://www.chinadaily.com.cn/a/202611/16/WS1.html' : `https://example.com/${source}`);
    expect((await db.getEntriesByMaterial(material.id)).map(e => e.original)).toEqual(['猫']);
  }
  sql.close();
});

test('material preview shows full safe text and remains usable in a narrow viewport', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  await page.exposeFunction('nativeInvoke', invoke);
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  const payload = '<img src=x onerror="window.previewInjected=1">';
  await db.putMaterial({ id: 'long-material', moduleId: 'english', title: payload, source: payload,
    content: ('A long learning text.\n').repeat(80) + payload + 'END OF FULL MATERIAL', status: 'completed' });
  await page.locator('#nav-english').click();
  await page.locator('#tab-upload').click();
  const trigger = page.locator('#materials-list button[title="预览"]');
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('END OF FULL MATERIAL');
  await expect(dialog.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.previewInjected)).toBeUndefined();
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('[tabindex="0"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.setViewportSize({ width: 512, height: 384 });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  for (const id of ['nav-home', 'nav-english', 'nav-stats', 'nav-calendar']) {
    await page.locator(`#${id}`).click();
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.locator('.fc-today-button')).toHaveText('今天');
  await page.reload();
  await page.waitForFunction(() => app.isReady);
  await page.locator('#nav-english').click();
  await page.locator('#tab-upload').click();
  await page.locator('#materials-list button[title="预览"]').click();
  await expect(page.getByRole('dialog')).toContainText('END OF FULL MATERIAL');
  sql.close();
});

test('settings stay reachable at 200% equivalent size and do not trigger review shortcuts', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  await page.exposeFunction('nativeInvoke', invoke);
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await db.putEntry({ moduleId: 'english', type: 'word', original: 'hello', translation: '你好', nextReview: new Date(), srsLevel: 0, interval: 0 });
  await page.evaluate(() => app.startSingleModuleReview('english'));
  await page.locator('#nav-settings').click();
  await page.setViewportSize({ width: 512, height: 384 });
  const modal = page.locator('#settings-modal');
  await expect(modal.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
  await expect(modal.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
  await page.locator('#setting-model').fill('');
  await page.locator('#setting-model').pressSequentially('model 1234');
  await expect(page.locator('#review-answer')).toBeHidden();
  expect((await db.getAllRecords()).filter(r => r.action === 'review').length).toBe(0);
  await page.locator('#setting-api-url').fill('https://example.com/v1');
  await page.locator('#setting-api-key').fill('test-only');
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#flip-btn')).toBeInViewport();
  await expect(page.locator('#nav-settings')).toBeFocused();
  await page.reload();
  await page.waitForFunction(() => app.isReady);
  await page.locator('#nav-settings').click();
  await expect(page.locator('#setting-model')).toHaveValue('model 1234');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  sql.close();
});

test('bundled fonts render Chinese, Latin and Japanese without external requests', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:1427/') ? route.continue() : route.abort());
  await page.exposeFunction('nativeInvoke', invoke);
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await db.putEntry({ id: 'japanese-font', moduleId: 'japanese', type: 'word', original: '<ruby>学習<rt>がくしゅう</rt></ruby>', translation: '学习', example: '毎日少しずつ日本語を学習しています。' });
  await page.locator('#nav-japanese').click();
  await page.locator('#tab-words').click();
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const [selector, family] of [['#page-title', 'Noto Sans SC'], ['#app-sidebar h1', 'Inter'], ['#entries-words [lang="ja"]', 'Noto Sans JP']]) {
    await expect(page.locator(selector).first()).toBeVisible();
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    expect(nodeId, selector).toBeGreaterThan(0);
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.some(font => font.familyName.includes(family) && font.isCustomFont && font.glyphCount > 0)).toBe(true);
  }
  await cdp.detach();
  sql.close();
});

test('exported backup can be restored after an application version update', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  let exported;
  await page.exposeFunction('nativeInvoke', async (command, args) => {
    if (command === 'plugin:dialog|save') return 'test-only-backup.json';
    if (command === 'plugin:fs|write_text_file') { exported = JSON.parse(Buffer.from(Object.values(args)).toString('utf8')); return; }
    if (command.startsWith('plugin:dialog')) return;
    return invoke(command, args);
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  await db.putEntry({ moduleId: 'english', original: 'keep this word', translation: '保存此词条' });
  await db.putSetting({ id: 'apiKey', value: 'test-only-secret' });
  await page.locator('#nav-settings').click();
  await page.getByRole('button', { name: '导出数据', exact: true }).click();
  await expect.poll(() => exported?.entries?.length).toBe(1);
  expect(exported.settings.some(setting => setting.id === 'apiKey')).toBe(false);
  await page.evaluate(data => dbAdapter.restoreBackup(data), exported);
  expect((await db.getAllEntries())[0].original).toBe('keep this word');
  sql.close();
});

test('legacy part-of-speech labels display in Chinese and Japanese labels can be edited', async ({ page }) => {
  const { db, sql, invoke } = fixture();
  await page.exposeFunction('nativeInvoke', invoke);
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  for (const [id, original, wordType] of [
    [1, '学習', 'Noun'], [2, '猫', ' noun '],
    [3, '読む', '五段动词（他动词）'], [4, '独自', '独自分类（自定义）'],
    [5, '静か', '形容動詞'], [6, '新しい', 'Adjective']
  ]) await db.putEntry({ id, moduleId: 'japanese', type: 'word', original, wordType });
  await page.locator('#nav-japanese').click();
  await page.locator('#tab-words').click();
  for (const [id, label] of [
    [1, '名词'], [2, '名词'],
    [3, '五段动词（他动词）'], [4, '独自分类（自定义）'],
    [5, '形容动词（な形容词）'], [6, '形容词']
  ]) await expect(page.locator(`#entry-${id}`).getByText(label, { exact: true })).toBeVisible();
  // Rendering does not rewrite stored data or infer a noun's conjugation class.
  expect((await db.getEntry(1)).wordType).toBe('Noun');
  await page.locator('#entry-1 button[title="编辑"]').click();
  await expect(page.locator('#edit-wordType')).toHaveValue('名词');
  await page.locator('#edit-wordType').fill('名词（サ变）');
  await page.locator('#entry-edit-modal').getByRole('button', { name: '保存', exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => app.isReady);
  await page.locator('#nav-japanese').click();
  await page.locator('#tab-words').click();
  await expect(page.locator('#entry-1').getByText('名词（サ变）', { exact: true })).toBeVisible();
  expect((await db.getEntry(1)).wordType).toBe('名词（サ变）');
  await db.putEntry({ id: 7, moduleId: 'german', type: 'word', original: 'Buch', wordType: 'Substantiv', gender: 'n.' });
  await page.locator('#nav-german').click();
  await page.locator('#tab-words').click();
  await page.locator('#entry-7 button[title="编辑"]').click();
  await expect(page.locator('#edit-wordType')).toHaveCount(1);
  await expect(page.locator('#edit-wordType')).toHaveValue('名词');
  await expect(page.locator('#edit-gender')).toHaveValue('n.');
  sql.close();
});

test('Japanese extraction, retry and bulk enrichment send the teaching terminology rules', async ({ page }) => {
  const { sql, invoke } = fixture();
  const requests = [];
  const word = { type: 'word', original: '学習(がくしゅう)', translation: '学习', wordType: '名词（サ变）' };
  await page.exposeFunction('nativeInvoke', (command, args) => {
    if (command !== 'request_ai') return invoke(command, args);
    requests.push(args.body);
    // An empty first response exercises the real material extraction retry path.
    const content = requests.length === 1 ? '' : JSON.stringify([word]);
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) };
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  const result = await page.evaluate(async () => {
    const settings = { apiUrl: 'https://example.com/v1', apiKey: 'test-only', model: 'test-model', maxTokens: 4000 };
    const extracted = await app.callAIForEntriesChunk('日本語を学習します。', app.modules.japanese, settings, 1, 1);
    const enriched = [{ original: '学習' }];
    await app.enrichEntriesCompleteWithAI(enriched, settings, 'japanese');
    return { extracted, enriched };
  });
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    const prompt = request.messages.find(message => message.role === 'user').content;
    for (const term of ['中文日语学习术语', '名词（サ变）', '五段动词', '一段动词', 'サ变动词', 'カ变动词', '自动词', '他动词', 'い形容词', 'な形容词']) {
      expect(prompt).toContain(term);
    }
    expect(prompt).not.toContain('以下德语教材');
    expect(request.max_tokens).toBe(4000);
  }
  expect(requests[1].messages[0].content).toContain('日语教学专家');
  expect(result.extracted[0].wordType).toBe('名词（サ变）');
  expect(result.enriched[0].wordType).toBe('名词（サ变）');
  sql.close();
});
