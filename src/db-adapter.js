/**
 * SQLite 数据库适配器
 * 使用 Tauri invoke 直接调用 Rust 后端 SQL 命令
 */

class DatabaseAdapter {
  constructor() {
    this.dbPath = null;
    this.customPath = null;
    this.invoke = null;
  }

  getInvoke() {
    if (!this.invoke) {
      if (typeof window.__TAURI__ === 'undefined') {
        throw new Error('Tauri API not available');
      }
      this.invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
    }
    return this.invoke;
  }

  async init() {
    console.log('[DB] Initializing...');
    
    // 等待 Tauri 准备好
    let retries = 0;
    while (typeof window.__TAURI__ === 'undefined' && retries < 30) {
      await new Promise(r => setTimeout(r, 100));
      retries++;
    }
    
    if (typeof window.__TAURI__ === 'undefined') {
      throw new Error('Tauri API not available after waiting');
    }
    
    // 先尝试从 localStorage 读取自定义路径
    const savedPath = localStorage.getItem('polylingo_db_path');
    
    if (savedPath) {
      this.customPath = savedPath;
      this.dbPath = `${savedPath}/polylingo.db`;
    } else {
      // 使用默认路径 - AppData 目录
      this.dbPath = null; // null 表示使用默认路径
    }
    
    // 初始化数据库连接
    const invoke = this.getInvoke();
    await invoke('plugin:sql|load', { 
      db: this.dbPath || 'sqlite:polylingo.db'
    });
    
    // 检查是否需要重新创建表（表结构变更时）
    const needsRecreate = await this.checkTableSchema();
    if (needsRecreate) {
      console.log('[DB] Table schema changed, recreating tables...');
      await this.dropTables();
    }
    
    await this.createTables();
    
    // 迁移：添加缺失的列
    await this.migrateTables();
    
    console.log('[DB] SQLite 初始化完成:', this.dbPath || 'default location');
  }

  async execute(sql, params = []) {
    const invoke = this.getInvoke();
    return await invoke('plugin:sql|execute', { 
      db: this.dbPath || 'sqlite:polylingo.db',
      query: sql,
      values: params
    });
  }

  async select(sql, params = []) {
    const invoke = this.getInvoke();
    return await invoke('plugin:sql|select', { 
      db: this.dbPath || 'sqlite:polylingo.db',
      query: sql,
      values: params
    });
  }

