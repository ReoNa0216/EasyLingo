# EasyLingo

🎯 **为普通用户打造的桌面端语言学习应用**

EasyLingo 是 [PolyLingo](https://github.com/ReoNa0216/PolyLingo) 的桌面版，基于 Tauri v2 + 原生 WebView 构建。数据完全存储在本地 IndexedDB 中，无需命令行，双击安装即可使用。

> 本项目从 PolyLingo 迁移而来，保留了所有核心功能，同时针对桌面环境进行了最小化适配：移除了浏览器代理依赖，新闻抓取和文件导入均由应用原生支持。

---

## ✨ 核心特性

- 🤖 **AI 智能提取**：从任意文本材料提取学习条目（单词、短语、句子）
- 🔄 **SRS 间隔重复**：基于 SM-2 算法的科学复习系统
- 💾 **本地数据存储**：IndexedDB 数据库，安全、可备份
- 📄 **文件导入**：支持 TXT、Markdown、PDF、Word 导入
- 📰 **新闻抓取**：内置 BBC、The Guardian、NPR、ZDF、朝日新聞等外文新闻源
- 🔒 **隐私优先**：所有数据本地存储，AI API 直连不经过第三方服务器

---

## 📥 下载安装

前往 [Releases](https://github.com/ReoNa0216/EasyLingo/releases) 下载：
- **Windows**: `EasyLingo_x.x.x_x64-setup.exe`
- **macOS**: `EasyLingo_x.x.x.dmg`

### 首次使用配置
首次使用前需要在设置中配置 AI API：
- **GLM 用户**：默认已填写 `https://open.bigmodel.cn/api/paas/v4`，只需填入 API Key
- **其他模型**：请参考 [API配置说明.pdf](./API配置说明.pdf) 修改 API Base URL

支持的 AI 服务：OpenAI、智谱 AI(GLM)、DeepSeek、通义千问等兼容 OpenAI 格式的 API。

---

## 🛠️ 开发构建

### 环境要求
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.75+

### 本地开发
```bash
npm install
npm run tauri dev
```

### 打包发布

**Windows (.exe)**
```bash
npm run tauri build
```
安装包位于 `src-tauri/target/release/bundle/nsis/`。

**macOS (.dmg)**
```bash
npm run tauri build
```
安装包位于 `src-tauri/target/release/bundle/dmg/`。

> **注意**：macOS 版本必须在 macOS 系统上构建。可以使用 GitHub Actions 自动构建双平台版本。

---

## 📝 与 PolyLingo 的差异

| 特性 | PolyLingo (Web) | EasyLingo (Desktop) |
|------|-----------------|---------------------|
| 使用方式 | 浏览器访问 | Windows / macOS 安装包 |
| 数据存储 | IndexedDB (浏览器) | IndexedDB (桌面 WebView，无容量限制) |
| 新闻抓取 | 需要 Vercel 代理 | Rust 原生 HTTP，无需配置 |
| 文件导入 | 浏览器限制 | 原生文件选择器 |
| 目标用户 | 懂技术的用户 | 所有用户 |
| 支持平台 | 所有有浏览器的设备 | Windows 10/11, macOS 11+

---

## 📄 许可证

MIT License © 2024 ReoNa0216
