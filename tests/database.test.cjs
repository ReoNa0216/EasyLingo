const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support.cjs');

test('schema upgrade retains existing rows, settings and materials', async () => {
  const { db, sql } = fixture();
  await db.createTables();
  await db.putModule({ id: 'english', name: '英语', createdAt: new Date() });
  await db.putEntry({ moduleId: 'english', original: 'hello', nextReview: new Date() });
  await db.putSetting({ id: 'model', value: 'keep-me' });
  sql.exec('ALTER TABLE entries DROP COLUMN wordType; ALTER TABLE materials DROP COLUMN progress');
  await db.init();
  assert.equal((await db.getAllEntries())[0].original, 'hello');
  assert.equal((await db.getSetting('model')).value, 'keep-me');
  assert.ok(sql.prepare('PRAGMA table_info(entries)').all().some(c => c.name === 'wordType'));
  sql.close();
});

test('complete backup restores cards, history, test arrays and zero counts', async () => {
  const { db, sql } = fixture(); await db.init();
  await db.putModule({ id: 'english', name: '英语' });
  const entry = { moduleId: 'english', original: 'hello', nextReview: new Date(), createdAt: new Date() };
  await db.putEntry(entry);
  await db.putCard({ entryId: entry.id, moduleId: 'english', front: 'hello', back: '你好' });
  await db.putRecord({ moduleId: 'english', count: 0, action: 'review_detail' });
  await db.putTest({ id: 'test_1', questions: [{ question: 'hello?' }], results: [] });
  const data = { version: '2.0' };
  for (const t of ['modules','materials','entries','cards','tests','records','settings']) data[t] = await db.select(`SELECT * FROM ${t}`);
  await db.restoreBackup(JSON.parse(JSON.stringify(data)));
  assert.equal((await db.getAllCards()).length, 1);
  assert.equal((await db.getAllRecords())[0].count, 0);
  assert.equal((await db.getAllTests())[0].questions[0].question, 'hello?');
  assert.equal((await db.getAllTests())[0].totalQuestions, 1);
  assert.ok(Number.isFinite(new Date((await db.getAllEntries())[0].nextReview).getTime()));
  sql.close();
});

test('invalid or failing restore leaves prior data intact', async () => {
  const { db, sql } = fixture(); await db.init();
  await db.putModule({ id: 'english', name: 'keep' });
  await assert.rejects(db.restoreBackup({}), /完整备份/);
  const data = { version: '2.0', modules: [{ id: 'english', name: null }], materials: [], entries: [], cards: [], tests: [], records: [], settings: [] };
  await assert.rejects(db.restoreBackup(data), /NOT NULL/);
  assert.equal((await db.getModule('english')).name, 'keep');
  data.modules = [{ id: 'english', name: 'new', 'name = NULL; --': 'attack' }];
  await assert.rejects(db.restoreBackup(data), /不支持的字段/);
  assert.equal((await db.getModule('english')).name, 'keep');
  sql.close();
});

test('changing storage path only affects next startup', async () => {
  const { db, sql, storage } = fixture(); await db.init();
  const current = db.dbPath;
  await db.setCustomPath('E:/new-folder');
  assert.equal(db.dbPath, current);
  assert.equal(storage.get('polylingo_db_path'), 'E:/new-folder');
  db.resetToDefault();
  assert.equal(db.dbPath, current);
  sql.close();
});

test('module deletion removes directly added entries and their cards', async () => {
  const { db, sql } = fixture(); await db.init();
  await db.putModule({ id: 'custom_1', name: 'French' });
  const entry = { moduleId: 'custom_1', original: 'bonjour' }; await db.putEntry(entry);
  await db.putCard({ entryId: entry.id, moduleId: 'custom_1' });
  await db.putRecord({ moduleId: 'custom_1', action: 'review' });
  await db.deleteModule('custom_1');
  assert.equal((await db.getAllEntries()).length, 0);
  assert.equal((await db.getAllCards()).length, 0);
  assert.equal((await db.getAllRecords()).length, 0);
  sql.close();
});

test('legacy millisecond dates become valid ISO strings without losing review data', async () => {
  const { db, sql } = fixture(); await db.createTables();
  await db.putEntry({ original: 'legacy', nextReview: 1700000000000, createdAt: 1700000000000 });
  await db.init();
  const row = (await db.getAllEntries())[0];
  assert.equal(row.nextReview, '2023-11-14T22:13:20.000Z');
  sql.close();
});
