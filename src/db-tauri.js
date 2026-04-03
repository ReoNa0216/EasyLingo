/**
 * EasyLingo Database Adapter
 * 使用 Tauri SQL 插件替代 IndexedDB
 * 保持与 PolyLingo 相同的 API 接口，便于迁移
 */

// Tauri SQL 插件导入
let Database = null;

// 动态导入 SQL 插件
async function loadSQLPlugin() {
  if (Database) return Database;
  
  try {
    // 尝试 ESM 导入
    const sqlModule = await import('@tauri-apps/plugin-sql');
    Database = sqlModule.default || sqlModule.Database;
    console.log('✅ SQL plugin loaded via ESM import');
    return Database;
  } catch (e) {
    console.warn('ESM import failed:', e.message);
    
    // 回退到 window.__TAURI__ 检查
    if (window.__TAURI__?.sql) {
      const SQL = window.__TAURI__.sql;
      Database = SQL.default || SQL;
      console.log('✅ SQL plugin loaded via window.__TAURI__');
      return Database;
    }
    
    throw new Error('SQL plugin not available');
  }
}

// 检测是否在 Tauri 环境
const checkIsTauri = () => {
  return (
    typeof window !== 'undefined' &&
    (window.__TAURI__ !== undefined ||
     window.__TAURI_INTERNALS__ !== undefined)
  );
};

class EasyLingoDB {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.isMock = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    const isTauri = checkIsTauri();
    
    if (!isTauri) {
      console.warn('Not in Tauri environment, using mock database');
      this.db = this.createMockDB();
      this.isMock = true;
      this.isInitialized = true;
      return;
    }
    
    // 在 Tauri 环境中，尝试加载 SQL 插件
    try {
      const SQL = await loadSQLPlugin();
      this.db = await SQL.load('sqlite:easylingo.db');
      console.log('✅ SQLite database loaded successfully');
    } catch (e) {
      console.error('❌ Failed to load SQLite database:', e);
      console.warn('Falling back to mock database');
      this.db = this.createMockDB();
      this.isMock = true;
      this.isInitialized = true;
      return;
    }
    
