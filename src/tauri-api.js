/**
 * Tauri API 适配层
 * 封装 Tauri 原生功能
 */

import { invoke } from '@tauri-apps/api/core';

// 检查是否在 Tauri 环境中
const checkIsTauri = () => {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
};

/**
 * 文件操作 API
 */
class TauriFileAPI {
  constructor() {
    this.isTauri = checkIsTauri();
  }

  async openFile(options = {}) {
    if (!this.isTauri) {
      console.warn('Not in Tauri environment');
      return null;
    }
    
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      return await open({
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
    if (!this.isTauri) {
      console.warn('Not in Tauri environment');
      return null;
    }
    
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      return await save({
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
    this.isTauri = checkIsTauri();
    
    // RSS 源配置
    this.rssSources = {
      bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
      guardian: 'https://www.theguardian.com/uk/rss',
      npr: 'https://feeds.npr.org/1001/rss.xml',
      zdf: 'https://www.zdf.de/rss/zdf/nachrichten',
      asahi: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf'
    };
  }

  async fetchRSS(source) {
    if (!this.isTauri) {
      console.warn('Tauri not available, using CORS proxy');
      return this.fetchRSSViaProxy(source);
    }
    
    try {
      // 使用 Tauri 原生 HTTP
      return await invoke('fetch_news_rss', { source });
    } catch (e) {
      console.error('Tauri fetch failed, falling back to proxy:', e);
      return this.fetchRSSViaProxy(source);
    }
  }

  async fetchRSSViaProxy(source) {
    const rssUrl = this.rssSources[source];
    if (!rssUrl) throw new Error(`Unknown source: ${source}`);
    
    // CORS 代理列表
    const corsProxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?'
    ];
    
    for (const proxy of corsProxies) {
      try {
        const response = await fetch(`${proxy}${encodeURIComponent(rssUrl)}`);
        if (!response.ok) continue;
        
        const data = await response.text();
        
        // allorigins 返回 JSON 格式
        if (proxy.includes('allorigins')) {
          const json = JSON.parse(data);
          return json.contents;
        }
        
        return data;
      } catch (e) {
        console.warn(`Proxy ${proxy} failed:`, e.message);
        continue;
      }
    }
    
    throw new Error('All CORS proxies failed');
  }

  async fetchArticle(url) {
    if (!this.isTauri) {
      console.warn('Tauri not available, using CORS proxy');
      return this.fetchArticleViaProxy(url);
    }
    
    try {
      const html = await invoke('fetch_article_content', { url });
      return this.extractArticleText(html, url);
    } catch (e) {
      console.error('Tauri fetch failed, falling back to proxy:', e);
      return this.fetchArticleViaProxy(url);
    }
  }

  async fetchArticleViaProxy(url) {
    const corsProxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?'
    ];
    
    for (const proxy of corsProxies) {
      try {
        const response = await fetch(`${proxy}${encodeURIComponent(url)}`);
        if (!response.ok) continue;
        
        let html = await response.text();
        
        // allorigins 返回 JSON 格式
        if (proxy.includes('allorigins')) {
          const json = JSON.parse(html);
          html = json.contents;
        }
        
        return this.extractArticleText(html, url);
      } catch (e) {
        console.warn(`Proxy ${proxy} failed:`, e.message);
        continue;
      }
    }
    
    throw new Error('All CORS proxies failed');
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
      // ZDF 多种可能的内容容器（按优先级排序）
      const selectors = [
        '[data-testid="article-body"]',  // ZDF 新版样式
        '.article-body',
        'article[data-testid="article"]',
        '[class*="ArticleBody"]',
        '[class*="article-body"]',
        '[class*="ArticleContent"]',
        '.article-content',
        'article[class*="article"]',
        'article .text',  // 可能的文本容器
        'main article',
        'article',
        '[role="main"]',
        'main',
        '.content',
        '#content'
      ];
      
      let bestContent = '';
      for (const selector of selectors) {
        const el = doc.querySelector(selector);
        if (el && el.innerText.length > bestContent.length) {
          bestContent = el.innerText;
          console.log(`ZDF content candidate: ${selector}, length: ${el.innerText.length}`);
        }
      }
      
      // 如果找到的内容太短，尝试获取整个 body 内容并过滤
      if (bestContent.length < 500) {
        const bodyText = doc.body?.innerText || '';
        // 过滤掉脚本、导航等无关内容
        const lines = bodyText.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 20 && 
                 !trimmed.startsWith('var ') &&
                 !trimmed.startsWith('function') &&
                 !trimmed.includes('cookie') &&
                 !trimmed.includes('Cookie') &&
                 !trimmed.includes('ZDF') === false;  // 保留包含 ZDF 的行
        });
        if (lines.join('\n').length > bestContent.length) {
          bestContent = lines.join('\n');
        }
      }
      
      content = bestContent;
      console.log(`ZDF final content length: ${content.length}`);
    } else if (url.includes('asahi.com')) {
      // 朝日新闻可能的多种内容容器
      content = doc.querySelector('article')?.innerText || 
                doc.querySelector('.article')?.innerText ||
                doc.querySelector('.Article')?.innerText ||
                doc.querySelector('[class*="article"]')?.innerText ||
                doc.querySelector('.main')?.innerText ||
                doc.querySelector('.content')?.innerText ||
                doc.querySelector('#main')?.innerText ||
                doc.body?.innerText || '';
    } else {
      // 通用提取
      content = doc.querySelector('article')?.innerText ||
                doc.querySelector('main')?.innerText ||
                doc.querySelector('.content')?.innerText ||
                doc.body?.innerText || '';
    }
    
    // 清理文本
    content = content
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t/g, ' ')
      .trim();
    
    return {
      title: title.trim(),
      content: content,
      url: url
    };
  }
}

/**
 * 文件处理 API
 */
class TauriFileHandler {
  constructor() {
    this.isTauri = checkIsTauri();
  }

  async readFile(path) {
    if (!this.isTauri) {
      throw new Error('File reading requires Tauri environment');
    }
    
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const contents = await readFile(path);
      return new TextDecoder().decode(contents);
    } catch (e) {
      // 回退到 Tauri 命令
      return await invoke('read_file_text', { path });
    }
  }

  async readFileBytes(path) {
    if (!this.isTauri) {
      throw new Error('File reading requires Tauri environment');
    }
    
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(path);
    } catch (e) {
      // 回退到 Tauri 命令
      const result = await invoke('read_file_bytes', { path });
      return new Uint8Array(result);
    }
  }

  async getFileInfo(path) {
    if (!this.isTauri) {
      throw new Error('File info requires Tauri environment');
    }
    
    return await invoke('get_file_info', { path });
  }
}

// 导出单例实例
export const tauriFile = new TauriFileAPI();
export const tauriNews = new TauriNewsAPI();
export const tauriFileHandler = new TauriFileHandler();
export { invoke, checkIsTauri };

// 全局暴露（用于非模块脚本）
window.tauriFile = tauriFile;
window.tauriNews = tauriNews;
window.tauriFileHandler = tauriFileHandler;
window.checkIsTauri = checkIsTauri;
