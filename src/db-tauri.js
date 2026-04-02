/**
 * EasyLingo Database Adapter
 * 使用 Tauri SQL 插件替代 IndexedDB
 * 保持与 PolyLingo 相同的 API 接口，便于迁移
 */

class EasyLingoDB {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    // 检查是否在 Tauri 环境
    if (typeof window === 'undefined' || !window.__TAURI__) {
      console.warn('Not in Tauri environment, using mock database');
      this.db = this.createMockDB();
      this.isInitialized = true;
      return;
    }
    
    // 加载 SQLite 数据库
    const Database = window.__TAURI__.sql?.default || (await import('@tauri-apps/plugin-sql')).default;
    this.db = await Database.load('sqlite:easylingo.db');
    
    // 创建表结构
    await this.createTables();
    
    // 插入默认数据
    await this.seedData();
    
    this.isInitialized = true;
    console.log('EasyLingo DB initialized');
  }
  
  // Mock DB for browser testing
  createMockDB() {
    const mockData = {
      modules: [],
      entries: [],
      materials: [],
      records: [],
      settings: {}
    };
    return {
      execute: async () => {},
      select: async (sql, params) => {
        // Simple mock implementation
        if (sql.includes('modules')) return mockData.modules;
        if (sql.includes('entries')) return mockData.entries;
        return [];
      }
    };
  }

  async createTables() {
    // 模块表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        flag TEXT,
        isDefault INTEGER DEFAULT 0,
        wordPrompt TEXT,
        phrasePrompt TEXT,
        sentencePrompt TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // 学习材料表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        moduleId TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT,
        type TEXT DEFAULT 'text',
        status TEXT DEFAULT 'pending',
        errorMsg TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // 学习条目表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        moduleId TEXT NOT NULL,
        materialId TEXT,
        type TEXT CHECK(type IN ('word', 'phrase', 'sentence')),
        content TEXT NOT NULL,
        translation TEXT,
        explanation TEXT,
        example TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        
        -- SRS 算法字段
        interval INTEGER DEFAULT 0,
        easeFactor REAL DEFAULT 2.5,
        repetitions INTEGER DEFAULT 0,
        nextReview INTEGER,
        lastReview INTEGER
      )
    `);

    // 学习记录表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entryId TEXT,
        action TEXT,
        result TEXT,
        quality INTEGER,
        duration INTEGER,
        date TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // 设置表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // 创建索引
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_entries_module ON entries(moduleId)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_entries_nextReview ON entries(nextReview)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_materials_module ON materials(moduleId)');
  }

  async seedData() {
    // 插入默认模块
    const defaultModules = [
      { id: 'german', name: '德语', flag: '🇩🇪', isDefault: 1 },
      { id: 'japanese', name: '日语', flag: '🇯🇵', isDefault: 1 },
      { id: 'english', name: '英语', flag: '🇬🇧', isDefault: 1 }
    ];

    for (const mod of defaultModules) {
      const exists = await this.db.select('SELECT id FROM modules WHERE id = ?', [mod.id]);
      if (exists.length === 0) {
        await this.db.execute(
          'INSERT INTO modules (id, name, flag, isDefault) VALUES (?, ?, ?, ?)',
          [mod.id, mod.name, mod.flag, mod.isDefault]
        );
      }
    }
  }

  // ========== 模块操作 ==========
  async getModules() {
    return await this.db.select('SELECT * FROM modules ORDER BY created_at');
  }

  async getModule(id) {
    const result = await this.db.select('SELECT * FROM modules WHERE id = ?', [id]);
    return result[0] || null;
  }

  async saveModule(module) {
    await this.db.execute(
      `INSERT OR REPLACE INTO modules (id, name, flag, isDefault, wordPrompt, phrasePrompt, sentencePrompt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [module.id, module.name, module.flag, module.isDefault ? 1 : 0, 
       module.wordPrompt || '', module.phrasePrompt || '', module.sentencePrompt || '']
    );
  }

  async deleteModule(id) {
    await this.db.execute('DELETE FROM modules WHERE id = ?', [id]);
    await this.db.execute('DELETE FROM entries WHERE moduleId = ?', [id]);
    await this.db.execute('DELETE FROM materials WHERE moduleId = ?', [id]);
  }

  // ========== 学习条目操作 ==========
  async getEntries(moduleId = null) {
    if (moduleId) {
      return await this.db.select('SELECT * FROM entries WHERE moduleId = ? ORDER BY created_at', [moduleId]);
    }
    return await this.db.select('SELECT * FROM entries ORDER BY created_at');
  }

  async getEntry(id) {
    const result = await this.db.select('SELECT * FROM entries WHERE id = ?', [id]);
    return result[0] || null;
  }

  async saveEntry(entry) {
    await this.db.execute(
      `INSERT OR REPLACE INTO entries 
       (id, moduleId, materialId, type, content, translation, explanation, example,
        interval, easeFactor, repetitions, nextReview, lastReview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.moduleId, entry.materialId || null, entry.type, entry.content,
       entry.translation || '', entry.explanation || '', entry.example || '',
       entry.interval || 0, entry.easeFactor || 2.5, entry.repetitions || 0,
       entry.nextReview || null, entry.lastReview || null]
    );
  }

  async deleteEntry(id) {
    await this.db.execute('DELETE FROM entries WHERE id = ?', [id]);
  }

  async countEntries(moduleId = null) {
    if (moduleId) {
      const result = await this.db.select('SELECT COUNT(*) as count FROM entries WHERE moduleId = ?', [moduleId]);
      return result[0].count;
    }
    const result = await this.db.select('SELECT COUNT(*) as count FROM entries');
    return result[0].count;
  }

  // ========== SRS 复习相关 ==========
  async getTodayReviews(moduleId = null) {
    const now = Math.floor(Date.now() / 1000);
    let sql = 'SELECT * FROM entries WHERE nextReview <= ?';
    const params = [now];
    
    if (moduleId) {
      sql += ' AND moduleId = ?';
      params.push(moduleId);
    }
    sql += ' ORDER BY nextReview ASC';
    
    return await this.db.select(sql, params);
  }

  async updateSRS(entryId, quality, srsData) {
    await this.db.execute(
      `UPDATE entries SET 
        interval = ?, easeFactor = ?, repetitions = ?, nextReview = ?, lastReview = ?
       WHERE id = ?`,
      [srsData.interval, srsData.easeFactor, srsData.repetitions, 
       srsData.nextReview, Math.floor(Date.now() / 1000), entryId]
    );
  }

  // ========== 学习材料操作 ==========
  async getMaterials(moduleId) {
    return await this.db.select('SELECT * FROM materials WHERE moduleId = ? ORDER BY created_at DESC', [moduleId]);
  }

  async getMaterial(id) {
    const result = await this.db.select('SELECT * FROM materials WHERE id = ?', [id]);
    return result[0] || null;
  }

  async saveMaterial(material) {
    await this.db.execute(
      `INSERT OR REPLACE INTO materials (id, moduleId, name, content, type, status, errorMsg)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [material.id, material.moduleId, material.name, material.content || '',
       material.type || 'text', material.status || 'pending', material.errorMsg || '']
    );
  }

  async updateMaterialStatus(id, status, errorMsg = '') {
    await this.db.execute(
      'UPDATE materials SET status = ?, errorMsg = ? WHERE id = ?',
      [status, errorMsg, id]
    );
  }

  async deleteMaterial(id) {
    await this.db.execute('DELETE FROM materials WHERE id = ?', [id]);
  }

  // ========== 学习记录操作 ==========
  async addRecord(record) {
    await this.db.execute(
      `INSERT INTO records (entryId, action, result, quality, duration, date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.entryId, record.action, record.result, record.quality || 0,
       record.duration || 0, record.date]
    );
  }

  async getRecordsByDate(date) {
    return await this.db.select('SELECT * FROM records WHERE date = ?', [date]);
  }

  async getRecentRecords(limit = 10) {
    return await this.db.select('SELECT * FROM records ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async getStudyStats(startDate, endDate) {
    return await this.db.select(
      `SELECT date, COUNT(*) as count FROM records 
       WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
      [startDate, endDate]
    );
  }

  // ========== 设置操作 ==========
  async getSetting(key) {
    const result = await this.db.select('SELECT value FROM settings WHERE key = ?', [key]);
    return result[0]?.value || null;
  }

  async setSetting(key, value) {
    await this.db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
  }

  async getAllSettings() {
    const results = await this.db.select('SELECT * FROM settings');
    const settings = {};
    for (const row of results) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  // ========== 数据备份/恢复 ==========
  async exportData() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      modules: await this.getModules(),
      entries: await this.getEntries(),
      materials: await this.db.select('SELECT * FROM materials'),
      records: await this.db.select('SELECT * FROM records'),
      settings: await this.getAllSettings()
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData) {
    const data = JSON.parse(jsonData);
    
    // 清空现有数据
    await this.db.execute('DELETE FROM records');
    await this.db.execute('DELETE FROM entries');
    await this.db.execute('DELETE FROM materials');
    await this.db.execute('DELETE FROM modules');
    
    // 导入模块
    for (const mod of data.modules || []) {
      await this.saveModule(mod);
    }
    
    // 导入条目
    for (const entry of data.entries || []) {
      await this.saveEntry(entry);
    }
    
    // 导入材料
    for (const material of data.materials || []) {
      await this.saveMaterial(material);
    }
    
    // 导入记录
    for (const record of data.records || []) {
      await this.addRecord(record);
    }
    
    // 导入设置
    for (const [key, value] of Object.entries(data.settings || {})) {
      await this.setSetting(key, value);
    }
  }

  // ========== 工具方法 ==========
  async clearAllData() {
    await this.db.execute('DELETE FROM records');
    await this.db.execute('DELETE FROM entries');
    await this.db.execute('DELETE FROM materials');
    await this.db.execute('DELETE FROM modules');
    await this.db.execute('DELETE FROM settings');
  }
}

