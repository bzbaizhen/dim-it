# 开发与发布

[English](development.en.md) · [返回 README](../README.md)

## 本地开发

使用 Node.js 24+ 与 npm，依赖由 `package-lock.json` 锁定。

```bash
npm ci
npm run desktop
```

浏览器调试执行 `npm run dev`。桌面模式提供原生文件打开与保存对话框。

```bash
npm run build
npm test
npm run test:e2e
npm run package:mac
npm run package:win
```

测试入口自动生成纯几何 PDF 与空白加密校验样本，生成文件被 Git 忽略。UI 测试使用隔离临时用户数据目录，输出位于被忽略的 `test-results/`。打包输出在 `release/0.4.3/`。打包 macOS 需要 Mac 环境。

## Mac 签名与公证

在本机钥匙串安装含私钥的 `Developer ID Application` 证书。使用以下命令交互式录入 Apple ID、Team ID 和 App 专用密码，公证凭据保存在钥匙串中。

```sh
xcrun notarytool store-credentials dim-it-notary
npm run package:mac:signed
```

签名构建沿用当前 ARM64 目标，输出到 `release/<版本>/mac-signed/`。流程包括 Hardened Runtime、应用和 DMG 签名、公证、票据附加、Gatekeeper 检查与 SHA-256。缺少证书或有效公证凭据时停止。可用 `APPLE_KEYCHAIN_PROFILE` 指定其他公证配置，多个签名身份可通过 `CSC_NAME` 选择。私钥与公证凭据保留在本机钥匙串，发布状态以 Releases 中的实际制品为准。

2026-11-05 已完成本机 0.4.3 ARM64 应用与 DMG 签名、公证及票据验证，Gatekeeper 显示 `Notarized Developer ID`。已签名应用的双语、校准、测量与保存专项通过。签名制品可从 GitHub Releases 下载。

## 实现与 0.4.3 验收记录

React / TypeScript、PDF.js、pdf-lib 与 Electron。选点保存为 PDF 原生坐标，比例以 mm / PDF 坐标单位表示，显示与导出时换算单位。兼容早期 PlanMeasure 的 `.planmeasure` 项目与本机自动恢复数据。

0.4.3 已在 Apple Silicon Mac 通过生产构建、29 项单测、9 组 Electron 工作流回归及最终 Mac 应用包实跑。覆盖快捷键、区域填色、细线显示，以及既有测量、校准、保存重开、导出、捕捉、智慧轨迹和双语引导。两平台包内版本、源码资源一致性、客户图纸排除、DMG 完整性与 SHA-256 已核验。Windows 实机验收是当前开放项。源码默认分支为 `main`，发布制品以对应 Release 为准。
