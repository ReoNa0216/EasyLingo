const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support.cjs');

async function backup(db) {
  const data = { version: '2.0' };
  for (const table of ['modules', 'materials', 'entries', 'cards', 'tests', 'records', 'settings']) {
    data[table] = await db.select(`SELECT * FROM ${table}`);
  }
  return JSON.parse(JSON.stringify(data));
}

async function learningData(db) {
  await db.init();
  for (const moduleId of ['english', 'custom_fr']) {
    await db.putModule({ id: moduleId, name: moduleId });
    await db.putMaterial({ id: `material_${moduleId}`, moduleId, content: 'kept source', status: 'completed' });
    const entry = { moduleId, materialId: `material_${moduleId}`, original: moduleId === 'english' ? 'hello' : 'bonjour', translation: '你好', nextReview: new Date('2026-01-01'), srsLevel: 2, interval: 3 };
    await db.putEntry(entry);
    // Historical cards may link only by entryId; restoreBackup accepts this shape.
    await db.putCard({ entryId: entry.id, front: entry.original, back: entry.translation });
    await db.putRecord({ moduleId, entryId: entry.id, action: 'review', count: 1, duration: 2, createdAt: new Date('2026-01-01') });
  }
  return db.getAllEntries();
}

for (const deletion of ['entry', 'material', 'module']) {
  test(`${deletion} deletion removes linked legacy cards and the next backup remains restorable`, async () => {
    const { db, sql } = fixture();
    try {
      const [entry, other] = await learningData(db);
      // Exercise the same accepted historical data through a full restore first.
      await db.restoreBackup(await backup(db));
      if (deletion === 'entry') await db.deleteEntry(entry.id);
      else if (deletion === 'material') await db.deleteMaterial(entry.materialId);
      else await db.deleteModule(entry.moduleId);
      assert.equal(await db.getEntry(entry.id), null);
      assert.equal((await db.getCardsByEntry(entry.id)).length, 0);
      assert.equal((await db.getCardsByEntry(other.id)).length, 1);
      assert.equal((await db.getEntry(other.id)).original, 'bonjour');
      if (deletion !== 'module') assert.equal((await db.getAllRecords()).length, 2, 'entry removal preserves historical study totals');
      await db.restoreBackup(await backup(db));
      assert.equal((await db.getAllEntries()).length, 1);
    } finally { sql.close(); }
  });
}

test('failed entry deletion rolls back both the entry and its cards', async () => {
  const { db, sql } = fixture();
  try {
    const [entry] = await learningData(db);
    await db.updateMaterial(entry.materialId, { entryCount: 1 });
    sql.exec("CREATE TRIGGER reject_entry_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'forced deletion failure'); END");
    await assert.rejects(db.deleteEntry(entry.id), /forced deletion failure/);
    assert.equal((await db.getEntry(entry.id)).original, 'hello');
    assert.equal((await db.getCardsByEntry(entry.id)).length, 1);
    assert.equal((await db.getMaterial(entry.materialId)).entryCount, 1);
  } finally { sql.close(); }
});

test('entry deletion updates only its own material count, including bulk removal', async () => {
  const { db, sql } = fixture();
  try {
    const [entry, other] = await learningData(db);
    await db.putEntry({ moduleId: entry.moduleId, materialId: entry.materialId, original: 'second entry' });
    await db.updateMaterial(entry.materialId, { entryCount: 2 });
    await db.updateMaterial(other.materialId, { entryCount: 1 });
    await db.deleteEntry(entry.id);
    assert.equal((await db.getMaterial(entry.materialId)).entryCount, 1);
    assert.equal((await db.getMaterial(other.materialId)).entryCount, 1);
    await db.deleteEntriesByMaterial(entry.materialId);
    assert.equal((await db.getMaterial(entry.materialId)).entryCount, 0);
    assert.equal((await db.getMaterial(other.materialId)).entryCount, 1);
    assert.equal((await db.getAllEntries()).length, 1);
    await db.restoreBackup(await backup(db));
  } finally { sql.close(); }
});

