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
    this.invoke = null;
  }

  async init() {
    if (!isTauri()) {
      console.warn('Not in Tauri environment, file operations will not work');
      return;
    }
    
    const { invoke } = await import('@tauri-apps/api/core');
    const { open, save } = await import('@tauri-apps/plugin-dialog');
    
    this.invoke = invoke;
    this.dialog = { open, save };
  }

  /**
   * 打开文件选择对话框
   */
  async openFile(options = {}) {
    if (!this.dialog) await this.init();
    if (!isTauri()) return null;

    const filters = options.filters || [
      { name: '文本文件', extensions: ['txt', 'md'] },
      { name: 'Word 文档', extensions: ['doc', 'docx'] },
      { name: '所有文件', extensions: ['*'] }
    ];

    return await this.dialog.open({
      multiple: false,
      filters: filters
    });
  }

  /**
   * 保存文件对话框
   */
  async saveFile(options = {}) {
    if (!this.dialog) await this.init();
    if (!isTauri()) return null;

    return await this.dialog.save({
      defaultPath: options.defaultPath || 'untitled.txt',
      filters: options.filters || [{ name: '文本文件', extensions: ['txt'] }]
    });
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
   */
  async fetchRSS(source) {
    if (!this.invoke) await this.init();
    if (!isTauri()) throw new Error('News fetching requires Tauri environment');

    return await this.invoke('fetch_news_rss', { source });
  }

  /**
   * 获取文章内容并提取纯文本
   * @param {string} url - 文章 URL
   * @returns {Promise<{title: string, content: string}>}
   */
  async fetchArticle(url) {
    if (!this.invoke) await this.init();
    if (!isTauri()) throw new Error('News fetching requires Tauri environment');

    const html = await this.invoke('fetch_article_content', { url });
    
    // 提取纯文本内容
    return this.extractArticleText(html, url);
  }

  /**
   * 从 HTML 中提取文章文本
   */
  extractArticleText(html, url) {
    // 创建 DOM 解析器
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取标题
    const title = doc.querySelector('title')?.textContent || 
                  doc.querySelector('h1')?.textContent || 
                  'Unknown Title';
    
    // 移除脚本和样式元素
    doc.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads').forEach(el => el.remove());
    
    let content = '';
    
    // 针对不同网站的特定选择器
    if (url.includes('bbc.com') || url.includes('bbc.co.uk')) {
      content = this.extractBBCContent(doc);
    } else if (url.includes('theguardian.com')) {
      content = this.extractGuardianContent(doc);
    } else if (url.includes('npr.org')) {
      content = this.extractNPRContent(doc);
    } else if (url.includes('zdf.de')) {
      content = this.extractZDFContent(doc);
    } else if (url.includes('asahi.com')) {
      content = this.extractAsahiContent(doc);
    } else {
      // 通用提取策略
      content = this.extractGenericContent(doc);
    }
    
    // 清理文本
    content = this.cleanText(content);
    
    return { title: this.cleanText(title), content };
  }

  extractBBCContent(doc) {
    // BBC 文章通常在 article 标签或特定 data-component 中
    const article = doc.querySelector('article');
    if (article) {
      return article.innerText;
    }
    
    // 备选选择器
    const contentDiv = doc.querySelector('[data-component="text-block"]');
    if (contentDiv) {
      return contentDiv.innerText;
    }
    
    return this.extractGenericContent(doc);
  }

  extractGuardianContent(doc) {
    // Guardian 文章内容
    const article = doc.querySelector('article');
    if (article) {
      return article.innerText;
    }
    
    const contentDiv = doc.querySelector('.article-body');
    if (contentDiv) {
      return contentDiv.innerText;
    }
    
    return this.extractGenericContent(doc);
  }

  extractNPRContent(doc) {
    // NPR 文章内容
    const story = doc.querySelector('#storytext') || doc.querySelector('.storytext');
    if (story) {
      return story.innerText;
    }
    
    const article = doc.querySelector('article');
    if (article) {
      return article.innerText;
    }
    
    return this.extractGenericContent(doc);
  }

  extractZDFContent(doc) {
    // ZDF 文章内容
    const article = doc.querySelector('article') || doc.querySelector('.content');
    if (article) {
      return article.innerText;
    }
    
    return this.extractGenericContent(doc);
  }

  extractAsahiContent(doc) {
    // 朝日新闻文章内容
    const article = doc.querySelector('article') || doc.querySelector('.article');
    if (article) {
      return article.innerText;
    }
    
    const contentDiv = doc.querySelector('.main-text') || doc.querySelector('#main');
    if (contentDiv) {
      return contentDiv.innerText;
    }
    
    return this.extractGenericContent(doc);
  }

  extractGenericContent(doc) {
    // 通用策略：查找最可能包含文章内容的元素
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.content',
      '.article-body',
      '.post-content',
      '.entry-content',
      '#content',
      '#main-content'
    ];
    
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const text = element.innerText;
        // 如果内容足够长，可能是文章
        if (text.length > 500) {
          return text;
        }
      }
    }
    
    // 最后的备选：取 body 中的段落
    const paragraphs = doc.querySelectorAll('p');
    let text = '';
    paragraphs.forEach(p => {
      if (p.innerText.length > 50) {
        text += p.innerText + '\n\n';
      }
    });
    
    return text || doc.body.innerText;
  }

  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')           // 合并多个空白
      .replace(/\n\s*\n/g, '\n\n')    // 合并多个空行
      .replace(/^\s+|\s+$/g, '')     // 去除首尾空白
      .trim();
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
    this.invoke = null;
  }

  async init() {
    await this.fileAPI.init();
    if (isTauri() && !this.invoke) {
      const { invoke } = await import('@tauri-apps/api/core');
      this.invoke = invoke;
    }
  }

  /**
   * 导出数据到 JSON 文件
   */
  async exportData() {
    const { db } = window;
    const data = await db.exportData();
    
    const filePath = await this.fileAPI.saveFile({
      defaultPath: `easylingo-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (filePath && this.invoke) {
      await this.invoke('write_file_text', { path: filePath, content: data });
    }

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

    const content = await this.invoke('read_file_text', { path: filePath });
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
