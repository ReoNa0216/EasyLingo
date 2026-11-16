const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function fixture() {
  const sql = new DatabaseSync(':memory:');
  const storage = new Map();
  const invoke = async (command, args) => {
    args = JSON.parse(JSON.stringify(args));
    if (command === 'plugin:sql|load' || command === 'ensure_dir') return;
    if (command === 'plugin:sql|select') return sql.prepare(args.query).all(...args.values);
    if (command === 'plugin:sql|execute') {
      const r = sql.prepare(args.query).run(...args.values);
      return { lastInsertId: Number(r.lastInsertRowid), rowsAffected: r.changes };
    }
    if (command === 'database_batch') {
      sql.exec('BEGIN');
      try {
        for (const s of args.statements) sql.prepare(s.query).run(...s.values);
        sql.exec('COMMIT');
      } catch (e) { sql.exec('ROLLBACK'); throw e; }
    }
  };
  const context = vm.createContext({ window: { __TAURI__: { core: { invoke } } }, console, Date, setTimeout,
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } });
  vm.runInContext(fs.readFileSync('src/db-adapter.js', 'utf8') + '\nglobalThis.db = dbAdapter;', context);
  return { db: context.db, sql, storage, invoke };
}

module.exports = { fixture };
