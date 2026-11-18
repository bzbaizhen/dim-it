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

测试入口自动生成纯几何 PDF 与空白加密校验样本，生成文件被 Git 忽略。UI 测试使用隔离临时用户数据目录，输出位于被忽略的 `test-results/`。打包输出在 `release/<version>/`。打包 macOS 需要 Mac 环境。

## 当前批次 · 2026-11-18 换图纸后 Tab 细线切换

鼠标点缩略图或分页按钮后，焦点原先停在按钮，Tab 被浏览器用于焦点导航。现在鼠标换页、页面快捷键和打开图纸会把焦点交回画布。使用 Enter 浏览分页按钮以及在输入框和弹窗内按 Tab，仍遵循键盘焦点导航。原画布复用时，新 PDF 继承了旧 PDF 的描边处理。画布现在按文档加载实例重建，关闭细线时恢复实际原始线宽。

安装版 beta.8 上复现了两处问题。beta.9 构建、46 项单测及虚拟屏上的 12 组桌面回归通过，两项修改在实际应用包上复验通过。0.5.0-beta.9 发布为 GitHub 预发布版本。证据入口为 `test-results/tab-switch-*.log`。

## 2026-11-18 常驻核心快捷键

beta.8 将校准、直线与曲线测量、填色、文字批注、修订和捕捉的当前按键常驻在工具栏。1480 像素中英文界面保持单行，1000×650 窗口内七个默认键仍可见。源码和本地应用包的工作台、改绑专项都于独立虚拟屏通过。beta.8 已安装到 `/Applications/Dim It.app`，签名与已验收包的 SHA-256 核对通过。beta.7 备份位于 `release/0.5.0-beta.8/installed-backup/Dim It.app`。日志位于 `test-results/shortcut-badges-*`。

## 2026-11-18 图纸工作台体验与性能

0.5.0-beta.7 将样式区固定在右栏上方。文字、背景和边框行各自接收常用色及直接输入的 0–100% 不透明度。各工具的新建样式由本机记住，可按当前工具恢复默认。页缩略图与当前页记录使用统一总数，覆盖尺寸、填色、文字和修订。工具栏在宽度不足时保留悬停快捷键提示并收紧间距。

缩略图在接近可见区域时渲染。文字批注复用同一对象的排版结果。曲线以一条连续路径导出，接点用圆角。自动恢复沿用原数据库及完整图纸检查点，编辑、翻页只更新匹配该图纸的轻量记录。旧版可读取完整检查点，包含后续编辑的可移交副本使用「保存项目」生成。

已在 macOS 本机安装。生产构建、46 项单测、虚拟屏上的 12 组桌面回归和安装版专项通过。合成样本中，96 页首屏实际渲染 6 张缩略图，500 条文字批注的 40 次悬停触发测宽由 860,000 次降至 0。128 MiB 图纸的普通编辑保存只写轻量状态，同步提交由约 28.1 ms 降至低于计时分辨率。安装资源和打包源 SHA-256 一致，旧版应用备份在 `release/0.5.0-beta.7/installed-backup/Dim It.app`。验收入口为 `test-results/workbench-virtual-regression.log`、`workbench-installed.log`、`workbench-perf-*.json` 与 `workbench-install.log`。

macOS 界面测试使用独立扩展虚拟屏和临时用户目录。设置 `DIMIT_TEST_DISPLAY` 为虚拟屏 ID 后运行 `npm run test:e2e`。窗口启动时校验目标屏，并在虚拟屏上以非激活方式显示。本次通过系统报告核对，结束后仅保留原两块物理屏。

## 2026-11-18 统一标注样式

直线与曲线测量、区域填色、文字批注和修订云线共用右侧紧凑样式区的色块、0–100% 不透明度滑块、实时预览和撤销。文字批注按文字、背景和边框分行。绘制前可调整当前工具的默认样式，直线和曲线共用默认值。选中后修改当前对象。

尺寸和修订的不透明度作为可选字段保存，旧项目按 100% 显示。画布和 PDF 导出的线条、尺寸标签和修订编号使用相应不透明度。项目格式版本沿用 v1 至 v4。

0.5.0-beta.6 已安装到 `/Applications/Dim It.app` 并启动，原图纸成功恢复，实际界面已回读尺寸、填充、修订和文字样式控件。构建、46 项单测及完整 11 组 Electron 回归通过，包含项目重开、PDF 不透明度和 1000×650 中英文布局。安装签名核验通过，资源与已测试构建一致。证据见 `test-results/appearance-unified-result.json` 和 `appearance-unified-*.log`，恢复包为 `release/0.5.0-beta.5/mac-arm64/Dim It.app`。

## 2026-11-17 批注样式区

用户要求进一步压缩样式区。本轮将颜色与不透明度排成同一行，缩小区块间距和字号控件，HEX 色值移到色块悬停提示，填色不透明度也改为横排。文字批注样式区实测高 197px，1000×650 的中英文界面均无横向溢出，滑块保留至少 55px 可操作宽度。构建、46 项单测及批注、填色、双语三组专项通过。0.5.0-beta.5 已安装并启动，实际紧凑布局已目视核验，安装资源与构建一致、签名完整性通过。证据为 `test-results/appearance-compact-result.json`、`appearance-compact-*.log` 和 `annotations-appearance-compact-minimum-en.png`。恢复包为 `release/0.5.0-beta.4/mac-arm64/Dim It.app`。

