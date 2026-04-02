/**
 * Tauri API 适配层
 * 封装 Tauri 原生功能，提供与 PolyLingo 类似的 API
 */

// 检查是否在 Tauri 环境中
const isTauri = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

/**
 * 文件操作 API
 */
class TauriFileAPI {
  constructor() {
    this.dialog = null;
    this.fs = null;
  }

  async init() {
    if (!isTauri()) {
      console.warn('Not in Tauri environment, file operations will not work');
      return;
    }
    
    const { open, save } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
    
    this.dialog = { open, save };
    this.fs = { readTextFile, writeTextFile };
  }

  /**
   * 打开文件选择对话框
   * @param {Object} options
   * @returns {Promise<string|null>} 文件路径或 null
   */
  async openFile(options = {}) {
    if (!this.dialog) await this.init();
    if (!isTauri()) return null;

    const filters = options.filters || [
      { name: '文本文件', extensions: ['txt', 'md'] },
      { name: 'Word 文档', extensions: ['doc', 'docx'] },
      { name: '所有文件', extensions: ['*'] }
    ];

    const result = await this.dialog.open({
      multiple: false,
      filters: filters
    });

    return result;
  }

  /**
   * 读取文本文件
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async readTextFile(filePath) {
    if (!this.fs) await this.init();
    if (!isTauri()) throw new Error('Not in Tauri environment');

    return await this.fs.readTextFile(filePath);
  }

  /**
   * 保存文件对话框并写入
   * @param {string} content
   * @param {Object} options
   */
  async saveFile(content, options = {}) {
    if (!this.dialog) await this.init();
    if (!isTauri()) throw new Error('Not in Tauri environment');

    const filePath = await this.dialog.save({
      defaultPath: options.defaultPath || 'untitled.txt',
      filters: options.filters || [{ name: '文本文件', extensions: ['txt'] }]
    });

    if (filePath) {
      await this.fs.writeTextFile(filePath, content);
    }

    return filePath;
  }

  /**
   * 拖放文件处理（兼容原有拖放逻辑）
   * 在桌面端，拖放会通过 Tauri 事件处理
   */
  setupDragDrop(callback) {
    if (!isTauri()) {
      // 浏览器环境，使用原生拖放
      document.addEventListener('dragover', (e) => e.preventDefault());
      document.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0 && callback) {
          callback(files[0]);
        }
      });
      return;
    }

    // Tauri 环境：使用文件选择器替代拖放
    // 因为 Tauri WebView 的拖放需要额外配置
    console.log('Tauri environment: use file picker instead of drag-drop');
  }
}

/**
 * 新闻抓取 API（调用 Rust 后端）
 */
class TauriNewsAPI {
  constructor() {
    this.invoke = null;
  }

  async init() {
    if (!isTauri()) {
      console.warn('Not in Tauri environment');
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    this.invoke = invoke;
  }

  /**
   * 获取新闻 RSS
   * @param {string} source - 新闻源: bbc, guardian, npr, zdf, asahi
   * @returns {Promise<string>} RSS XML 内容
   */
  async fetchRSS(source) {
    if (!this.invoke) await this.init();
    if (!isTauri()) throw new Error('News fetching requires Tauri environment');

    return await this.invoke('fetch_news_rss', { source });
  }

  /**
   * 获取文章内容
   * @param {string} url - 文章 URL
   * @returns {Promise<string>} HTML 内容
   */
  async fetchArticle(url) {
    if (!this.invoke) await this.init();
    if (!isTauri()) throw new Error('News fetching requires Tauri environment');

    return await this.invoke('fetch_article_content', { url });
  }

  /**
   * 获取所有支持的新闻源
   */
  getSources() {
    return [
      { id: 'bbc', name: 'BBC News', language: 'english', icon: '🇬🇧' },
      { id: 'guardian', name: 'The Guardian', language: 'english', icon: '🇬🇧' },
      { id: 'npr', name: 'NPR', language: 'english', icon: '🇺🇸' },
      { id: 'zdf', name: 'ZDF', language: 'german', icon: '🇩🇪' },
      { id: 'asahi', name: '朝日新聞', language: 'japanese', icon: '🇯🇵' }
    ];
  }
}

/**
 * 数据导出/导入 API
 */
class TauriDataAPI {
  constructor() {
    this.fileAPI = new TauriFileAPI();
  }

  async init() {
    await this.fileAPI.init();
  }

  /**
   * 导出数据到 JSON 文件
   */
  async exportData() {
    const { db } = window;
    const data = await db.exportData();
    
    const filePath = await this.fileAPI.saveFile(data, {
      defaultPath: `easylingo-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    return filePath;
  }

  /**
   * 从 JSON 文件导入数据
   */
  async importData() {
    const filePath = await this.fileAPI.openFile({
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (!filePath) return null;

    const content = await this.fileAPI.readTextFile(filePath);
    const { db } = window;
    await db.importData(content);

    return filePath;
  }
}

// 创建全局实例
const tauriFile = new TauriFileAPI();
const tauriNews = new TauriNewsAPI();
const tauriData = new TauriDataAPI();

// 全局暴露
window.tauriFile = tauriFile;
window.tauriNews = tauriNews;
window.tauriData = tauriData;
window.isTauri = isTauri;

// 兼容性导出
export { tauriFile, tauriNews, tauriData, isTauri };
