const { test, expect } = require('@playwright/test');
const { fixture } = require('../support.cjs');

async function openApp(page, requestAI = () => { throw new Error('Unexpected AI call'); }) {
  const context = fixture();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:1427/') ? route.continue() : route.abort());
  await page.exposeFunction('nativeInvoke', (command, args) => {
    if (command === 'request_ai') return requestAI(args.body);
    if (command === 'plugin:dialog|message') { dialogs.push(args.options.message); return; }
    if (command === 'plugin:dialog|ask') return true;
    return context.invoke(command, args);
  });
  await page.addInitScript(() => { window.__TAURI__ = { core: { invoke: (...args) => window.nativeInvoke(...args) } }; });
  await page.goto('http://127.0.0.1:1427');
  await page.waitForFunction(() => app.isReady);
  return { ...context, dialogs };
}
const response = content => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });

test('fill grading preserves articles and records the test module rather than the visible module', async ({ page }) => {
  const { sql } = await openApp(page);
  await page.evaluate(async () => {
    await app.switchModule('german');
    app.testData = { moduleId: null, answers: {}, questions: [
      { type: 'fill', moduleId: 'german', language: 'German', question: 'Ich sehe _____ (dieses bestimmte Haus).', answer: 'das Haus' },
      { type: 'fill', moduleId: 'english', language: 'English', question: 'Give me _____ (a particular book).', answer: 'the book' },
      { type: 'translation', moduleId: 'english', language: 'English', question: '翻译：我喜欢阅读。', answer: 'I enjoy reading.' }
    ] };
    app.showTest();
  });
  await page.locator('[name=q0]').fill('ein Haus');
  await page.locator('[name=q1]').fill('a book');
  await page.locator('[name=q2]').fill('I like reading.');
  await page.evaluate(() => app.submitTest());
  const saved = await page.evaluate(() => dbAdapter.getAllTests());
  expect.soft(saved[0].score).toBe(0);
  expect.soft(saved[0].moduleId).toBeNull();
  expect.soft(saved[0].results[2].isCorrect).toBeNull();
  await page.evaluate(() => app.submitTest());
  expect(await page.evaluate(async () => (await dbAdapter.getAllTests()).length)).toBe(1);
  sql.close();
});

test('partial and reordered enrichment never duplicates or replaces the requested words', async ({ page }) => {
  const { sql } = await openApp(page, () => response(JSON.stringify([
    { original: 'bird', translation: '鸟', wordType: '名词' },
    { original: 'cat', translation: '猫', wordType: '名词' }
  ])));
  const entries = await page.evaluate(async () => {
    const entries = ['cat', 'dog', 'bird'].map(original => ({ original, translation: '' }));
    try { await app.enrichEntriesCompleteWithAI(entries, { apiKey: 'test-only', apiUrl: 'https://example.com', model: 'test' }, 'english'); } catch (_) {}
    return entries;
  });
  expect.soft(entries.map(e => e.original)).toEqual(['cat', 'dog', 'bird']);
  expect.soft(entries.find(e => e.original === 'cat')?.translation).toBe('猫');
  expect.soft(entries.find(e => e.original === 'bird')?.translation).toBe('鸟');
  expect.soft(entries.find(e => e.original === 'dog')?.translation).toBe('');
  sql.close();
});

test('exhausted AI enrichment does not turn an error into a vocabulary translation', async ({ page }) => {
  const { sql } = await openApp(page, () => ({ status: 503, body: 'unavailable' }));
  const result = await page.evaluate(async () => {
    const entries = [{ original: 'research', translation: '' }];
    try { await app.enrichEntriesCompleteWithAI(entries, { apiKey: 'test-only', apiUrl: 'https://example.com', model: 'test' }, 'english'); } catch (_) {}
    return { entries, questions: app.generateFallbackQuestionsByType(entries.map((e, i) => ({ ...e, id: i + 1, moduleId: 'english' })), 1, 'translation') };
  });
  expect.soft(result.entries[0].translation).toBe('');
  expect.soft(result.questions).toHaveLength(0);
  sql.close();
});

