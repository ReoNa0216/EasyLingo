# EasyLingo

🎯 **为普通用户打造的桌面端语言学习应用**

EasyLingo 是 [PolyLingo](https://github.com/ReoNa0216/PolyLingo) 的桌面版，基于 Tauri v2 + SQLite 构建。数据完全存储在本地数据库中，无需命令行，双击安装即可使用。

> 本项目从 PolyLingo 迁移而来，保留了所有核心功能，同时针对桌面环境进行了最小化适配：移除了浏览器代理依赖，新闻抓取和文件导入均由应用原生支持。v2.0.0 起数据层已从 IndexedDB 全面迁移至 SQLite，支持更大的数据量和更灵活的备份管理。

---

## ✨ 核心特性

- 🤖 **AI 智能提取**：从任意文本材料提取学习条目（单词、短语、句子）
- 🔄 **SRS 间隔重复**：基于 SM-2 算法的科学复习系统
- 💾 **本地 SQLite 存储**：数据库存储在本地磁盘，安全、无容量限制、可备份
- 📄 **文件导入**：支持 TXT、Markdown、PDF、Word 导入
- 📰 **新闻抓取**：内置 BBC、The Guardian、NPR、ZDF、朝日新聞等外文新闻源
- 📝 **快速测试**：支持单模块测试与混合语言测试，自动生成选择题、填空题和翻译题
- 🔒 **隐私优先**：所有数据本地存储，AI API 直连不经过第三方服务器

---

## 📥 下载安装

前往 [Releases](https://github.com/ReoNa0216/EasyLingo/releases) 下载：
- **Windows**: `EasyLingo_2.0.0_x64-setup.exe`
- **macOS**: `EasyLingo_2.0.0_aarch64.dmg`

### 系统要求
- **Windows**: Windows 10/11 64位
- **macOS**: macOS 11+ (Apple Silicon)

### 首次使用配置

首次使用前需要在设置中配置 AI API：

- **GLM 用户**：请参考 [API_configuration.pdf](./API_configuration.pdf) 了解如何获取 API Key 和选择模型
- **其他模型用户**：请自行查阅对应模型提供商的官方文档，获取 API Base URL 和模型名称

支持的 AI 服务：OpenAI、智谱 AI(GLM)、DeepSeek、通义千问等兼容 OpenAI 格式的 API。

### 数据存储位置

您的学习数据存储在本地 SQLite 数据库中，不同系统位置如下：

- **Windows**: `%APPDATA%/com.reona0216.easylingo/polylingo.db`
- **macOS**: `~/Library/Application Support/com.reona0216.easylingo/polylingo.db`
- **数据导出**：应用内支持导出 JSON 备份文件

---

## 📝 与 PolyLingo 的差异

| 特性 | PolyLingo (Web) | EasyLingo (Desktop) |
|------|-----------------|---------------------|
| 使用方式 | 浏览器访问 | Windows / macOS 安装包 |
| 数据存储 | IndexedDB (浏览器，受容量限制) | SQLite (本地磁盘，无容量限制) |
| 新闻抓取 | 需要 Vercel 代理 | Rust 原生 HTTP，无需配置 |
| 文件导入 | 浏览器限制 | 原生文件选择器 |
| 目标用户 | 懂技术的用户 | 所有用户 |
| 支持平台 | 所有有浏览器的设备 | Windows 10/11, macOS 11+ |

---

## 🚀 版本更新

### v2.0.0
- **数据层迁移**：从 IndexedDB 全面迁移至 SQLite (tauri-plugin-sql)
- **混合测试优化**：按语言均匀抽取条目，确保每种选中语言都能参与出题
- **仪表盘修复**：修复今日复习数量统计错误，测试记录不再计入复习进度
- **活动日志修复**：混合复习/测试统一显示为"混合"
- **测试历史完善**：保存完整的题目、答案、结果和时长信息
- **自定义模块增强**：支持自定义 Prompt 注入到提取和测试生成流程

---

## 📎 附加资源

- [API_configuration.pdf](./API_configuration.pdf) - GLM API 配置详细说明
- [prompt-examples/](./prompt-examples/) - AI 提示词示例

---

## 📄 许可证

MIT License © 2024 ReoNa0216
