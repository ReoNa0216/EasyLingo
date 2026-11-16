const { test, expect } = require('@playwright/test');
const { fixture } = require('../support.cjs');

const cases = [
  { id: 'german', name: '德语', language: 'German', original: 'Buch', translation: '书', wordType: 'Substantiv', label: '名词', gender: 'n.' },
  { id: 'english', name: '英语', language: 'English', original: 'research', translation: '研究', wordType: 'Noun', label: '名词', gender: '' },
  { id: 'japanese', name: '日语', language: 'Japanese', original: '学習', translation: '学习', wordType: '名词（サ变）', label: '名词（サ变）', gender: '' },
  { id: 'custom_fr', name: '法语', language: 'French', original: 'maison', translation: '房屋', wordType: '名词（具体名词）', label: '名词（具体名词）', gender: 'f.' },
  { id: 'custom_ko', name: '韩语', language: 'Korean', original: '학교', translation: '学校', wordType: '名词（汉字词）', label: '名词（汉字词）', gender: '' },
  { id: 'custom_ja', name: '日语阅读', language: 'ja', original: '未来', translation: '未来', wordType: '名詞', label: '名词', gender: '' },
  { id: 'custom_ar', name: '阿拉伯语', language: 'Arabic', original: 'مدرسة', translation: '学校', wordType: 'اسم', label: 'اسم', gender: '阴性' },
  { id: 'custom_zh', name: '中文写作', language: '中文', original: '表达', translation: '表达意思', wordType: '动词', label: '动词', gender: '' }
];

async function openApp(page, requestAI) {
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

function response(content) {
  return { status: 200, body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) };
}