test('malformed or failed retry responses leave the material visibly failed', async ({ page }) => {
  let mode = 'malformed';
  let count = 0;
  const { db, sql } = await openApp(page, () => {
    count++;
    if (mode === 'malformed') return response('This is not a JSON response.');
    return count === 1 ? response('') : { status: 503, body: 'unavailable' };
  });
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  for (const value of ['malformed', 'retry-failure']) {
    mode = value; count = 0;
    await page.evaluate(async value => { await app.switchModule('english'); await app.saveMaterial(value + '.txt', 'Research is important.'); }, value);
    const material = (await db.getMaterialsByModule('english')).find(m => m.title === value + '.txt');
    expect.soft(material.status).toBe('error');
    expect.soft(material.errorMsg).toBeTruthy();
  }
  sql.close();
});

test('uploaded source text retains characters beyond fifty thousand', async ({ page }) => {
  const { db, sql } = await openApp(page);
  const source = 'An example sentence.\n'.repeat(2600) + 'TAIL_SENTINEL';
  await page.evaluate(async source => { await app.switchModule('english'); await app.saveMaterial('long-source.txt', source); }, source);
  const material = (await db.getMaterialsByModule('english'))[0];
  expect.soft(material.content.length).toBe(source.length);
  expect.soft(material.content.endsWith('TAIL_SENTINEL')).toBe(true);
  sql.close();
});

test('retrying a partially extracted news article retains one material and one copy of each entry', async ({ page }) => {
  let request = 0;
  const { db, sql } = await openApp(page, () => {
    request++;
    if (request === 2) return { status: 503, body: 'unavailable' };
    return response(JSON.stringify([{ type: 'word', original: request === 4 ? 'weather' : 'research', translation: request === 4 ? '天气' : '研究' }]));
  });
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => {
    await app.switchModule('english');
    app.nprCurrentArticle = { title: 'Retry sample', content: 'Research is important. '.repeat(150), link: 'https://example.com/audit-news' };
    await app.processNewsContent('npr', 'english', 'NPR');
  });
  expect((await db.getMaterialsByModule('english'))[0].status).toBe('error');
  expect(await page.evaluate(() => !!app.nprCurrentArticle)).toBe(true);
  await page.evaluate(() => app.processNewsContent('npr', 'english', 'NPR'));
  const materials = await db.getMaterialsByModule('english');
  const entries = await db.getEntriesByModule('english');
  expect.soft(materials).toHaveLength(1);
  expect.soft(materials[0].status).toBe('completed');
  expect.soft(entries.filter(e => e.original === 'research')).toHaveLength(1);
  expect.soft(entries.filter(e => e.original === 'weather')).toHaveLength(1);
  expect(await page.evaluate(() => app.nprCurrentArticle)).toBeNull();
  sql.close();
});

test('bulk import stays attached to its starting module when navigation changes during AI work', async ({ page }) => {
  let release;
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  const { db, sql } = await openApp(page, () => new Promise(resolve => {
    release = () => resolve(response(JSON.stringify([{ original: 'research', translation: '研究', wordType: '名词' }])));
    started();
  }));
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => {
    await app.switchModule('english');
    document.getElementById('bulk-import-text').value = 'research';
    window.bulkAuditDone = app.bulkImportVocabulary();
  });
  await entered;
  await page.evaluate(() => app.switchModule('german'));
  release();
  await page.evaluate(() => window.bulkAuditDone);
  expect(await db.getEntriesByModule('german')).toHaveLength(0);
  const entries = await db.getEntriesByModule('english');
  expect(entries).toHaveLength(1);
  expect(entries[0].original).toBe('research');
  sql.close();
});

test('AI question attribution excludes the actual tested entry from later question types', async ({ page }) => {
  const { db, sql } = await openApp(page);
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  const result = await page.evaluate(async () => {
    const oldRandom = Math.random;
    Math.random = () => 0.5;
    const entries = [
      { id: 'a', moduleId: 'english', type: 'word', original: 'cat', translation: '猫' },
      { id: 'b', moduleId: 'english', type: 'word', original: 'dog', translation: '狗' },
      { id: 'c', moduleId: 'english', type: 'word', original: 'bird', translation: '鸟' }
    ];
    const calls = [];
    const original = app.callAIForTestByType;
    app.callAIForTestByType = async (selected, count, type) => {
      calls.push(selected.map(e => e.id));
      const entry = selected.find(e => e.id === 'b') || selected[0];
      return [{ entryId: entry.id, type, question: type === 'fill' ? '_____' : '请翻译', answer: entry.original }];
    };
    try {
      const questions = await app.generateQuestionsFromEntriesByType(entries, { fill: 1, translation: 1 });
      return { calls, questions };
    } finally { app.callAIForTestByType = original; Math.random = oldRandom; }
  });
  expect.soft(result.calls[1]).not.toContain('b');
  expect.soft(new Set(result.questions.map(q => q.answer)).size).toBe(2);
  sql.close();
});

