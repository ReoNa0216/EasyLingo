/**
 * EasyLingo File Handler
 * 兼容浏览器和 Tauri 环境的文件处理
 */

class EasyLingoFileHandler {
  constructor() {
    this.isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
    this.invoke = null;
  }

  async init() {
    if (this.isTauri && !this.invoke) {
      const { invoke } = await import('@tauri-apps/api/core');
      this.invoke = invoke;
    }
  }

  /**
   * 选择文件（浏览器或 Tauri）
   */
  async selectFiles() {
    if (this.isTauri) {
      await this.init();
      
      // Tauri 环境 - 使用原生文件选择器
      const { open } = await import('@tauri-apps/plugin-dialog');
      
      const filePath = await open({
        multiple: false,
        filters: [
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: 'PDF 文档', extensions: ['pdf'] },
          { name: 'Word 文档', extensions: ['docx', 'doc'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!filePath) return [];

      // 获取文件信息
      const fileInfo = await this.invoke('get_file_info', { path: filePath });
      
      return [{
        name: fileInfo.name,
        path: filePath,
        extension: fileInfo.extension,
        size: fileInfo.size,
        isTauri: true
      }];
    } else {
      // 浏览器环境 - 使用原生 input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.md,.pdf,.docx';
        
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          resolve(files.map(file => ({
            name: file.name,
            file: file,
            extension: file.name.split('.').pop().toLowerCase(),
            size: file.size,
            isTauri: false
          })));
        };
        
        input.click();
      });
    }
  }

  /**
   * 解析文件内容
   */
  async parseFile(fileObj) {
    const ext = fileObj.extension || fileObj.name.split('.').pop().toLowerCase();

    switch (ext) {
      case 'pdf':
        if (fileObj.isTauri) {
          return await this.parsePDFTauri(fileObj.path);
        }
        return await this.parsePDFBrowser(fileObj.file);
      
      case 'docx':
      case 'doc':
        if (fileObj.isTauri) {
          return await this.parseDOCXTauri(fileObj.path);
        }
        return await this.parseDOCXBrowser(fileObj.file);
      
      case 'md':
      case 'txt':
        if (fileObj.isTauri) {
          return await this.invoke('read_file_text', { path: fileObj.path });
        }
        return await this.parseTextBrowser(fileObj.file);
      
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  // ========== 浏览器环境解析 ==========
  async parsePDFBrowser(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await this.parsePDFBuffer(arrayBuffer);
  }

  async parseDOCXBrowser(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  async parseTextBrowser(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  // ========== Tauri 环境解析 ==========
  async parsePDFTauri(filePath) {
    await this.init();
    
    // 读取文件为字节数组
    const bytes = await this.invoke('read_file_bytes', { path: filePath });
    
    // 转换为 ArrayBuffer
    const arrayBuffer = new Uint8Array(bytes).buffer;
    
    return await this.parsePDFBuffer(arrayBuffer);
  }

  async parseDOCXTauri(filePath) {
    await this.init();
    
    // 读取文件为字节数组
    const bytes = await this.invoke('read_file_bytes', { path: filePath });
    
    // 转换为 ArrayBuffer
    const arrayBuffer = new Uint8Array(bytes).buffer;
    
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // ========== 通用 PDF 解析 ==========
  async parsePDFBuffer(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';

    // 大PDF优化：每10页为一组处理
    const batchSize = 10;
    for (let i = 1; i <= pdf.numPages; i += batchSize) {
      const endPage = Math.min(i + batchSize - 1, pdf.numPages);
      const pagePromises = [];

      for (let pageNum = i; pageNum <= endPage; pageNum++) {
        pagePromises.push(
          pdf.getPage(pageNum).then(page =>
            page.getTextContent().then(content => ({
              pageNum,
              text: content.items.map(item => item.str).join(' ')
            }))
          )
        );
      }

      const pageResults = await Promise.all(pagePromises);
      pageResults.sort((a, b) => a.pageNum - b.pageNum);
      text += pageResults.map(p => p.text).join('\n') + '\n';

      // 让出主线程
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    console.log(`PDF parsed: ${pdf.numPages} pages, ${text.length} chars`);
    return text;
  }
}

// 导出实例
window.fileHandler = new EasyLingoFileHandler();