for (const languageCase of cases) {
  test(`${languageCase.language}: extraction, retry, enrichment, display, editing, review and quiz language`, async ({ page }) => {
    const c = languageCase;
    const requests = [];
    let mode = 'entry';
    let entryId;
    const example = c.id === 'custom_ja' ? '日本の首都（東京）' : `${c.original} 示例译文`;
    const entry = { type: 'word', original: c.original, translation: c.translation, wordType: c.wordType, gender: c.gender, example };
    const { db, sql } = await openApp(page, body => {
      requests.push(body);
      if (mode === 'entry') return response(requests.length === 1 ? '' : JSON.stringify([entry]));
      return response(JSON.stringify([{ entryId, question: mode === 'fill' ? '请填写：_____' : '测试题目', answer: mode === 'choice' ? 'A' : c.original,
        ...(mode === 'choice' ? { options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'] } : {}), explanation: '测试说明' }]));
    });
    const custom = c.id.startsWith('custom_');
    const customPrompt = '保留本模块词性细分类，explanation 使用 Markdown 表格。';
    if (custom) {
      await db.putModule({ id: c.id, name: c.name, language: c.language, customPrompt });
      await page.reload();
      await page.waitForFunction(() => app.isReady);
    }
    await db.putSetting({ id: 'apiKey', value: 'test-only' });
    await db.putSetting({ id: 'maxTokens', value: 4000 });
    await page.evaluate(async c => { await app.switchModule(c.id); await app.saveMaterial('language-audit.txt', c.original + ' source text'); }, c);
    const saved = (await db.getEntriesByModule(c.id))[0];
    entryId = saved.id;
    expect(saved.original).toBe(c.original);
    expect(saved.wordType).toBe(c.wordType);
    expect(saved.gender).toBe(c.gender);
    const enriched = await page.evaluate(async c => {
      const entries = [{ original: c.original }];
      await app.enrichEntriesCompleteWithAI(entries, await app.getSettings(), c.id);
      return entries[0];
    }, c);
    expect(enriched.wordType).toBe(c.wordType);
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      const prompt = request.messages[1].content;
      expect(request.max_tokens).toBe(4000);
      expect(request.messages[0].content).toContain(c.name);
      if (c.id !== 'german') {
        expect(prompt).not.toContain('德语句子');
        expect(prompt).not.toContain('Ich lese');
        expect(prompt).not.toContain('können/müssen');
      }
      if (custom) expect(prompt).toContain(customPrompt);
      if (c.id === 'custom_zh') expect(prompt).not.toContain('忽略中文');
    }
    expect(requests[2].messages[1].content).toContain(c.language === 'Japanese' || c.language === 'ja' ? '五段动词' : c.language);

    await page.locator('#tab-words').click();
    await expect(page.locator(`#entry-${saved.id}`).getByText(c.label, { exact: true })).toBeVisible();
    await page.locator(`#entry-${saved.id} button[title="编辑"]`).click();
    await expect(page.locator('#edit-wordType')).toHaveValue(c.label);
    if (c.gender) await expect(page.locator('#edit-gender')).toHaveValue(c.gender);
    await page.locator('#edit-wordType').fill(c.label + '（已核对）');
    await page.locator('#entry-edit-modal').getByRole('button', { name: '保存', exact: true }).click();
    expect((await db.getEntry(saved.id)).wordType).toBe(c.label + '（已核对）');
    await page.evaluate(id => app.startSingleModuleReview(id), c.id);
    await page.evaluate(() => app.flipCard());
    await expect(page.locator('#review-answer')).toContainText('词性：' + c.label + '（已核对）');

    for (const type of ['choice', 'fill', 'translation']) {
      mode = type;
      const questions = await page.evaluate(async ({ c, saved, type, example }) => {
        app.currentModule = c.id === 'german' ? 'english' : 'german';
        return app.callAIForTestByType([{ ...saved, example }], 1, type, await app.getSettings(), app.modules[c.id]);
      }, { c, saved, type, example });
      expect(questions).toHaveLength(1);
      const request = requests.at(-1);
      expect(request.messages[0].content).toContain(c.name);
      expect(request.messages[0].content).not.toContain('语语');
      expect(request.messages[1].content).toContain('词性: ' + c.label);
      if (custom) expect(request.messages[1].content).toContain(customPrompt);
      if (c.id === 'custom_ja') expect(request.messages[1].content).toContain(example);
    }
    sql.close();
  });
}

test('offline extraction gates German grammar; legacy gender and modal labels remain editable', async ({ page }) => {
  const { db, sql } = await openApp(page, () => { throw new Error('No API request expected'); });
  const result = await page.evaluate(cases => cases.map(c => ({ id: c.id, entries: app.extractSimpleEntries('Buch, das – Substantiv\nDie Natur ist schön. Wir gehen in der Stadt und besuchen das Kino.', c) })), cases);
  expect(result.find(r => r.id === 'german').entries.some(e => e.wordType === 'Substantiv')).toBe(true);
  for (const row of result.filter(r => r.id !== 'german')) expect(row.entries.every(e => !e.wordType && !e.gender)).toBe(true);
  await db.putEntry({ id: 100, moduleId: 'german', type: 'word', original: 'Natur', wordType: 'Substantiv', gender: 'die' });
  await page.locator('#nav-german').click();
  await page.locator('#tab-words').click();
  await page.locator('#entry-100 button[title="编辑"]').click();
  await expect(page.locator('#edit-gender')).toHaveValue('die');
  await page.locator('#entry-edit-modal').getByRole('button', { name: '保存', exact: true }).click();
  expect((await db.getEntry(100)).gender).toBe('die');
  const labels = await page.evaluate(() => ['Modalverb', 'Hilfsverb', 'Modal verb', 'Auxiliary verb', 'Determiner'].map(t => app.translateWordType(t)));
  expect(labels).toEqual(['情态动词', '助动词', '情态动词', '助动词', '限定词']);
  sql.close();
});

test('invalid choices are rejected without invented forms; local questions preserve language and whole phrases', async ({ page }) => {
  let malformed = false;
  const { sql } = await openApp(page, () => {
    const content = JSON.stringify([{ question: '选择题', options: ['A. 学校', 'B. 学校', 'C. 学校', 'D. 学校'], answer: 'A' }]);
    return response(malformed ? content.replace('选择题', '选择\n题') : content);
  });
  for (const c of cases) {
    for (const brokenJSON of [false, true]) {
      malformed = brokenJSON;
      const questions = await page.evaluate(async c => app.callAIForTestByType([{ moduleId: c.id, type: 'word', original: c.original, translation: c.translation }], 1, 'choice', { apiKey: 'test-only', apiUrl: 'https://example.com', model: 'test-only' }, c), c);
      expect(questions).toEqual([]);
    }
  }
  const result = await page.evaluate(() => {
    const german = { id: 1, moduleId: 'german', type: 'phrase', original: 'in der Stadt', translation: '在城里', example: 'Wir bleiben in einer Stadt. 我们留在一座城市。' };
    const english = { id: 2, moduleId: 'english', type: 'phrase', original: 'take part in', translation: '参加', example: 'She takes part in the event. 她参加这项活动。' };
    const japanese = { id: 3, moduleId: 'japanese', type: 'word', original: '学習(がくしゅう)', translation: '学习', example: '日本語を学習しています。 学习' };
    const single = app.generateFallbackQuestionsByType([english], 1, 'choice');
    const fill = app.generateFallbackQuestionsByType([german, english, japanese], 3, 'fill');
    const entries = ['研究', '天气', '图书馆', '音乐'].map((translation, id) => ({ id: id + 10, moduleId: 'english', type: 'word', original: ['research', 'weather', 'library', 'music'][id], translation }));
    const choices = app.generateFallbackQuestionsByType(entries, 1, 'choice');
    return { single, fill, choices };
  });
  expect(result.single).toEqual([]);
  expect(result.choices).toHaveLength(1);
  expect(result.choices[0].options.every(o => ['研究', '天气', '图书馆', '音乐'].includes(o.slice(3)))).toBe(true);
  expect(result.choices[0].language).toBe('English');
  const en = result.fill.find(q => q.moduleId === 'english');
  expect(en.answer).toBe('take part in');
  expect(en.question).not.toContain('part in');
  const de = result.fill.find(q => q.moduleId === 'german');
  expect(de.answer).toBe('in der Stadt');
  expect(de.language).toBe('German');
  const ja = result.fill.find(q => q.moduleId === 'japanese');
  expect(ja.answer).toBe('学習');
  expect(ja.question).toContain('日本語を_____しています。');
  sql.close();
});

test('mixed quick tests work offline and empty questions keep the study view usable', async ({ page }) => {
  const { db, sql, dialogs } = await openApp(page, () => { throw new Error('Offline test must not request AI'); });
  await db.putEntry({ moduleId: 'english', type: 'word', original: 'research', translation: '研究' });
  await db.putEntry({ moduleId: 'german', type: 'word', original: 'Buch', translation: '书' });
  await page.evaluate(async () => {
    await app.showQuickTestModal();
    document.querySelectorAll('.quick-test-checkbox').forEach(c => { c.checked = ['english', 'german'].includes(c.value); });
    document.getElementById('quick-test-choice').checked = false;
    document.getElementById('quick-test-fill').checked = true;
    document.getElementById('quick-test-fill-count').value = 2;
    document.getElementById('quick-test-translation').checked = false;
    await app.startQuickTest();
  });
  const questions = await page.evaluate(() => app.testData.questions);
  expect(questions).toHaveLength(2);
  expect(new Set(questions.map(q => q.language))).toEqual(new Set(['English', 'German']));
  await page.evaluate(async () => {
    await app.switchModule('english');
    document.getElementById('test-type-choice').checked = true;
    document.getElementById('test-count-choice').value = 1;
    document.getElementById('test-type-fill').checked = false;
    document.getElementById('test-type-translation').checked = false;
    await app.generateTest();
  });
  expect(dialogs.some(message => message.includes('没有生成可用题目'))).toBe(true);
  await expect(page.locator('#tab-words')).toBeVisible();
  sql.close();
});