test('insufficient multiple-choice data does not silently become extra fill questions', async ({ page }) => {
  const { sql } = await openApp(page);
  const questions = await page.evaluate(() => app.generateQuestionsFromEntriesByType([
    { id: 1, moduleId: 'english', type: 'word', original: 'cat', translation: '猫' },
    { id: 2, moduleId: 'english', type: 'word', original: 'dog', translation: '狗' },
    { id: 3, moduleId: 'english', type: 'word', original: 'bird', translation: '鸟' }
  ], { choice: 1, fill: 1 }));
  expect(questions.filter(q => q.type === 'fill')).toHaveLength(1);
  expect(questions.filter(q => q.type === 'choice')).toHaveLength(0);
  sql.close();
});

test('AI questions bind to a real source entry and reject duplicate or unknown attribution', async ({ page }) => {
  const { sql } = await openApp(page, () => response('```json\n' + JSON.stringify([
    { entryId: 11, question: '填入词语：_____', answer: 'research' },
    { entryId: 11, question: '再次填入：_____', answer: 'research' },
    { entryId: 999, question: '不属于材料：_____', answer: 'invented' }
  ]) + '\n```'));
  const questions = await page.evaluate(() => app.callAIForTestByType([
    { id: 11, moduleId: 'english', type: 'word', original: 'research', translation: '研究' },
    { id: 12, moduleId: 'english', type: 'word', original: 'weather', translation: '天气' }
  ], 3, 'fill', { apiKey: 'test-only', apiUrl: 'https://example.com', model: 'test' }, 'english'));
  expect(questions).toHaveLength(1);
  expect(questions[0].entryId).toBe(11);
  sql.close();
});

test('pending test generation keeps its starting module and ignores a second start', async ({ page }) => {
  let release;
  let started;
  let requests = 0;
  let entryId;
  const entered = new Promise(resolve => { started = resolve; });
  const { db, sql } = await openApp(page, () => new Promise(resolve => {
    requests++;
    release = () => resolve(response(JSON.stringify([{ entryId, question: '请填写：_____', answer: 'research' }])));
    started();
  }));
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  const entry = { moduleId: 'english', type: 'word', original: 'research', translation: '研究' };
  await db.putEntry(entry);
  entryId = entry.id;
  await page.evaluate(async () => {
    await app.switchModule('english');
    document.getElementById('test-type-choice').checked = false;
    document.getElementById('test-type-fill').checked = true;
    document.getElementById('test-count-fill').value = 1;
    document.getElementById('test-type-translation').checked = false;
    window.quizAuditDone = app.generateTest();
    window.quizAuditSecond = app.generateTest();
  });
  await entered;
  await page.evaluate(() => app.switchModule('german'));
  release();
  await page.evaluate(() => Promise.all([window.quizAuditDone, window.quizAuditSecond]));
  expect(requests).toBe(1);
  const testData = await page.evaluate(() => app.testData);
  expect(testData.moduleId).toBe('english');
  expect(testData.questions[0].moduleId).toBe('english');
  expect(testData.questions[0].language).toBe('English');
  sql.close();
});

test('provider output truncation is surfaced as an incomplete material extraction', async ({ page }) => {
  const { db, sql } = await openApp(page, () => ({ status: 200, body: JSON.stringify({ choices: [{
    message: { content: '[{"type":"word","original":"research","translation":"研究"},' }, finish_reason: 'length'
  }] }) }));
  await db.putSetting({ id: 'apiKey', value: 'test-only' });
  await page.evaluate(async () => { await app.switchModule('english'); await app.saveMaterial('truncated-response.txt', 'Research and weather are discussed.'); });
  const material = (await db.getMaterialsByModule('english'))[0];
  expect.soft(material.status).toBe('error');
  expect.soft(material.errorMsg).toBeTruthy();
  sql.close();
});
