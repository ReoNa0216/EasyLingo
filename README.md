# EasyLingo

🎯 **为普通用户打造的桌面端语言学习应用**

EasyLingo 是一个基于 AI 和 SRS（间隔重复系统）的跨平台桌面语言学习应用。无需命令行，双击安装即可使用。

> 📌 **与 PolyLingo 的关系**：EasyLingo 是 PolyLingo 的桌面版，专为不懂代码的用户设计。数据存储在本地 SQLite 数据库，更安全、可备份。

---

## ✨ 核心特性

- 🤖 **AI 智能提取**：从任意文本材料提取学习条目（单词、短语、句子）
- 🔄 **SRS 间隔重复**：基于 SM-2 算法的科学复习系统
- 💾 **本地数据存储**：SQLite 数据库，安全、可备份、无容量限制
- 📄 **文件导入**：支持 TXT、Markdown、PDF、Word 导入
- 📰 **新闻抓取**：内置 BBC、The Guardian、ZDF、朝日新闻等外文新闻源
- 🌐 **跨平台**：Windows 和 macOS 原生支持
- 🔒 **隐私优先**：所有数据本地存储，AI API 直连不经过第三方服务器

---

## 📥 下载安装

### Windows
1. 前往 [Releases 页面](https://github.com/ReoNa0216/EasyLingo/releases) 下载最新版本
2. 下载 `EasyLingo_x.x.x_x64-setup.exe`
3. 双击安装，按向导完成
4. 首次启动配置 AI API（见下方配置说明）

### macOS
1. 前往 [Releases 页面](https://github.com/ReoNa0216/EasyLingo/releases) 下载最新版本
2. 下载 `EasyLingo_x.x.x_x64.dmg`（Intel）或 `EasyLingo_x.x.x_aarch64.dmg`（M1/M2/M3）
3. 打开 DMG，将 EasyLingo 拖入 Applications
4. 首次启动时，前往 **系统设置 > 隐私与安全** 允许应用运行
5. 配置 AI API（见下方配置说明）

---

## ⚙️ 配置 AI API

EasyLingo 需要 AI 服务来提取学习条目和生成测试题。首次使用需要配置：

1. 打开应用，点击右下角 **设置**（齿轮图标）
2. 填写以下信息：
   - **API URL**: 你的 AI 服务地址
     - OpenAI: `https://api.openai.com/v1`
     - GLM: `https://open.bigmodel.cn/api/paas/v4`
   - **API Key**: 你的 API 密钥
   - **模型名称**: 如 `gpt-4`、`glm-4-plus` 等
   - **Max Tokens**: 建议 8000-16000
3. 点击 **保存**

> 💡 **推荐**：GLM-4-Plus 性价比高，适合中文用户

---

## 📚 使用指南

### 添加语言模块
1. 点击左侧边栏底部的 **+** 按钮
2. 选择预设语言或添加自定义语言
3. 配置 AI Prompt（可参考 `prompt-examples` 文件夹）

### 导入学习材料
1. 选择语言模块
2. 点击 **上传材料** 或拖拽文件到窗口
3. 支持格式：TXT、Markdown、PDF、Word
4. AI 自动提取学习条目

### 开始复习
1. 点击 **立即开始复习**
2. 查看正面（原文），思考答案
3. 点击 **显示答案**
4. 根据掌握程度选择：困难 / 一般 / 简单

### 生成测试
1. 点击 **测试** 按钮
2. 选择语言、题型、数量
3. 完成测试查看得分和解析

### 数据备份
1. 点击 **设置** > **导出数据**
2. 选择保存位置，生成 JSON 备份文件
3. 需要恢复时，点击 **导入数据** 选择备份文件

---

## 🔄 从 PolyLingo 迁移

如果你之前在浏览器中使用 PolyLingo：

1. 在 PolyLingo 中导出数据（设置 → 导出数据）
2. 在 EasyLingo 中导入数据（设置 → 导入数据）
3. 所有学习记录将自动迁移

---

## 🏗️ 技术架构

| 层级 | 技术 |
|------|------|
| 前端 | HTML + Tailwind CSS + Vanilla JS |
| 桌面框架 | Tauri v2 (Rust) |
| 数据库 | SQLite |
| 文件系统 | Tauri Native API |
| 新闻抓取 | Rust HTTP Client (无 CORS 限制) |

---

## 🛠️ 开发构建

### 环境要求
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.75+

### 本地开发
```bash
# 克隆仓库
git clone https://github.com/ReoNa0216/EasyLingo.git
cd EasyLingo

# 安装依赖
npm install

# 运行开发版本
npm run tauri dev
```

### 打包发布
```bash
# Windows
npm run tauri build

# Mac
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin
```

---

## 📝 与 PolyLingo 的差异

| 特性 | PolyLingo (Web) | EasyLingo (Desktop) |
|------|-----------------|---------------------|
| 使用方式 | 浏览器访问 | 安装包双击运行 |
| 数据存储 | IndexedDB (浏览器) | SQLite (本地文件) |
| 数据容量 | ~1-2GB 限制 | 无限制 |
| 数据安全 | 易被清理工具删除 | 独立文件，安全 |
| 新闻抓取 | 需要 Vercel 代理 | 内置 Rust HTTP，无需配置 |
| 文件导入 | 浏览器限制 | 原生文件选择器 |
| 离线使用 | 需浏览器缓存 | 完全离线（除 AI 调用） |
| 目标用户 | 懂技术的用户 | 所有用户 |

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

- Web 版问题 → [PolyLingo](https://github.com/ReoNa0216/PolyLingo)
- 桌面版问题 → [EasyLingo](https://github.com/ReoNa0216/EasyLingo)

---

## 📄 许可证

MIT License © 2024 ReoNa0216
