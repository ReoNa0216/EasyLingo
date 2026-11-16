# EasyLingo

桌面语言学习工具，支持从学习材料提取词条、间隔复习、测试与学习记录。

**开发者：陈挚**

**开发单位：清华大学语言教学中心**

**版本：2.0.1**

应用侧栏的「帮助与关于」和「设置」均显示开发者及开发单位。

## 安装包

正式发布下载：[GitHub Releases](https://github.com/ReoNa0216/EasyLingo/releases)。2.0.1 功能基线的双平台安装包已通过[构建和安装验收](https://github.com/ReoNa0216/EasyLingo/actions/runs/43806912722)，可在 Actions 登录下载（产物保留 7 天）。包内含 China Daily、人民网、NPR 默认选项和简短代理标签，开发署名完整。PR 和 Release 仍为草稿，尚未正式发布；用户提出的整体 UI 改版另行确定后执行。各新闻源的实际访问结果见[审计记录](docs/submission-audit.md)。

- Windows 10/11 x64：`EasyLingo_2.0.1_x64-setup.exe`，需要 Microsoft Edge WebView2 Runtime，安装器可在缺少时下载。
- macOS Apple Silicon：`EasyLingo_2.0.1_aarch64.dmg`。Intel Mac 不在本轮构建范围内。
- 安装包尚未使用商业代码签名证书或 Apple 公证，系统可能要求确认来源。macOS 的首次运行行为仍需按目标设备系统版本验收。

## 使用

1. 选择德语、日语、英语或自建语言模块。
2. 导入 TXT、Markdown、文本型 PDF、DOCX，或手动添加词条。扫描 PDF 需要先 OCR。
3. 在设置中填写兼容 OpenAI 格式的 API 地址、密钥与模型名称，使用 AI 提取和出题。API 地址填写基础路径，例如供应商文档中的 `/v1`，不包含 `/chat/completions`。
4. 按到期词条复习；测试支持选择、填空、翻译。翻译题对照参考答案自行评估。
5. 在设置中导出 JSON 备份。恢复备份会替换当前数据，恢复前请备份；2.0.1 接受 v2.0 格式的完整 JSON 备份。

界面、图表、日历、文件解析器随安装包提供。已有词条的阅读和复习可离线使用；AI 和新闻抓取需要联网。软件会读取 Windows/macOS 系统代理设置；更改代理后请重启软件。新闻网站可能限制当前网络的访问或改变页面结构，界面会显示具体失败原因。

日语新闻使用人民网日语版；英语默认 NPR，另提供 China Daily（China 栏目最新英语文章）、BBC 和 The Guardian；德语使用 ZDFheute。BBC、Guardian 标注“需代理”，适用于部分网络下无法直连的情况。新闻导入均保留来源及原文链接。各来源在直连与代理下的可用性分别测试，结果见审计记录。

## 数据与隐私

学习记录与 API 密钥保存在本机 SQLite 数据库。AI 功能将相关学习材料、词条和提示词发送至您配置的 API 服务商，费用按该服务商规则收取。JSON 备份不包含 API 密钥，恢复后重新填写。

- Windows：`%APPDATA%/com.reona0216.easylingo/polylingo.db`
- macOS：`~/Library/Application Support/com.reona0216.easylingo/polylingo.db`
- 自定义目录在重启后生效，当前数据不会自动搬迁。只选择自己管理的可信目录；交换学习资料请使用 JSON 备份。

AI 生成的释义、例句、题目和参考答案需结合原文核对。当前复习调度采用分级间隔规则。

## 从源码构建

需要 Node.js 24、Rust 1.94 或更新稳定版，以及 [Tauri v2 对应系统构建依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm ci
npm run assets
npm run check
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run test:ui
npm run build:win
# Apple Silicon Mac
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

浏览器回归测试默认使用已安装的 Microsoft Edge；开发运行 `npm run dev`，使用 Node.js 提供本地静态服务。构建会自动生成本地前端资源。

## 2.0.1 修复

- 数据库升级采用补字段迁移，保留旧数据；修复旧时间戳导致词条无法进入复习的问题。
- 完整备份恢复纳入卡片与学习记录，校验后在单个事务内写入，出错回滚。
- 修复自定义模块修改、词条编辑关闭弹窗、模块删除残留词条、存储目录切换问题。
- 修复短时复习不计数、快速重复评分、每日限额为 1 时抽不到词条、混合测试语言判分问题。
- AI 请求改用原生网络连接并设置超时；错误提取结果显示失败；更新 PDF 解析器和前端内容净化。
- 日语新闻改用人民网，修复新闻历史清空后重新加载旧记录的问题；全部新闻源的 AI 提取失败时保留预览供重试，重复点击不会重复导入。
- 增加 China Daily 英语新闻，默认 NPR，BBC 与 Guardian 使用简短代理标签。
- 移除运行时 CDN 依赖，补齐离线界面资源、开发署名、许可证、自动化回归与双平台构建。

完整审计和验收记录见 [docs/submission-audit.md](docs/submission-audit.md)。

## 资源与许可

- [API 配置示例](API_configuration.pdf)（旧版 GLM 配置示例，具体模型和价格以供应商当前文档为准）
- [自定义提示词示例](prompt-examples/)
- [MIT License](LICENSE)

本项目由 [PolyLingo](https://github.com/ReoNa0216/PolyLingo) 的桌面版本演进而来。第三方前端组件许可证随应用资源打包。