test('restoring a backup twice preserves IDs, dates, multilingual text and review state', async () => {
  const { db, sql } = fixture();
  try {
    const [entry] = await learningData(db);
    await db.updateEntry(entry.id, { original: '学習 / مدرسة / maison', gender: 'f.', wordType: '名词（具体名词）', explanation: '| 词 | 义 |\n|---|---|\n|学習|学习|', example: '<ruby>学習<rt>がくしゅう</rt></ruby>', nextReview: new Date('2026-12-12T10:20:30.000Z') });
    await db.putTest({ id: 'test_mixed', moduleId: null, score: 50, questions: [{ type: 'translation', question: '学習', answer: '学习', language: 'Japanese' }], results: [{ question: { type: 'translation', question: '学習' }, isCorrect: false }], answers: { 0: '学习' } });
    const original = await backup(db);
    await db.restoreBackup(original);
    await db.restoreBackup(await backup(db));
    assert.deepEqual(await backup(db), original);
    const newEntry = { moduleId: 'english', original: 'new after restore' };
    await db.putEntry(newEntry);
    assert.ok(newEntry.id > Math.max(...original.entries.map(e => e.id)));
    assert.equal((await db.getEntry(entry.id)).srsLevel, 2);
  } finally { sql.close(); }
});

test('invalid references, duplicate IDs and late restore failures leave every prior table intact', async () => {
  const { db, sql } = fixture();
  try {
    await learningData(db);
    await db.putSetting({ id: 'model', value: 'demo-only' });
    const original = await backup(db);
    const mutations = [
      data => { data.entries[0].moduleId = 'missing_module'; },
      data => { data.cards[0].entryId = 999999; },
      data => { data.entries[1].id = data.entries[0].id; },
      data => { data.tests.push({ id: 'bad_test', questions: '["not an object"]' }); },
    ];
    for (const mutate of mutations) {
      const invalid = structuredClone(original); mutate(invalid);
      await assert.rejects(db.restoreBackup(invalid));
      assert.deepEqual(await backup(db), original);
    }
    sql.exec("CREATE TRIGGER reject_setting_insert BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'late restore failure'); END");
    await assert.rejects(db.restoreBackup(original), /late restore failure/);
    assert.deepEqual(await backup(db), original);
  } finally { sql.close(); }
});

test('all declared legacy schema upgrades are repeatable without losing stored study data', async () => {
  const { db, sql } = fixture();
  try {
    const [entry] = await learningData(db);
    await db.putTest({ id: 'old_test', moduleId: 'english', score: 85, answers: { 0: 'A' } });
    await db.putSetting({ id: 'dailyLimit', value: 15 });
    const missing = {
      entries: ['wordType', 'example', 'srsLevel'],
      materials: ['sourceFile', 'source', 'progress', 'partialCount'],
      tests: ['duration', 'questions', 'results'],
      records: ['count'],
    };
    for (const [table, columns] of Object.entries(missing)) {
      for (const column of columns) sql.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
    await db.init();
    await db.init();
    for (const [table, columns] of Object.entries(missing)) {
      const actual = sql.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      for (const column of columns) assert.ok(actual.includes(column), `${table}.${column}`);
    }
    assert.equal((await db.getEntry(entry.id)).original, 'hello');
    assert.equal((await db.getEntry(entry.id)).interval, 3);
    assert.equal((await db.getEntry(entry.id)).nextReview, '2026-01-01T00:00:00.000Z');
    assert.equal((await db.getMaterial(entry.materialId)).content, 'kept source');
    assert.equal((await db.getTest('old_test')).score, 85);
    assert.equal((await db.getTest('old_test')).answers[0], 'A');
    assert.equal((await db.getSetting('dailyLimit')).value, '15');
    assert.equal((await db.getAllCards()).length, 2);
    assert.equal((await db.getAllRecords()).length, 2);
  } finally { sql.close(); }
});