    // 创建表结构
    try {
      await this.createTables();
      await this.seedData();
      this.isInitialized = true;
      console.log('✅ Database initialized successfully');
    } catch (e) {
      console.error('❌ Failed to initialize database:', e);
      this.db = this.createMockDB();
      this.isMock = true;
      this.isInitialized = true;
    }
  }
  
  // Mock DB for browser testing
  createMockDB() {
    console.log('Creating mock database...');
    const mockData = {
      modules: [],
      entries: [],
      materials: [],
      records: [],
      tests: [],
      settings: {}
    };
    
    return {
      execute: async (sql, params) => {
        // 处理 settings 表的 INSERT/REPLACE
        if (sql.includes('settings') && params && params.length >= 2) {
          const [key, value] = params;
          mockData.settings[key] = value;
        }
        // 处理 materials 表的 UPDATE
        if (sql.includes('UPDATE') && sql.includes('materials')) {
          const id = params[params.length - 1];
          const material = mockData.materials.find(m => m.id === id);
          if (material) {
            // 简单解析 SET 子句
            const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
            if (setMatch) {
              const setFields = setMatch[1].split(',').map(s => s.trim());
              setFields.forEach((field, index) => {
                const fieldName = field.split('=')[0].trim();
                if (fieldName && params[index] !== undefined) {
                  material[fieldName] = params[index];
                }
              });
            }
          }
        }
        // 处理 DELETE
        if (sql.includes('DELETE')) {
          // 简化处理
        }
      },
      select: async (sql, params) => {
        // 处理 COUNT 查询
        if (sql.includes('COUNT(*)')) {
          if (sql.includes('entries')) {
            return [{ count: mockData.entries.length }];
          }
          if (sql.includes('modules')) return [{ count: mockData.modules.length }];
          if (sql.includes('materials')) return [{ count: mockData.materials.length }];
          if (sql.includes('records')) return [{ count: mockData.records.length }];
          if (sql.includes('tests')) return [{ count: mockData.tests.length }];
          return [{ count: 0 }];
        }
        
        // 处理 settings 表的 SELECT
        if (sql.includes('settings') && params && params.length > 0) {
          const key = params[0];
          const value = mockData.settings[key];
          return value !== undefined ? [{ value }] : [];
        }
        
        // 处理 WHERE 条件查询
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const field = whereMatch[1];
          const value = params?.[0];
          let table = null;
          if (sql.includes('modules')) table = 'modules';
          else if (sql.includes('entries')) table = 'entries';
          else if (sql.includes('materials')) table = 'materials';
          else if (sql.includes('records')) table = 'records';
          else if (sql.includes('tests')) table = 'tests';
          
          if (table && mockData[table]) {
            return mockData[table].filter(item => item[field] == value);
          }
        }
        
        // 处理 ORDER BY
        if (sql.includes('ORDER BY')) {
          const field = sql.match(/ORDER BY\s+(\w+)/)?.[1];
          const isDesc = sql.includes('DESC');
          let table = null;
          if (sql.includes('modules')) table = 'modules';
          else if (sql.includes('entries')) table = 'entries';
          else if (sql.includes('materials')) table = 'materials';
          else if (sql.includes('records')) table = 'records';
          else if (sql.includes('tests')) table = 'tests';
          
          if (table) {
            let results = [...mockData[table]];
            if (field) {
              results.sort((a, b) => {
                const aVal = a[field] ?? 0;
                const bVal = b[field] ?? 0;
                return isDesc ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
              });
            }
            // 处理 LIMIT
            const limitMatch = sql.match(/LIMIT\s+(\d+)/);
            if (limitMatch) {
              results = results.slice(0, parseInt(limitMatch[1]));
            }
            return results;
          }
        }
        
        // Simple table queries
        if (sql.includes('modules')) return [...mockData.modules];
        if (sql.includes('entries')) return [...mockData.entries];
        if (sql.includes('materials')) return [...mockData.materials];
        if (sql.includes('records')) return [...mockData.records];
        if (sql.includes('tests')) return [...mockData.tests];
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
        progress INTEGER DEFAULT 0,
        partialCount INTEGER DEFAULT 0,
        entryCount INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // 迁移：添加缺失的列
    await this.migrateMaterialsTable();

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

    // 测试记录表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        moduleId TEXT NOT NULL,
        score REAL,
        answers TEXT,
        duration INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // 创建索引
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_entries_module ON entries(moduleId)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_entries_nextReview ON entries(nextReview)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_materials_module ON materials(moduleId)');
  }

  async seedData() {
    // 检查是否已有默认模块
    const existing = await this.db.select('SELECT id FROM modules WHERE id IN ("german", "japanese", "english")');
    if (existing.length > 0) return;
    
    // 插入默认模块
    const defaultModules = [
      { id: 'german', name: '德语', flag: '🇩🇪', isDefault: 1 },
      { id: 'japanese', name: '日语', flag: '🇯🇵', isDefault: 1 },
      { id: 'english', name: '英语', flag: '🇬🇧', isDefault: 1 }
    ];

    for (const mod of defaultModules) {
      await this.db.execute(
        'INSERT OR IGNORE INTO modules (id, name, flag, isDefault) VALUES (?, ?, ?, ?)',
        [mod.id, mod.name, mod.flag, mod.isDefault]
      );
    }
  }
  
  // 迁移 materials 表：添加缺失的列
  async migrateMaterialsTable() {
    try {
      // 检查是否需要添加 progress 列
      const columns = await this.db.select(`PRAGMA table_info(materials)`);
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('progress')) {
        console.log('Migrating materials table: adding progress column...');
        await this.db.execute('ALTER TABLE materials ADD COLUMN progress INTEGER DEFAULT 0');
      }
      if (!columnNames.includes('partialCount')) {
        console.log('Migrating materials table: adding partialCount column...');
        await this.db.execute('ALTER TABLE materials ADD COLUMN partialCount INTEGER DEFAULT 0');
      }
      if (!columnNames.includes('entryCount')) {
        console.log('Migrating materials table: adding entryCount column...');
        await this.db.execute('ALTER TABLE materials ADD COLUMN entryCount INTEGER DEFAULT 0');
      }
    } catch (e) {
      console.warn('Migration failed (may be already migrated):', e.message);
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
    let entries;
    if (moduleId) {
      entries = await this.db.select('SELECT * FROM entries WHERE moduleId = ? ORDER BY created_at', [moduleId]);
    } else {
      entries = await this.db.select('SELECT * FROM entries ORDER BY created_at');
    }
    // 将 content 映射为 original，保持前端兼容性
    return entries.map(e => ({ ...e, original: e.content }));
  }

  async getEntry(id) {
    const result = await this.db.select('SELECT * FROM entries WHERE id = ?', [id]);
    if (!result[0]) return null;
    // 将 content 映射为 original，保持前端兼容性
    return { ...result[0], original: result[0].content };
  }

  async saveEntry(entry) {
    // 支持 original -> content 映射（AI 提取使用 original，数据库存储使用 content）
    const content = entry.content || entry.original || '';
    
    await this.db.execute(
      `INSERT OR REPLACE INTO entries 
       (id, moduleId, materialId, type, content, translation, explanation, example,
        interval, easeFactor, repetitions, nextReview, lastReview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.moduleId, entry.materialId || null, entry.type, content,
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
      `INSERT OR REPLACE INTO materials (id, moduleId, name, content, type, status, errorMsg, progress, partialCount, entryCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [material.id, material.moduleId, material.name, material.content || '',
       material.type || 'text', material.status || 'pending', material.errorMsg || '',
       material.progress || 0, material.partialCount || 0, material.entryCount || 0]
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

  // ========== 测试记录操作 ==========
  async getTests(moduleId = null) {
    if (moduleId) {
      return await this.db.select('SELECT * FROM tests WHERE moduleId = ? ORDER BY created_at DESC', [moduleId]);
    }
    return await this.db.select('SELECT * FROM tests ORDER BY created_at DESC');
  }

  async getTest(id) {
    const result = await this.db.select('SELECT * FROM tests WHERE id = ?', [id]);
    return result[0] || null;
  }

  async saveTest(test) {
    await this.db.execute(
      `INSERT OR REPLACE INTO tests (id, moduleId, score, answers, duration, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [test.id, test.moduleId, test.score || 0, JSON.stringify(test.answers || []), 
       test.duration || 0, test.created_at || Math.floor(Date.now() / 1000)]
    );
  }

  async deleteTest(id) {
    await this.db.execute('DELETE FROM tests WHERE id = ?', [id]);
  }

  // 辅助方法：将 entries 的 content 映射为 original
  _mapEntries(entries) {
    return entries.map(e => ({ ...e, original: e.content }));
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
      tests: await this.db.select('SELECT * FROM tests'),
      settings: await this.getAllSettings()
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData) {
    const data = JSON.parse(jsonData);
    
    // 清空现有数据
    await this.clearAllData();
    
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
    
    // 导入测试记录
    for (const test of data.tests || []) {
      await this.saveTest(test);
    }
    
    // 导入设置
    for (const [key, value] of Object.entries(data.settings || {})) {
      await this.setSetting(key, value);
    }
  }

  // ========== 工具方法 ==========
  async clearAllData() {
    await this.db.execute('DELETE FROM records');
    await this.db.execute('DELETE FROM tests');
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
      if (tableName === 'tests') return await db.db.select('SELECT * FROM tests');
      return [];
    },
    get: async (id) => {
      await db.init();
      if (tableName === 'modules') return await db.getModule(id);
      if (tableName === 'entries') return await db.getEntry(id);
      if (tableName === 'materials') return await db.getMaterial(id);
      if (tableName === 'settings') return { value: await db.getSetting(id) };
      if (tableName === 'tests') return await db.getTest(id);
      return null;
    },
    put: async (item) => {
      await db.init();
      if (tableName === 'modules') return await db.saveModule(item);
      if (tableName === 'entries') return await db.saveEntry(item);
      if (tableName === 'materials') return await db.saveMaterial(item);
      if (tableName === 'settings') return await db.setSetting(item.id || item.key, item.value);
      if (tableName === 'tests') return await db.saveTest(item);
    },
    delete: async (id) => {
      await db.init();
      if (tableName === 'modules') return await db.deleteModule(id);
      if (tableName === 'entries') return await db.deleteEntry(id);
      if (tableName === 'materials') return await db.deleteMaterial(id);
      if (tableName === 'tests') return await db.deleteTest(id);
    },
    update: async (id, changes) => {
      await db.init();
      // 先获取现有记录
      let existing = null;
      if (tableName === 'modules') existing = await db.getModule(id);
      else if (tableName === 'entries') existing = await db.getEntry(id);
      else if (tableName === 'materials') existing = await db.getMaterial(id);
      else if (tableName === 'tests') existing = await db.getTest(id);
      else {
        const result = await db.db.select(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
        existing = result[0] || null;
      }
      
      if (!existing) {
        throw new Error(`Record not found: ${id}`);
      }
      
      // 合并更改
      const updated = { ...existing, ...changes };
      
      // 保存更新后的记录
      if (tableName === 'modules') return await db.saveModule(updated);
      if (tableName === 'entries') return await db.saveEntry(updated);
      if (tableName === 'materials') return await db.saveMaterial(updated);
      if (tableName === 'tests') return await db.saveTest(updated);
      
      // 通用更新（使用所有字段）
      const fields = Object.keys(updated).filter(k => k !== 'id');
      const values = fields.map(f => updated[f]);
      values.push(id);
      
      const sql = `UPDATE ${tableName} SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
      await db.db.execute(sql, values);
    },
    where: (fieldOrObj) => {
      // 支持对象语法: where({ moduleId: 'x', type: 'y' })
      if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
        const conditions = fieldOrObj;
        const keys = Object.keys(conditions);
        
        return {
          toArray: async () => {
            await db.init();
            let sql = `SELECT * FROM ${tableName}`;
            const params = [];
            
            if (keys.length > 0) {
              const whereClauses = keys.map(key => {
                params.push(conditions[key]);
                return `${key} = ?`;
              });
              sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }
            
            const results = await db.db.select(sql, params);
            return tableName === 'entries' ? db._mapEntries(results) : results;
          },
          count: async () => {
            await db.init();
            let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
            const params = [];
            
            if (keys.length > 0) {
              const whereClauses = keys.map(key => {
                params.push(conditions[key]);
                return `${key} = ?`;
              });
              sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }
            
            const result = await db.db.select(sql, params);
            return result[0].count;
          }
        };
      }
      
      // 支持链式语法: where('field').equals('value')
      const field = fieldOrObj;
      return {
        equals: (value) => ({
          toArray: async () => {
            await db.init();
            if (tableName === 'entries' && field === 'moduleId') {
              return await db.getEntries(value);
            }
            if (tableName === 'materials' && field === 'moduleId') {
              return await db.getMaterials(value);
            }
            const results = await db.db.select(`SELECT * FROM ${tableName} WHERE ${field} = ?`, [value]);
            return tableName === 'entries' ? db._mapEntries(results) : results;
          },
          count: async () => {
            await db.init();
            if (tableName === 'entries' && field === 'moduleId') {
              return await db.countEntries(value);
            }
            const result = await db.db.select(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${field} = ?`, [value]);
            return result[0].count;
          },
          delete: async () => {
            await db.init();
            await db.db.execute(`DELETE FROM ${tableName} WHERE ${field} = ?`, [value]);
          },
          and: (filterFn) => ({
            toArray: async () => {
              await db.init();
              const all = await db.db.select(`SELECT * FROM ${tableName} WHERE ${field} = ?`, [value]);
              const mapped = tableName === 'entries' ? db._mapEntries(all) : all;
              return mapped.filter(filterFn);
            }
          })
        }),
        and: (filterFn) => ({
          toArray: async () => {
            await db.init();
            const all = await db.db.select(`SELECT * FROM ${tableName}`);
            const mapped = tableName === 'entries' ? db._mapEntries(all) : all;
            return mapped.filter(filterFn);
          }
        })
      };
    },
    filter: (fn) => ({
      toArray: async () => {
        await db.init();
        const all = await db.db.select(`SELECT * FROM ${tableName}`);
        const mapped = tableName === 'entries' ? db._mapEntries(all) : all;
        return mapped.filter(fn);
      }
    }),
    orderBy: (field) => ({
      reverse: () => ({
        toArray: async () => {
          await db.init();
          const results = await db.db.select(`SELECT * FROM ${tableName} ORDER BY ${field} DESC`);
          return tableName === 'entries' ? db._mapEntries(results) : results;
        },
        limit: (n) => ({
          toArray: async () => {
            await db.init();
            const results = await db.db.select(`SELECT * FROM ${tableName} ORDER BY ${field} DESC LIMIT ?`, [n]);
            return tableName === 'entries' ? db._mapEntries(results) : results;
          }
        })
      }),
      toArray: async () => {
        await db.init();
        const results = await db.db.select(`SELECT * FROM ${tableName} ORDER BY ${field} ASC`);
        return tableName === 'entries' ? db._mapEntries(results) : results;
      }
    })
  };
};

// 创建代理对象，兼容 PolyLingo API
db.modules = createTableProxy('modules');
db.entries = createTableProxy('entries');
db.materials = createTableProxy('materials');
db.records = createTableProxy('records');
db.tests = createTableProxy('tests');
db.settings = createTableProxy('settings');

// 添加 open 和 delete 方法兼容
db.open = async () => await db.init();
db.delete = async () => await db.clearAllData();

// 全局暴露
window.db = db;

export default db;
