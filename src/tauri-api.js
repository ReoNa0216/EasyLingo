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
        console.log(`Trying proxy: ${proxy} for ${url}`);
        const response = await fetch(`${proxy}${encodeURIComponent(url)}`);
        if (!response.ok) {
          console.warn(`Proxy ${proxy} returned ${response.status}`);
          continue;
        }
        
        let html = await response.text();
        console.log(`Proxy ${proxy} returned HTML length: ${html.length}`);
        
        // 检查是否返回了错误信息
        if (html.length < 1000) {
          console.warn(`Proxy ${proxy} returned very short content, may be an error page`);
        }
        
        // allorigins 返回 JSON 格式
        if (proxy.includes('allorigins')) {
          try {
            const json = JSON.parse(html);
            html = json.contents;
            console.log(`AllOrigins content length: ${html?.length || 0}`);
          } catch (e) {
            console.warn('Failed to parse AllOrigins JSON:', e.message);
          }
        }
        
        const result = this.extractArticleText(html, url);
        console.log(`Extracted content length: ${result.content?.length || 0}`);
        return result;
      } catch (e) {
        console.warn(`Proxy ${proxy} failed:`, e.message);
        continue;
      }
    }
    
    throw new Error('All CORS proxies failed');
  }

  extractArticleText(html, url) {
    console.log(`Extracting article from ${url}, HTML length: ${html.length}`);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const title = doc.querySelector('title')?.textContent || 
                  doc.querySelector('h1')?.textContent || 
                  'Unknown Title';
    
    // 移除脚本、样式和无关元素
    doc.querySelectorAll('script, style, nav, header, footer, aside, iframe, svg').forEach(el => el.remove());
    
    // 移除 ZDF 特定的导航和广告元素
    if (url.includes('zdf.de')) {
      doc.querySelectorAll('[class*="navigation"], [class*="breadcrumb"], [class*="meta"], [class*="tag"], [class*="share"], [class*="social"]').forEach(el => el.remove());
    }
    
    let content = '';
    
    if (url.includes('bbc.com') || url.includes('bbc.co.uk')) {
      content = doc.querySelector('article')?.innerText || '';
    } else if (url.includes('theguardian.com')) {
      content = doc.querySelector('article')?.innerText || '';
    } else if (url.includes('npr.org')) {
      content = doc.querySelector('#storytext')?.innerText || 
                doc.querySelector('article')?.innerText || '';
    } else if (url.includes('zdf.de')) {
      // ZDF 内容提取 - 针对 ZDF Heute 网站结构优化
      content = '';
      
      // 方法1: 直接获取 main 标签内的内容
      const main = doc.querySelector('main');
      if (main) {
        content = main.innerText;
        console.log(`ZDF method 1 - main tag, length: ${content.length}`);
      }
      
      // 方法2: 尝试其他选择器（如果 main 内容太短或没有 main）
      if (!content || content.length < 1000) {
        const selectors = [
          'article',
          '[class*="article"]',
          '[class*="content"]',
          '.content',
          '#content',
          'main article',
          '[data-testid="article-body"]',
          '[class*="ArticleBody"]'
        ];
        
        for (const selector of selectors) {
          const el = doc.querySelector(selector);
          if (el && el.innerText.length > (content?.length || 0)) {
            content = el.innerText;
            console.log(`ZDF method 2 - ${selector}, length: ${content.length}`);
          }
        }
      }
      
      // 方法3: 收集所有段落文本
      if (!content || content.length < 1000) {
        const paragraphs = doc.querySelectorAll('p');
        const texts = [];
        paragraphs.forEach(p => {
          const text = p.innerText?.trim();
          // 过滤掉太短的段落
          if (text && text.length > 30) {
            texts.push(text);
          }
        });
        if (texts.length > 0) {
          content = texts.join('\n\n');
          console.log(`ZDF method 3 - paragraphs, count: ${texts.length}, length: ${content.length}`);
        }
      }
      
      // 方法4: 如果以上都失败，尝试从 body 获取所有文本
      if (!content || content.length < 500) {
        const bodyText = doc.body?.innerText || '';
        if (bodyText.length > content.length) {
          // 过滤掉太短的行
          const lines = bodyText.split('\n').filter(line => line.trim().length > 20);
          content = lines.join('\n');
          console.log(`ZDF method 4 - body filtered, lines: ${lines.length}, length: ${content.length}`);
        }
      }
      
      console.log(`ZDF final content length: ${content?.length || 0}`);
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
