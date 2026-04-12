# EasyLingo

🎯 **AI 驱动的桌面端语言学习应用**

EasyLingo 是 [PolyLingo](https://github.com/ReoNa0216/PolyLingo) 的桌面版，基于 Tauri v2 + 原生 WebView 构建。数据完全存储在本地，无需命令行，双击安装即可使用。

> 💡 本项目专为普通用户设计，无需技术背景。AI 智能提取学习条目，科学记忆算法帮你高效学习任何语言。

---

## ✨ 核心特性

### 🤖 AI 智能提取
- 支持 TXT、Markdown、PDF、Word 文档导入
- AI 自动提取单词、短语、句子
- 支持英语、德语、日语，可自定义添加任意语言
- **v1.1.0 新增**：自定义模块可随时修改 AI 提示词

### 🧠 科学记忆系统
- 基于 SM-2 算法的间隔重复（SRS）
- 自动计算下次复习时间
- 智能安排每日复习量
- 到期复习提醒

### 📚 学习模式
- **录入模式**：AI 提取 + 手动编辑词条
- **学习模式**：AI 讲解 + 例句展示
- **复习模式**：智能安排 + 掌握度追踪
- **测试模式**：选择题 + 填空题双模式

### 📰 内置资源
- BBC、The Guardian、NPR（英语）
- ZDF（德语）
- 朝日新聞（日语）
- 一键抓取原版新闻

### 🔒 隐私保护
- 所有数据本地存储（IndexedDB）
- 支持导出 JSON 备份
- AI API 直连，不经过第三方服务器

---

## 📥 下载安装

前往 [Releases](https://github.com/ReoNa0216/EasyLingo/releases) 下载最新版本：

| 平台 | 下载文件 |
|------|----------|
| Windows | `EasyLingo_x.x.x_x64-setup.exe` |
| macOS | `EasyLingo_x.x.x_aarch64.dmg` |

### 系统要求
- **Windows**: Windows 10/11 64位
- **macOS**: macOS 11+ (Apple Silicon)

### 首次使用配置

1. **安装应用**：双击安装包，按向导完成安装
2. **获取 API Key**：
   - GLM 用户：参考 [API_configuration.pdf](./API_configuration.pdf)
   - 其他：查阅对应服务商文档
3. **配置 API**：设置 → 填入 API Base URL、API Key、模型名称

支持的 AI 服务：OpenAI、智谱 AI(GLM)、DeepSeek、通义千问等兼容 OpenAI 格式的 API。

---

## 📖 使用指南

### 创建自定义语言模块
1. 首页点击 "添加新语言"
2. 填写语言名称、代码、国家/地区
3. 编写自定义 AI 提示词（可选）
4. 点击 "添加模块"
5. **v1.1.0 新增**：创建后可随时点击"编辑"修改提示词

### 导入学习材料
1. 选择语言模块
2. 点击 "导入文件" 或直接粘贴文本
3. AI 自动提取词条
4. 审核、编辑、确认入库

### 日常学习流程
1. **复习**：每天打开"今日复习"，完成到期词条
2. **学习**：浏览"学习模式"中的新词条
3. **测试**：定期生成测试，检验掌握度
4. **统计**：查看"数据统计"了解学习进度

### 数据备份
- 设置 → 导出数据：生成 JSON 备份文件
- 设置 → 导入数据：恢复之前备份

---

## 📂 数据存储

### 存储位置
数据默认存储在本地：

- **Windows**: 一般在 `C:\Users\<用户名>\AppData\Local\com.reona0216.easylingo\` 下（不同电脑路径可能有差异）
- **macOS**: `~/Library/Application Support/com.reona0216.easylingo/`

> ⚠️ 注意：请勿手动修改这些文件，可能导致数据损坏。

### 备份建议
定期使用应用内的"导出数据"功能备份到安全位置。

---

## 📎 附加资源

- [API_configuration.pdf](./API_configuration.pdf) - API 配置详细说明
- [prompt-examples.zip](./prompt-examples.zip) - AI 提示词示例（法语、韩语等）

---

## 📝 版本历史

### v1.1.0 (最新)
- ✨ 自定义模块支持随时编辑 AI 提示词

### v1.0.0
- 🎉 首个正式版本发布
- 🤖 AI 智能提取学习条目
- 🧠 SRS 间隔重复系统
- 📰 内置多语言新闻源
- 🔒 本地数据存储

---

## 🗺️ 路线图

- [x] v1.1.0 - 模块提示词编辑
- [ ] v2.0 - SQLite 数据库，支持自定义数据存储位置

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

开发分支：
- `main` - 稳定版本
- `v2.0-sqlite` - SQLite 迁移开发中

---

## 📄 许可证

MIT License © 2024 ReoNa0216
