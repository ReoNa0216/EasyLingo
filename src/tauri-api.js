/**
 * Tauri API 适配层
 * 封装 Tauri 原生功能
 */

// 检查是否在 Tauri 环境中
const checkIsTauri = () => {
  return (
    typeof window !== 'undefined' &&
    (window.__TAURI__ !== undefined ||
     window.__TAURI_INTERNALS__ !== undefined)
  );
};

// 获取 invoke 函数
const getInvoke = () => {
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return window.__TAURI__.core.invoke;
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    return window.__TAURI__.invoke;
  }
  return null;
};

/**
 * 文件操作 API
 */
class TauriFileAPI {
  constructor() {
    this.dialog = null;
    this.fs = null;
    this.invoke = null;
  }

  async init() {
    if (!checkIsTauri()) {
      console.warn('Not in Tauri environment');
      return;
    }
    
    this.invoke = getInvoke();
    
    // 尝试加载 dialog 插件
    try {
      if (window.__TAURI__ && window.__TAURI__.dialog) {
        this.dialog = window.__TAURI__.dialog;
      }
    } catch (e) {
      console.warn('Dialog plugin not available:', e);
    }
  }

  async openFile(options = {}) {
    if (!this.dialog) await this.init();
    if (!this.dialog) return null;
    
    try {
      return await this.dialog.open({
        multiple: false,
        filters: options.filters || [
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: 'PDF 文档', extensions: ['pdf'] },
          { name: 'Word 文档', extensions: ['docx'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
    } catch (e) {
      console.error('Open file error:', e);
      return null;
    }
  }

  async saveFile(options = {}) {
    if (!this.dialog) await this.init();
    if (!this.dialog) return null;
    
    try {
      return await this.dialog.save({
        defaultPath: options.defaultPath || 'untitled.txt',
        filters: options.filters || [{ name: '文本文件', extensions: ['txt'] }]
      });
    } catch (e) {
      console.error('Save file error:', e);
      return null;
    }
  }
}

/**
 * 新闻抓取 API
 */
class TauriNewsAPI {
  constructor() {
    this.invoke = null;
  }

  async init() {
    if (!checkIsTauri()) {
      console.warn('Not in Tauri environment');
      return;
    }
    this.invoke = getInvoke();
  }

  async fetchRSS(source) {
    if (!this.invoke) await this.init();
    if (!this.invoke) throw new Error('Tauri not available');
    
    return await this.invoke('fetch_news_rss', { source });
  }

  async fetchArticle(url) {
    if (!this.invoke) await this.init();
    if (!this.invoke) throw new Error('Tauri not available');
    
    const html = await this.invoke('fetch_article_content', { url });
    return this.extractArticleText(html, url);
  }

  extractArticleText(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const title = doc.querySelector('title')?.textContent || 
                  doc.querySelector('h1')?.textContent || 
                  'Unknown Title';
    
    // 移除脚本和样式
    doc.querySelectorAll('script, style, nav, header, footer, aside').forEach(el => el.remove());
    
    let content = '';
    
    if (url.includes('bbc.com') || url.includes('bbc.co.uk')) {
      content = doc.querySelector('article')?.innerText || '';
    } else if (url.includes('theguardian.com')) {
      content = doc.querySelector('article')?.innerText || '';
    } else if (url.includes('npr.org')) {
      content = doc.querySelector('#storytext')?.innerText || 
                doc.querySelector('article')?.innerText || '';
    } else if (url.includes('zdf.de')) {
      content = doc.querySelector('article')?.innerText || '';
    } else if (url.includes('asahi.com')) {
      content = doc.querySelector('article')?.innerText || 
                doc.querySelector('.main-text')?.innerText || '';
    } else {
      content = doc.querySelector('article')?.innerText || 
                doc.body?.innerText || '';
    }
    
    return { 
      title: title.replace(/\s+/g, ' ').trim(), 
      content: content.replace(/\s+/g, ' ').trim() 
    };
  }

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
    this.invoke = null;
  }

  async init() {
    await this.fileAPI.init();
    this.invoke = getInvoke();
  }

  async exportData() {
    const data = await window.db.exportData();
    
    const filePath = await this.fileAPI.saveFile({
      defaultPath: `easylingo-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (filePath && this.invoke) {
      await this.invoke('write_file_text', { path: filePath, content: data });
    }

    return filePath;
  }

  async importData() {
    const filePath = await this.fileAPI.openFile({
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (!filePath) return null;

    const content = await this.invoke('read_file_text', { path: filePath });
    await window.db.importData(content);

    return filePath;
  }
}

// 创建实例
const tauriFile = new TauriFileAPI();
const tauriNews = new TauriNewsAPI();
const tauriData = new TauriDataAPI();

// 全局暴露
try {
  window.tauriFile = tauriFile;
  window.tauriNews = tauriNews;
  window.tauriData = tauriData;
  window.isTauriEnv = checkIsTauri;
} catch (e) {
  console.warn('Failed to expose Tauri API:', e);
}

// 导出
export { tauriFile, tauriNews, tauriData, checkIsTauri };
