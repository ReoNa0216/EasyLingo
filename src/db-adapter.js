/**
 * SQLite 数据库适配器
 * 封装 Tauri SQL Plugin，提供与 IndexedDB 类似的 API
 */

class DatabaseAdapter {
  constructor() {
    this.db = null;
    this.dbPath = 'sqlite:polylingo.db';
  }

  async init() {
    const { Database } = window.__TAURI__.sql;
    this.db = await Database.load(this.dbPath);
    await this.createTables();
    console.log('[DB] SQLite 初始化完成');
  }

  async createTables() {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        language TEXT,
        code TEXT,
        flag TEXT,
        customPrompt TEXT,
        isDefault INTEGER DEFAULT 0,
        createdAt TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        moduleId TEXT,
        title TEXT,
        content TEXT,
        status TEXT,
        createdAt TEXT,
        entryCount INTEGER DEFAULT 0,
        errorMsg TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        materialId TEXT,
        moduleId TEXT,
        original TEXT,
        translation TEXT,
        type TEXT,
        level INTEGER,
        gender TEXT,
        tags TEXT,
        explanation TEXT,
        createdAt TEXT,
        nextReview TEXT,
        interval INTEGER DEFAULT 0,
        repetition INTEGER DEFAULT 0,
        efactor REAL DEFAULT 2.5,
        status TEXT DEFAULT 'new'
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entryId INTEGER,
        moduleId TEXT,
        materialId TEXT,
        front TEXT,
        back TEXT,
        createdAt TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        moduleId TEXT,
        score INTEGER,
        totalQuestions INTEGER,
        createdAt TEXT,
        answers TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        moduleId TEXT,
        entryId INTEGER,
        action TEXT,
        duration INTEGER,
        date TEXT,
        createdAt TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  // modules
  async getModule(id) {
    const rows = await this.db.select("SELECT * FROM modules WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllModules() {
    return await this.db.select("SELECT * FROM modules");
  }

  async putModule(module) {
    const { id, name, language, code, flag, customPrompt, isDefault, createdAt } = module;
    await this.db.execute(
      "INSERT OR REPLACE INTO modules (id, name, language, code, flag, customPrompt, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, name, language, code, flag, customPrompt, isDefault ? 1 : 0, createdAt]
    );
  }

  async deleteModule(id) {
    await this.db.execute("DELETE FROM modules WHERE id = ?", [id]);
  }

  async updateModule(id, changes) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(changes)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.db.execute(`UPDATE modules SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  // materials
  async getMaterial(id) {
    const rows = await this.db.select("SELECT * FROM materials WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getMaterialsByModule(moduleId) {
    return await this.db.select("SELECT * FROM materials WHERE moduleId = ?", [moduleId]);
  }

  async putMaterial(material) {
    const { id, moduleId, title, content, status, createdAt, entryCount, errorMsg } = material;
    await this.db.execute(
      "INSERT OR REPLACE INTO materials (id, moduleId, title, content, status, createdAt, entryCount, errorMsg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, moduleId, title, content, status, createdAt, entryCount || 0, errorMsg]
    );
  }

  async updateMaterial(id, changes) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(changes)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.db.execute(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  async deleteMaterial(id) {
    await this.db.execute("DELETE FROM materials WHERE id = ?", [id]);
  }

  async deleteMaterialsByModule(moduleId) {
    await this.db.execute("DELETE FROM materials WHERE moduleId = ?", [moduleId]);
  }

  // entries
  async getEntry(id) {
    const rows = await this.db.select("SELECT * FROM entries WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getEntriesByModule(moduleId) {
    return await this.db.select("SELECT * FROM entries WHERE moduleId = ?", [moduleId]);
  }

  async getEntriesByMaterial(materialId) {
    return await this.db.select("SELECT * FROM entries WHERE materialId = ?", [materialId]);
  }

  async getAllEntries() {
    return await this.db.select("SELECT * FROM entries");
  }

  async putEntry(entry) {
    if (entry.id) {
      const { id, ...rest } = entry;
      const cols = Object.keys(rest);
      const placeholders = cols.map(() => '?').join(',');
      const values = Object.values(rest);
      await this.db.execute(
        `INSERT INTO entries (id, ${cols.join(',')}) VALUES (?, ${placeholders})`,
        [id, ...values]
      );
    } else {
      const cols = Object.keys(entry);
      const placeholders = cols.map(() => '?').join(',');
      const values = Object.values(entry);
      const result = await this.db.execute(
        `INSERT INTO entries (${cols.join(',')}) VALUES (${placeholders})`,
        values
      );
      entry.id = result.lastInsertId;
    }
  }

  async updateEntry(id, changes) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(changes)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.db.execute(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  async deleteEntry(id) {
    await this.db.execute("DELETE FROM entries WHERE id = ?", [id]);
  }

  async deleteEntriesByMaterial(materialId) {
    await this.db.execute("DELETE FROM entries WHERE materialId = ?", [materialId]);
  }

  async getDueEntries(moduleId, date) {
    return await this.db.select(
      "SELECT * FROM entries WHERE moduleId = ? AND nextReview <= ? AND status != 'mastered'",
      [moduleId, date]
    );
  }

  async countEntriesByModule(moduleId) {
    const rows = await this.db.select("SELECT COUNT(*) as count FROM entries WHERE moduleId = ?", [moduleId]);
    return rows[0]?.count || 0;
  }

  async filterEntries(predicate) {
    const all = await this.getAllEntries();
    return all.filter(predicate);
  }

  // cards
  async getCardsByEntry(entryId) {
    return await this.db.select("SELECT * FROM cards WHERE entryId = ?", [entryId]);
  }

  async putCard(card) {
    const { entryId, moduleId, materialId, front, back, createdAt } = card;
    await this.db.execute(
      "INSERT INTO cards (entryId, moduleId, materialId, front, back, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      [entryId, moduleId, materialId, front, back, createdAt]
    );
  }

  async deleteCardsByMaterial(materialId) {
    await this.db.execute("DELETE FROM cards WHERE materialId = ?", [materialId]);
  }

  // tests
  async getTest(id) {
    const rows = await this.db.select("SELECT * FROM tests WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllTests() {
    return await this.db.select("SELECT * FROM tests");
  }

  async putTest(test) {
    const { id, moduleId, score, totalQuestions, createdAt, answers } = test;
    await this.db.execute(
      "INSERT OR REPLACE INTO tests (id, moduleId, score, totalQuestions, createdAt, answers) VALUES (?, ?, ?, ?, ?, ?)",
      [id, moduleId, score, totalQuestions, createdAt, JSON.stringify(answers)]
    );
  }

  async deleteTest(id) {
    await this.db.execute("DELETE FROM tests WHERE id = ?", [id]);
  }

  // records
  async getAllRecords() {
    return await this.db.select("SELECT * FROM records");
  }

  async putRecord(record) {
    const { moduleId, entryId, action, duration, date, createdAt } = record;
    await this.db.execute(
      "INSERT INTO records (moduleId, entryId, action, duration, date, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      [moduleId, entryId, action, duration, date, createdAt]
    );
  }

  async getRecordsByDate(date) {
    return await this.db.select("SELECT * FROM records WHERE date = ?", [date]);
  }

  async deleteRecord(id) {
    await this.db.execute("DELETE FROM records WHERE id = ?", [id]);
  }

  // settings
  async getSetting(id) {
    const rows = await this.db.select("SELECT * FROM settings WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllSettings() {
    return await this.db.select("SELECT * FROM settings");
  }

  async putSetting(setting) {
    const { id, value } = setting;
    await this.db.execute(
      "INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)",
      [id, typeof value === 'object' ? JSON.stringify(value) : String(value)]
    );
  }

  async deleteSetting(id) {
    await this.db.execute("DELETE FROM settings WHERE id = ?", [id]);
  }

  // bulk operations
  async bulkPut(table, items) {
    for (const item of items) {
      if (table === 'modules') await this.putModule(item);
      else if (table === 'materials') await this.putMaterial(item);
      else if (table === 'entries') await this.putEntry(item);
      else if (table === 'tests') await this.putTest(item);
      else if (table === 'settings') await this.putSetting(item);
    }
  }

  // clear all
  async clearAll() {
    await this.db.execute("DELETE FROM modules");
    await this.db.execute("DELETE FROM materials");
    await this.db.execute("DELETE FROM entries");
    await this.db.execute("DELETE FROM cards");
    await this.db.execute("DELETE FROM tests");
    await this.db.execute("DELETE FROM records");
    await this.db.execute("DELETE FROM settings");
  }

  // close
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  // 额外辅助方法
  async getAllMaterials() {
    return await this.db.select("SELECT * FROM materials");
  }

  async getAllCards() {
    return await this.db.select("SELECT * FROM cards");
  }

  async getDueEntries(moduleId, today) {
    return await this.db.select(
      "SELECT * FROM entries WHERE moduleId = ? AND nextReview <= ? AND status != 'mastered'",
      [moduleId, today]
    );
  }
}

// 创建全局实例
const dbAdapter = new DatabaseAdapter();