目标为在右侧独立样式区完成文字批注的文字、背景和边框颜色与不透明度调整，并贯通新建默认样式、实时预览、撤销、项目重开和 PDF 导出。内容编辑置于样式区上方，字号、区域填色和修订颜色也集中在此区域。MarkupStyle 作为 v4 项目的可选字段，旧数据沿用原有白底 94% 不透明度及标注色。

构建、46 项单测与完整 11 组 Electron 回归通过。新增验收覆盖三个独立样式通道、完全透明、滑块一步撤销、新建默认值、旧 v4 项目、四种方向、保存重开与 PDF 填充/边框/文字 alpha。0.5.0-beta.4 已安装到 `/Applications/Dim It.app` 并启动，安装版专项通过，实际版本及六个颜色/不透明度控件已回读。安装资源与已验证构建一致，签名完整性通过。本批次已完成，证据为 `test-results/appearance-result.json`、`appearance-*.log`、`annotations-appearance.png` 与 `annotations*.pdf`，恢复包为 `release/0.5.0-beta.3/mac-arm64/Dim It.app`。

## 2026-11-17 捕捉设置划过白屏

已复现 0.5.0-beta.2 的白屏现象。全屏关闭面板按钮的透明背景被通用按钮 hover 样式覆盖，实际变为 `rgb(234, 240, 245)` 并遮住工作区。已为该遮罩的 hover/active 状态指定透明背景，并取消按下位移。

新增回归先在旧构建失败，再在修复后通过。覆盖面板打开时多点划过、按下、松开关闭、画布可见及无渲染异常，原捕捉设置完整流程与 45 项单测通过。修复前后截图为 `test-results/snap-settings-hover-before.png` 与 `snap-settings-hover.png`，日志为 `snap-hover-red.log`、`snap-hover-green.log` 与 `snap-hover-packaged.log`。0.5.0-beta.3 打包版专项通过，已安装到 `/Applications/Dim It.app` 并正常启动，已回读实际版本并目视确认设置打开后图纸可见。当前修复已完成，验收摘要为 `test-results/snap-hover-result.json`，恢复版本为 `release/0.5.0-beta.2/mac-arm64/Dim It.app`。

## 2026-11-17 捕捉设置开发批次

本批次目标为在图纸选点中组合启用端点、中点、交点、最近点、垂足与切点，并保留设置、已有捕捉快捷键和 SmartTrack。默认三种类型沿用端点、中点、交点，支持「仅此项」、右键单项启用、全选、清空和恢复默认。垂足与切点使用已选起点，作用于校准、直线测量和多边形后续顶点。最近点作为其他离散候选的补充。

原始二次/三次 Bézier 控制点接入空间索引，曲线最近点、垂足和切点使用数值求根。中点复用自适应细分半弧长，交点范围为有限直线段。45 项单测与完整 11 组 Electron 回归通过，独立只读审查未发现必要修复，另有 12,000 组已知真切点/垂足探针通过。

候选及验收入口为 `test-results/snap-candidate.json`、`snap-regression-result.json`、`snap-regression.log` 与 `snap-review.md`。0.5.0-beta.2 打包版专项通过，已安装到 `/Applications/Dim It.app` 并启动，实际界面的版本与六种捕捉选项已回读。安装包 `app.asar` 与已测试源一致，签名完整性检查通过。本批次必需工作已完成，步骤详见 `docs/usage.md`。旧版恢复副本为 `release/0.5.0-beta.1/installed-backup/Dim It.app`，本地测试包沿用下述 Ad Hoc 构建方式。

## 2026-11-17 文字与修订开发批次

本批次目标为在图纸上完成文字批注与修订云线的创建、编辑、移动缩放、保存重开和 PDF 导出。新增快捷键 5 / 6，沿用颜色、删除、撤销重做、双语与原生菜单。项目新增 v4 格式，继续读取 v1 至 v3。文字按高清图像写入 PDF，框线、云线和三角修订标记使用矢量。

本机生产构建与 34 项单测通过，10 组 Electron 流程分别通过，覆盖新增标注及原有测量、填色、曲线、捕捉、SmartTrack、引导和快捷键。工具栏换行暴露的区域顶点重合坐标差已修复，填色流程重验通过。曲线悬停预览有一次超时，独立重跑通过。视觉证据与合成图纸导出位于 `test-results/annotations-*.png`、`test-results/annotations*.pdf`，使用说明见 `docs/usage.md`。

本地测试版本为 **0.5.0-beta.1**，已于 2026-11-17 安装到 `/Applications/Dim It.app` 并启动。安装后的 ARM64 应用通过文字批注、修订云线、保存重开及 PDF 导出专项，安装文件与打包源的 `app.asar` 哈希一致，签名完整性检查通过。采用 Ad Hoc 本地测试签名，普通运行时可用。现有公开 Release 为 0.4.3，Developer ID 签名发布及 Windows 实机验收为后续开放项。

本地测试包使用已安装的 Electron 分发文件，构建命令如下。Ad Hoc 测试包关闭 Hardened Runtime，避免不同 Team ID 的本地框架加载失败。

```sh
npm run build
npx --no-install electron-builder --mac dir --arm64 --config.electronDist=node_modules/electron/dist --config.mac.identity=- --config.mac.hardenedRuntime=false
```

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