// 导出单例实例
const db = new EasyLingoDB();

// 兼容 PolyLingo 的 API 风格
// 使 db.modules.toArray() 等代码可以工作
const createTableProxy = (tableName) => {
  return {
    toArray: async () => {
      await db.init();
      if (tableName === 'modules') return await db.getModules();
      if (tableName === 'entries') return await db.getEntries();
      if (tableName === 'materials') return await db.db.select('SELECT * FROM materials');
      if (tableName === 'records') return await db.db.select('SELECT * FROM records');
      return [];
    },
    get: async (id) => {
      await db.init();
      if (tableName === 'modules') return await db.getModule(id);
      if (tableName === 'entries') return await db.getEntry(id);
      if (tableName === 'materials') return await db.getMaterial(id);
      if (tableName === 'settings') return { value: await db.getSetting(id) };
      return null;
    },
    put: async (item) => {
      await db.init();
      if (tableName === 'modules') return await db.saveModule(item);
      if (tableName === 'entries') return await db.saveEntry(item);
      if (tableName === 'materials') return await db.saveMaterial(item);
      if (tableName === 'settings') return await db.setSetting(item.id || item.key, item.value);
    },
    delete: async (id) => {
      await db.init();
      if (tableName === 'modules') return await db.deleteModule(id);
      if (tableName === 'entries') return await db.deleteEntry(id);
      if (tableName === 'materials') return await db.deleteMaterial(id);
    },
    where: (field) => ({
      equals: (value) => ({
        toArray: async () => {
          await db.init();
          if (tableName === 'entries' && field === 'moduleId') {
            return await db.getEntries(value);
          }
          if (tableName === 'materials' && field === 'moduleId') {
            return await db.getMaterials(value);
          }
          return await db.db.select(`SELECT * FROM ${tableName} WHERE ${field} = ?`, [value]);
        },
        count: async () => {
          await db.init();
          if (tableName === 'entries' && field === 'moduleId') {
            return await db.countEntries(value);
          }
          const result = await db.db.select(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${field} = ?`, [value]);
          return result[0].count;
        }
      }),
      and: (filter) => ({
        toArray: async () => {
          await db.init();
          // 简化实现，仅支持 records 表
          return await db.db.select(`SELECT * FROM ${tableName} WHERE ${field} = ?`, []);
        }
      })
    }),
    filter: (fn) => ({
      toArray: async () => {
        await db.init();
        const all = await db.db.select(`SELECT * FROM ${tableName}`);
        return all.filter(fn);
      }
    }),
    orderBy: (field) => ({
      reverse: () => ({
        limit: async (n) => {
          await db.init();
          return await db.db.select(`SELECT * FROM ${tableName} ORDER BY ${field} DESC LIMIT ?`, [n]);
        }
      })
    })
  };
};

// 创建代理对象，兼容 PolyLingo API
db.modules = createTableProxy('modules');
db.entries = createTableProxy('entries');
db.materials = createTableProxy('materials');
db.records = createTableProxy('records');
db.settings = createTableProxy('settings');

// 添加 open 和 delete 方法兼容
db.open = async () => await db.init();
db.delete = async () => await db.clearAllData();

// 全局暴露
window.db = db;
