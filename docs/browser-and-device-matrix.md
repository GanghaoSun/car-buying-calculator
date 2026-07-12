# 浏览器与真机核验矩阵

本项目是纯静态 Web/PWA，没有后端兜底，因此浏览器能力差异需要显式记录。自动化测试和真机测试分开看：Playwright 的 WebKit 只能代表 WebKit 引擎自动化检查，不能等同于 iPhone Safari 真机。

## 自动化矩阵

运行命令：

```bash
npm run test:e2e:matrix
```

当前矩阵：

| 引擎 | 覆盖内容 | 说明 |
| --- | --- | --- |
| Chromium | 全部 E2E，包括录入、贷款计算、保存、复制、对比、JSON 导入导出、ZIP 备份恢复、证据附件、PNG 长图、PDF 下载、PWA 离线重载、离线 OCR、手机尺寸、主题和键盘操作。 | 作为完整自动化主路径。 |
| Firefox | 核心录入、计算、保存、复制、对比、导入导出、ZIP 备份恢复、证据附件、PNG 长图、PDF 下载、手机尺寸、主题和键盘操作。 | 不把 Playwright Firefox 结果等同于所有桌面 Firefox 版本。 |
| WebKit | 核心录入、计算、保存、复制、对比、导入导出、ZIP 备份恢复、证据附件、PNG 长图、PDF 下载、手机尺寸、主题和键盘操作。 | 不把 Playwright WebKit 结果等同于 iOS Safari 真机。 |

`Chromium-only PWA 可离线重载且页面不依赖外部静态资源` 这条测试只在 Chromium 项目运行，原因是不同引擎对 Service Worker、离线模式、文件下载和 OCR Worker 的测试环境限制不同。

## 真机核验记录模板

| 日期 | 设备 | 系统版本 | 浏览器 | 核验内容 | 结果 | 已知问题 |
| --- | --- | --- | --- | --- | --- | --- |
| 待填写 | Android 手机 | 待填写 | Chrome | 打开 Pages、录入计算、保存记录、分享链接、安装 PWA、离线重载、导出 JSON/PDF/PNG。 | 待核验 | 待填写 |
| 待填写 | iPhone | 待填写 | Safari | 打开 Pages、录入计算、保存记录、分享链接、添加到主屏幕、离线重载、导出 JSON/PDF/PNG。 | 待核验 | 待填写 |
| 待填写 | Windows/macOS/Linux | 待填写 | Firefox | 打开 Pages、录入计算、保存记录、导入导出、PDF/PNG 下载、键盘操作。 | 待核验 | 待填写 |

## 核验重点

- PWA：是否可以添加到主屏幕，断网后是否能打开已缓存页面。
- 文件能力：JSON、ZIP、PDF、PNG 是否能正常下载，移动端是否弹出浏览器权限限制。
- 本地存储：`localStorage` 和 IndexedDB 是否可用，隐私模式下是否被限制。
- OCR：能否加载本地 Worker/WASM/语言包，识别结束后是否进入人工确认弹窗。
- 可访问性：键盘焦点、`Esc` 关闭弹窗、移动端横向溢出是否正常。

真机核验完成后，应把设备型号、系统版本、浏览器版本、失败截图和复现步骤写入本文件或 Issue。