  async createTables() {
    await this.execute(`
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

    await this.execute(`
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

    await this.execute(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        materialId TEXT,
        moduleId TEXT,
        original TEXT,
        translation TEXT,
        type TEXT,
        wordType TEXT,
        level INTEGER,
        gender TEXT,
        tags TEXT,
        explanation TEXT,
        example TEXT,
        srsLevel INTEGER DEFAULT 0,
        createdAt TEXT,
        nextReview TEXT,
        interval INTEGER DEFAULT 0,
        repetition INTEGER DEFAULT 0,
        efactor REAL DEFAULT 2.5,
        status TEXT DEFAULT 'new'
      )
    `);

    await this.execute(`
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

    await this.execute(`
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        moduleId TEXT,
        score INTEGER,
        totalQuestions INTEGER,
        createdAt TEXT,
        answers TEXT
      )
    `);

    await this.execute(`
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

    await this.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  // 检查表结构是否需要重建
  async checkTableSchema() {
    try {
      const tableInfo = await this.select("PRAGMA table_info(entries)");
      const columns = tableInfo.map(col => col.name);
      const requiredColumns = ['wordType', 'example', 'srsLevel'];
      const missing = requiredColumns.filter(col => !columns.includes(col));
      if (missing.length > 0) {
        console.log('[DB] Missing columns detected:', missing);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // 删除所有表（用于重建）
  async dropTables() {
    try {
      await this.execute("DROP TABLE IF EXISTS entries");
      await this.execute("DROP TABLE IF EXISTS cards");
      await this.execute("DROP TABLE IF EXISTS materials");
      await this.execute("DROP TABLE IF EXISTS modules");
      await this.execute("DROP TABLE IF EXISTS tests");
      await this.execute("DROP TABLE IF EXISTS records");
      await this.execute("DROP TABLE IF EXISTS settings");
      console.log('[DB] All tables dropped');
    } catch (e) {
      console.error('[DB] Error dropping tables:', e);
    }
  }

  // 迁移：添加缺失的列
  async migrateTables() {
    try {
      const tableInfo = await this.select("PRAGMA table_info(entries)");
      const columns = tableInfo.map(col => col.name);
      
      // 检查并添加缺失的列
      if (!columns.includes('wordType')) {
        console.log('[DB] Migrating: adding wordType column to entries table');
        await this.execute("ALTER TABLE entries ADD COLUMN wordType TEXT");
      }
      if (!columns.includes('example')) {
        console.log('[DB] Migrating: adding example column to entries table');
        await this.execute("ALTER TABLE entries ADD COLUMN example TEXT");
      }
      if (!columns.includes('srsLevel')) {
        console.log('[DB] Migrating: adding srsLevel column to entries table');
        await this.execute("ALTER TABLE entries ADD COLUMN srsLevel INTEGER DEFAULT 0");
      }
      console.log('[DB] Migration complete');
    } catch (e) {
      console.warn('[DB] Migration error:', e);
    }
  }

  // modules
  async getModule(id) {
    const rows = await this.select("SELECT * FROM modules WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllModules() {
    return await this.select("SELECT * FROM modules");
  }

  async putModule(module) {
    const { id, name, language, code, flag, customPrompt, isDefault, createdAt } = module;
    await this.execute(
      "INSERT OR REPLACE INTO modules (id, name, language, code, flag, customPrompt, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, name, language, code, flag, customPrompt, isDefault ? 1 : 0, createdAt]
    );
  }

  async deleteModule(id) {
    await this.execute("DELETE FROM modules WHERE id = ?", [id]);
  }

  async updateModule(id, changes) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(changes)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.execute(`UPDATE modules SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  // materials
  async getMaterial(id) {
    const rows = await this.select("SELECT * FROM materials WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getMaterialsByModule(moduleId) {
    return await this.select("SELECT * FROM materials WHERE moduleId = ?", [moduleId]);
  }

  async putMaterial(material) {
    const { id, moduleId, title, content, status, createdAt, entryCount, errorMsg } = material;
    await this.execute(
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
    await this.execute(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  async deleteMaterial(id) {
    await this.execute("DELETE FROM materials WHERE id = ?", [id]);
  }

  async deleteMaterialsByModule(moduleId) {
    await this.execute("DELETE FROM materials WHERE moduleId = ?", [moduleId]);
  }

  // entries
  async getEntry(id) {
    const rows = await this.select("SELECT * FROM entries WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getEntriesByModule(moduleId) {
    return await this.select("SELECT * FROM entries WHERE moduleId = ?", [moduleId]);
  }

  async getEntriesByMaterial(materialId) {
    return await this.select("SELECT * FROM entries WHERE materialId = ?", [materialId]);
  }

  async getAllEntries() {
    return await this.select("SELECT * FROM entries");
  }

  async putEntry(entry) {
    if (entry.id) {
      const { id, ...rest } = entry;
      const cols = Object.keys(rest);
      const placeholders = cols.map(() => '?').join(',');
      const values = Object.values(rest);
      await this.execute(
        `INSERT INTO entries (id, ${cols.join(',')}) VALUES (?, ${placeholders})`,
        [id, ...values]
      );
    } else {
      const cols = Object.keys(entry);
      const placeholders = cols.map(() => '?').join(',');
      const values = Object.values(entry);
      const result = await this.execute(
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
    await this.execute(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  async deleteEntry(id) {
    await this.execute("DELETE FROM entries WHERE id = ?", [id]);
  }

  async deleteEntriesByMaterial(materialId) {
    await this.execute("DELETE FROM entries WHERE materialId = ?", [materialId]);
  }

  async getDueEntries(moduleId, date) {
    return await this.select(
      "SELECT * FROM entries WHERE moduleId = ? AND nextReview <= ? AND status != 'mastered'",
      [moduleId, date]
    );
  }

  async countEntriesByModule(moduleId) {
    const rows = await this.select("SELECT COUNT(*) as count FROM entries WHERE moduleId = ?", [moduleId]);
    return rows[0]?.count || 0;
  }

  async filterEntries(predicate) {
    const all = await this.getAllEntries();
    return all.filter(predicate);
  }

  // cards
  async getCardsByEntry(entryId) {
    return await this.select("SELECT * FROM cards WHERE entryId = ?", [entryId]);
  }

  async putCard(card) {
    const { entryId, moduleId, materialId, front, back, createdAt } = card;
    await this.execute(
      "INSERT INTO cards (entryId, moduleId, materialId, front, back, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      [entryId, moduleId, materialId, front, back, createdAt]
    );
  }

  async deleteCardsByMaterial(materialId) {
    await this.execute("DELETE FROM cards WHERE materialId = ?", [materialId]);
  }

  // tests
  async getTest(id) {
    const rows = await this.select("SELECT * FROM tests WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllTests() {
    return await this.select("SELECT * FROM tests");
  }

  async putTest(test) {
    const { id, moduleId, score, totalQuestions, createdAt, answers } = test;
    await this.execute(
      "INSERT OR REPLACE INTO tests (id, moduleId, score, totalQuestions, createdAt, answers) VALUES (?, ?, ?, ?, ?, ?)",
      [id, moduleId, score, totalQuestions, createdAt, JSON.stringify(answers)]
    );
  }

  async deleteTest(id) {
    await this.execute("DELETE FROM tests WHERE id = ?", [id]);
  }

  // records
  async getAllRecords() {
    return await this.select("SELECT * FROM records");
  }

  async putRecord(record) {
    const { moduleId, entryId, action, duration, date, createdAt } = record;
    await this.execute(
      "INSERT INTO records (moduleId, entryId, action, duration, date, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      [moduleId, entryId, action, duration, date, createdAt]
    );
  }

  async getRecordsByDate(date) {
    return await this.select("SELECT * FROM records WHERE date = ?", [date]);
  }

  async deleteRecord(id) {
    await this.execute("DELETE FROM records WHERE id = ?", [id]);
  }

  // settings
  async getSetting(id) {
    const rows = await this.select("SELECT * FROM settings WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async getAllSettings() {
    return await this.select("SELECT * FROM settings");
  }

  async putSetting(setting) {
    const { id, value } = setting;
    await this.execute(
      "INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)",
      [id, typeof value === 'object' ? JSON.stringify(value) : String(value)]
    );
  }

  async deleteSetting(id) {
    await this.execute("DELETE FROM settings WHERE id = ?", [id]);
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
    await this.execute("DELETE FROM modules");
    await this.execute("DELETE FROM materials");
    await this.execute("DELETE FROM entries");
    await this.execute("DELETE FROM cards");
    await this.execute("DELETE FROM tests");
    await this.execute("DELETE FROM records");
    await this.execute("DELETE FROM settings");
  }

  // close
  async close() {
    // SQLite 通过插件管理，不需要显式关闭
    console.log('[DB] Connection closed');
  }

  // 设置自定义数据路径
  async setCustomPath(path) {
    const invoke = this.getInvoke();
    await invoke('ensure_dir', { path });
    this.customPath = path;
    localStorage.setItem('polylingo_db_path', path);
    return true;
  }

  // 获取当前数据路径
  getCurrentPath() {
    if (this.customPath) {
      return this.customPath;
    }
    return '默认位置 (AppData)';
  }

  // 重置为默认路径
  resetToDefault() {
    localStorage.removeItem('polylingo_db_path');
    this.customPath = null;
    this.dbPath = null;
  }

  // 额外辅助方法
  async getAllMaterials() {
    return await this.select("SELECT * FROM materials");
  }

  async getAllCards() {
    return await this.select("SELECT * FROM cards");
  }

  async getDueEntriesForReview(moduleId, today, limit) {
    const sql = limit ? 
      "SELECT * FROM entries WHERE moduleId = ? AND nextReview <= ? AND status != 'mastered' LIMIT ?" :
      "SELECT * FROM entries WHERE moduleId = ? AND nextReview <= ? AND status != 'mastered'";
    const params = limit ? [moduleId, today, limit] : [moduleId, today];
    return await this.select(sql, params);
  }
}

// 创建全局实例
const dbAdapter = new DatabaseAdapter();
