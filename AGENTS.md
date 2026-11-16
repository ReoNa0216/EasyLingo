# EasyLingo 工程约定

- 前端为 `src/` 中的 HTML、Tailwind 和原生 JavaScript；Tauri 原生功能位于 `src-tauri/src/`。
- 复用现有模块和依赖，保持小步修改；不引入未经需求确认的框架重构。
- 应用版号与备份格式独立。当前 JSON 备份格式为 `2.0`，升级应用时不要自动修改备份 version。
- 数据库迁移须保留用户数据；恢复备份须校验字段并在单个事务内完成。
- 原生冒烟测试会修改数据库，只在隔离的 audit 标识应用或全新 CI 安装中运行。
- 不读取、输出或提交用户 API 密钥；文档和截图使用空配置或明确的演示数据。
- `src/vendor/`、`src-tauri/gen/`、`src-tauri/target/`、`dist/`、`artifacts/` 均为生成内容，不提交。
- 修改前端资源后运行 `npm run assets`。本地字体及第三方许可证由 `scripts/prepare-assets.js` 打包。
- 常用检查：`npm run check`、`npm test`、`npm run test:ui`、`cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`。
- Windows 构建：`npm run build:win`；macOS 构建：`npm run tauri -- build --target aarch64-apple-darwin --bundles dmg`。
- 用户指南见 `README.md` 和 `docs/api-configuration.md`；验证范围及发布证据见 `docs/submission-audit.md`。
- 清理只针对已确认的项目生成内容；保留 `.git`、有效源码、维护中的回归测试、用户数据和最终交付文件。
