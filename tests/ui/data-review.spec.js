const { test, expect } = require('@playwright/test');
const { fixture } = require('../support.cjs');
test.use({ timezoneId: 'Asia/Shanghai' });

async function openApp(page, baseURL, requestAI = null) {
  const { db, sql, invoke } = fixture();
  const errors = [];
  const url = baseURL || 'http://127.0.0.1:1427';
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(`${url}/`) ? route.continue() : route.abort());
  await page.exposeFunction('nativeInvoke', async (cmd, args) => {
    if (cmd === 'request_ai' && requestAI) return requestAI(args);
    return cmd.startsWith('plugin:dialog') ? true : invoke(cmd, args);
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto(url);
  await page.waitForFunction(() => app.isReady);
  return { db, sql, errors };
}

test('review failure keeps the card retryable; subsequent rating persists once across reload', async ({ page, baseURL }) => {
  const { db, sql, errors } = await openApp(page, baseURL);
  try {
    await db.putSetting({ id: 'dailyLimit', value: 1 });
    const entry = { moduleId: 'english', type: 'word', original: 'hello', translation: '你好', nextReview: new Date(0), srsLevel: 1, interval: 1 };
    await db.putEntry(entry);
    await page.evaluate(() => app.startSingleModuleReview('english'));
    sql.exec("CREATE TRIGGER reject_rating BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'rating write failure'); END");
    const failed = await page.evaluate(async () => { try { await app.rateCard(3); } catch (error) { return { message: error.message, index: app.currentReviewIndex, busy: app.ratingInProgress }; } });
    expect(failed).toEqual({ message: expect.stringContaining('rating write failure'), index: 0, busy: false });
    expect((await db.getEntry(entry.id)).srsLevel).toBe(1);
    sql.exec('DROP TRIGGER reject_rating');
    await page.evaluate(() => Promise.all([app.rateCard(3), app.rateCard(4)]));
    await expect(page.locator('#dashboard-view')).toBeVisible();
    const updated = await db.getEntry(entry.id);
    expect(updated.srsLevel).toBe(2);
    expect(updated.interval).toBe(3);
    expect(new Date(updated.nextReview).getTime()).toBeGreaterThan(Date.now());
    expect((await db.getAllRecords()).filter(r => r.action === 'review').map(r => r.count)).toEqual([1]);
    await page.reload();
    await page.waitForFunction(() => app.isReady);
    await expect(page.locator('#english-due')).toHaveText('0');
    await expect(page.locator('#due-count')).toHaveText('1/1');
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('deduplication preserves case, senses, word classes and the studied copy', async ({ page, baseURL }) => {
  const { db, sql, errors } = await openApp(page, baseURL);
  try {
    const base = { moduleId: 'german', materialId: 'manual', type: 'word', srsLevel: 0, interval: 0, nextReview: '2020-01-01T00:00:00.000Z' };
    const entries = [
      { ...base, original: 'Laut', translation: '声音', wordType: '名词', gender: 'm.' },
      { ...base, original: 'laut', translation: '响亮的', wordType: '形容词' },
      { ...base, original: 'Bank', translation: '银行', wordType: '名词', gender: 'f.' },
      { ...base, original: 'Bank', translation: '长椅', wordType: '名词', gender: 'f.' },
      { ...base, original: 'über', translation: '在……上方', wordType: '介词' },
      { ...base, original: 'über', translation: '在……上方', wordType: '副词' },
    ];
    for (const entry of entries) await db.putEntry(entry);
    const studied = { ...entries[0], id: undefined, srsLevel: 4, interval: 14, nextReview: '2028-01-01T00:00:00.000Z' };
    await db.putEntry(studied);
    await page.evaluate(async () => { await app.switchModule('german'); await app.deduplicateEntries('word'); });
    const rows = await db.getEntriesByModule('german');
    expect(rows).toHaveLength(6);
    expect(rows.filter(e => e.original === 'Laut').map(e => [e.srsLevel, e.interval, e.nextReview])).toEqual([[4, 14, '2028-01-01T00:00:00.000Z']]);
    for (const entry of entries) expect(rows.some(e => e.original === entry.original && e.translation === entry.translation && e.wordType === entry.wordType)).toBe(true);
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('retrying the same material retains manual edits, review state and distinct senses without duplicates', async ({ page, baseURL }) => {
  let result = [
    { original: 'bank', translation: '银行', wordType: '名词', type: 'word', explanation: '金融机构' },
    { original: 'bank', translation: '河岸', wordType: '名词', type: 'word', explanation: '河流边缘' },
    { original: 'Bank', translation: '专名', wordType: '名词', type: 'word' },
  ];
  const { db, sql, errors } = await openApp(page, baseURL, () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }) }));
  try {
    await db.putSetting({ id: 'apiKey', value: 'test-only' });
    const material = { id: 'retry_audit', moduleId: 'english', title: 'retries', content: 'bank Bank river', status: 'error' };
    await db.putMaterial(material);
    await page.evaluate(async material => { await app.switchModule('english'); await app.processMaterialWithAI(material); }, material);
    let rows = await db.getEntriesByMaterial(material.id);
    expect(rows).toHaveLength(3);
    const edited = rows.find(e => e.translation === '银行');
    await db.updateEntry(edited.id, { translation: '银行（手动核对）', explanation: '自己的笔记', wordType: '名词（可数）', srsLevel: 3, interval: 7, nextReview: '2028-03-01T00:00:00.000Z' });
    result = result.map(e => ({ ...e, explanation: '第二次AI改写' })).concat({ original: 'river', translation: '河流', wordType: '名词', type: 'word' });
    await page.evaluate(material => app.processMaterialWithAI(material), material);
    await page.evaluate(material => app.processMaterialWithAI(material), material);
    rows = await db.getEntriesByMaterial(material.id);
    expect(rows).toHaveLength(4);
    expect(rows.find(e => e.id === edited.id)).toMatchObject({ translation: '银行（手动核对）', explanation: '自己的笔记', wordType: '名词（可数）', srsLevel: 3, interval: 7, nextReview: '2028-03-01T00:00:00.000Z' });
    expect(rows.some(e => e.original === 'bank' && e.translation === '河岸')).toBe(true);
    expect((await db.getMaterial(material.id)).entryCount).toBe(4);
    expect((await db.getMaterial(material.id)).status).toBe('completed');
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('material retry deduplicates English entries after correcting reversed original and translation', async ({ page, baseURL }) => {
  const response = [{ type: 'word', original: '你好', translation: 'hello', wordType: '感叹词' }];
  const { db, sql, errors } = await openApp(page, baseURL, () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }) }));
  try {
    await db.putSetting({ id: 'apiKey', value: 'test-only' });
    const material = { id: 'retry_reversed', moduleId: 'english', title: 'reversed response', content: 'hello', status: 'error' };
    await db.putMaterial(material);
    await page.evaluate(async material => { await app.switchModule('english'); await app.processMaterialWithAI(material); await app.processMaterialWithAI(material); }, material);
    const rows = await db.getEntriesByMaterial(material.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ original: 'hello', translation: '你好' });
    expect((await db.getMaterial(material.id)).entryCount).toBe(1);
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('saved legacy AI failure messages are excluded from local questions and distractors', async ({ page, baseURL }) => {
  const { db, sql, errors } = await openApp(page, baseURL);
  try {
    for (const [original, translation] of [['hello', '你好'], ['book', '书'], ['river', '河流'], ['bread', '面包'], ['failed_word', '（AI补全失败: AI请求失败（HTTP 401））']]) {
      await db.putEntry({ moduleId: 'english', type: 'word', original, translation });
    }
    const questions = await page.evaluate(async () => {
      const entries = await dbAdapter.getEntriesByModule('english');
      const results = {};
      for (const type of ['choice', 'fill', 'translation']) results[type] = app.generateFallbackQuestionsByType(entries, 10, type);
      return results;
    });
    for (const type of ['choice', 'fill', 'translation']) {
      expect(questions[type]).toHaveLength(4);
      expect(JSON.stringify(questions[type])).not.toContain('AI补全失败');
      expect(JSON.stringify(questions[type])).not.toContain('failed_word');
    }
    expect((await db.getAllEntries()).length).toBe(5);
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('monthly statistics show each of the last 12 months once when today is the 31st', async ({ page, baseURL }) => {
  await page.clock.install({ time: new Date('2026-03-31T04:00:00.000Z') });
  const { db, sql, errors } = await openApp(page, baseURL);
  try {
    await db.putRecord({ moduleId: 'english', action: 'review', duration: 7, count: 3, createdAt: new Date('2026-02-15T12:00:00') });
    await page.evaluate(async () => {
      await app.showStats();
      document.getElementById('trend-view-select').value = 'months';
      await app.updateTrendChart();
    });
    const chart = await page.evaluate(() => ({ labels: app.charts.trend.data.labels, values: app.charts.trend.data.datasets[0].data }));
    expect(chart.labels).toHaveLength(12);
    expect(new Set(chart.labels).size).toBe(12);
    expect(chart.labels[0]).toBe('2025/4');
    expect(chart.labels[11]).toBe('2026/3');
    expect(chart.values[chart.labels.indexOf('2026/2')]).toBe(7);
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});

test('review records use the local calendar day and detail rows do not double-count totals', async ({ page, baseURL }) => {
  await page.clock.install({ time: new Date('2026-11-16T16:15:00.000Z') });
  const { db, sql, errors } = await openApp(page, baseURL);
  try {
    const timestamp = '2026-11-16T16:10:00.000Z';
    const today = await page.evaluate(value => app.localDate(value), timestamp);
    for (const row of [
      { moduleId: null, action: 'review', duration: 9, count: 4 },
      { moduleId: 'english', action: 'review_detail', duration: 5, count: 0 },
      { moduleId: 'german', action: 'review_detail', duration: 4, count: 0 },
    ]) await db.putRecord({ ...row, date: today, createdAt: timestamp });
    await page.evaluate(async () => { await app.loadDashboard(); await app.updateSidebarStats(); });
    expect(today).toBe('2026-11-17');
    expect(await page.evaluate(() => app.localDate())).toBe(today);
    await expect(page.locator('#today-minutes')).toHaveText('9分钟');
    await expect(page.locator('#due-count')).toHaveText('4/20');
    const filtered = await page.evaluate(async () => {
      const records = await dbAdapter.getAllRecords();
      return { all: app.getFilteredRecords(records, 'all').map(r => r.duration), english: app.getFilteredRecords(records, 'english').map(r => r.duration) };
    });
    expect(filtered).toEqual({ all: [9], english: [5] });
    await page.evaluate(() => app.showStats());
    await expect(page.locator('#stat-total-time')).toHaveText('0.2小时');
    expect(errors).toEqual([]);
  } finally { sql.close(); }
});
