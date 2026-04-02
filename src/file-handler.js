/**
 * EasyLingo File Handler
 * 兼容浏览器和 Tauri 环境的文件处理
 */

class EasyLingoFileHandler {
  constructor() {
    this.isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
  }

  /**
   * 选择文件（浏览器或 Tauri）
   */
  async selectFiles() {
    if (this.isTauri && window.tauriFile) {
      // Tauri 环境 - 使用原生文件选择器
      const filePath = await window.tauriFile.openFile({
        filters: [
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: 'PDF 文档', extensions: ['pdf'] },
          { name: 'Word 文档', extensions: ['docx'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!filePath) return [];

      // 读取文件内容
      const content = await window.tauriFile.readTextFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop();

      return [{
        name: fileName,
        path: filePath,
        content: content,
        isText: true
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
          const fileObjects = [];
          
          for (const file of files) {
            fileObjects.push({
              name: file.name,
              file: file,  // 原始 File 对象
              isText: file.name.match(/\.(txt|md)$/i)
            });
          }
          
          resolve(fileObjects);
        };
        
        input.click();
      });
    }
  }

  /**
   * 解析文件内容
   */
  async parseFile(fileObj) {
    const ext = fileObj.name.split('.').pop().toLowerCase();

    switch (ext) {
      case 'pdf':
        if (fileObj.isText) {
          // Tauri 环境，文本内容可能是空或不完整
          // 需要特殊处理：使用 Tauri 读取二进制然后解析
          return await this.parsePDFWithTauri(fileObj.path);
        }
        return await this.parsePDF(fileObj.file);
      
      case 'docx':
        if (fileObj.isText) {
          return await this.parseDOCXWithTauri(fileObj.path);
        }
        return await this.parseDOCX(fileObj.file);
      
      case 'md':
      case 'txt':
        if (fileObj.content) {
          return fileObj.content;
        }
        return await this.parseText(fileObj.file);
      
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  async parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await this.parsePDFBuffer(arrayBuffer);
  }

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

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    console.log(`PDF parsed: ${pdf.numPages} pages, ${text.length} chars`);
    return text;
  }

  async parseDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  async parseText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  // Tauri 环境下读取二进制文件
  async parsePDFWithTauri(filePath) {
    // 在 Tauri 中，我们需要读取文件为 ArrayBuffer
    // 由于 Tauri fs 插件的限制，暂时返回提示信息
    // 实际实现需要添加二进制文件读取支持
    console.warn('PDF parsing in Tauri requires binary file support');
    throw new Error('PDF 解析在桌面端需要额外配置，请先使用 TXT 或 MD 文件');
  }

  async parseDOCXWithTauri(filePath) {
    console.warn('DOCX parsing in Tauri requires binary file support');
    throw new Error('Word 解析在桌面端需要额外配置，请先使用 TXT 或 MD 文件');
  }
}

// 导出实例
window.fileHandler = new EasyLingoFileHandler();
