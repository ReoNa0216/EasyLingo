# EasyLingo

桌面语言学习工具，支持从学习材料提取词条、间隔复习、测试与学习记录。

**开发者：陈挚**

**开发单位：清华大学语言教学中心**

**版本：2.1.1**

应用侧栏的「帮助与关于」和「设置」均显示开发者及开发单位。

## 安装包

正式提交版下载：[EasyLingo 2.1.1](https://github.com/ReoNa0216/EasyLingo/releases/tag/v2.1.1)。本版在紫色界面、字体、新图标及配置指南的基础上，修复日语词性标注与编辑。查看[双平台构建与安装验收](https://github.com/ReoNa0216/EasyLingo/actions/runs/43876855049)。各新闻源的实际访问结果及验证范围见[审计记录](docs/submission-audit.md)。

- Windows 10/11 x64：`EasyLingo_2.1.1_x64-setup.exe`，需要 Microsoft Edge WebView2 Runtime，安装器可在缺少时下载。
- macOS Apple Silicon：`EasyLingo_2.1.1_aarch64.dmg`。Intel Mac 不在本轮构建范围内。
- Windows 免安装试用：解压 `EasyLingo_2.1.1_Windows-preview.zip`，双击 `EasyLingo-2.1.1.exe`。试用数据使用独立目录。
- 安装包尚未使用商业代码签名证书或 Apple 公证，系统可能要求确认来源。macOS 已验证包内应用启动，带下载隔离标记时的首次运行提示取决于系统版本。

## 界面预览

以下截图使用隔离演示数据。

![紫色学习概览](docs/images/overview.png)

![日语词条、名词（サ变）标注与注音](docs/images/japanese.png)

## 使用

1. 选择德语、日语、英语或自建语言模块。
2. 按 [API 配置指南](docs/api-configuration.md) 填写地址、密钥、模型和输出长度。智谱 GLM-4-Plus 的 Max Tokens 使用 `4000`。API 地址填写基础路径，不包含 `/chat/completions`。
3. 导入 TXT、Markdown、文本型 PDF、DOCX，或手动添加词条。选择文件后会自动开始 AI 提取；扫描 PDF 需要先 OCR。
4. 按到期词条复习；测试支持选择、填空、翻译。翻译题对照参考答案自行评估。
5. 在设置中导出 JSON 备份。恢复备份会替换当前数据，恢复前请备份；2.1.1 接受 v2.0 格式的完整 JSON 备份。

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
# Windows 免安装试用构建，使用独立数据目录
npm run tauri -- build --no-bundle --config scripts/preview.conf.json
# Apple Silicon Mac
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

浏览器回归测试默认使用已安装的 Microsoft Edge；开发运行 `npm run dev`，使用 Node.js 提供本地静态服务。构建会自动生成本地前端资源。

免安装试用构建的可执行文件位于 `src-tauri/target/release/easylingo.exe`，可复制到任意目录双击运行，运行环境要求与正式版相同。切换回正式版请重新运行正式构建命令。`node_modules/`、`src/vendor/`、`src-tauri/gen/` 和 `src-tauri/target/` 均可重新生成；清理后先运行 `npm ci`。

配置指南的文字源为 `docs/api-configuration.md`。在装有微软雅黑的 Windows 上安装 Python `reportlab` 后，运行 `python scripts/build-guide.py` 可重新生成根目录 PDF；更新界面时同步替换 `docs/images/settings.png`。

## 2.1.1 日语词性修复

- 对齐原生 SQLite 命令的返回格式，修复新增词条后未取得 ID 的问题。

- 将旧数据中的 `Noun` 等常见词性标签显示为中文，保留已标注的活用类型、自他性及自定义内容；不会把所有名词都判为サ变。
- 日语材料提取、空结果重试、批量补全使用同一套中文日语学习术语，区分五段、一段、サ变、カ变、自他动词及两类形容词。
- 修复日语批量补全漏传详细词性要求，以及材料空结果重试误用德语提示的问题。
- 日语、英语及自定义模块的单词均可在编辑窗口修改词性；德语名词性别继续单独保存。
- 更新隔离演示截图：“学習”标为“名词（サ变）”，可接する构成学習する。依据[小学馆《デジタル大辞泉》“学習”词条](https://kotobank.jp/word/%E5%AD%A6%E7%BF%92-11976)的名词及する用法标注。

## 2.1.0 界面更新

- 使用传统紫色色系，统一概览、材料、词条、复习、设置、日历与图表。
- 本地打包 Inter、Noto Sans SC 和 Noto Sans JP 可变字体；中文界面、英语/德语原文与日语原文分别选用相应字库，日语保留注音。
- 已导入材料优先显示；预览支持全文滚动、安全文本呈现、键盘关闭和焦点返回。
- 设置固定显示保存/关闭，窄窗口和放大阅读可继续操作；设置输入不再触发背后的复习快捷键。
- 复习评分改为“忘记、模糊、记得、熟练”，明确每日复习量与已记住比例；从首页只选择一种语言时，记录显示对应语言。
- 字体采用 OFL 许可，许可证随本地字体资源提供；不依赖在线字体服务。
- 应用和安装器统一使用紫色「书页＋对话气泡」图标；配置指南同步当前界面。

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

- [API 配置指南](API_configuration.pdf)（DeepSeek 与智谱官网截图、可复制参数、三个单词首次验证、排错与备份；[文字版](docs/api-configuration.md)）
- [自定义提示词示例](prompt-examples/)
- [MIT License](LICENSE)

本项目由 [PolyLingo](https://github.com/ReoNa0216/PolyLingo) 的桌面版本演进而来。第三方前端组件许可证随应用资源打包。
