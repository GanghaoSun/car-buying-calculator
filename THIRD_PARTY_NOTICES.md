# 第三方软件声明

本项目本身使用 MIT License。为实现断网运行，仓库在 `vendor/` 中分发以下固定版本的第三方浏览器运行资源。第三方组件仍分别受其原许可证约束。

| 组件 | 版本 | 本项目用途 | 许可证 | 许可证文件 |
| --- | --- | --- | --- | --- |
| Tesseract.js | 5.1.1 | OCR 浏览器入口与 Worker | Apache-2.0 | `vendor/licenses/tesseract.js-5.1.1-APACHE-2.0.md` |
| tesseract.js-core | 5.1.1 | OCR WebAssembly 核心 | Apache-2.0 | `vendor/licenses/tesseract.js-core-5.1.1-APACHE-2.0.txt` |
| `@tesseract.js-data/chi_sim` | 1.0.0 | 简体中文识别数据 | MIT | 见下方语言数据声明 |
| `@tesseract.js-data/eng` | 1.0.0 | 英文识别数据 | MIT | 见下方语言数据声明 |
| qrcode | 1.5.4 | 浏览器端二维码生成 | MIT | `vendor/licenses/qrcode-1.5.4-MIT.txt` |
| JSZip | 3.10.1 | 完整备份 ZIP 生成与恢复 | MIT（本项目按 MIT 条款使用） | `vendor/licenses/jszip-3.10.1.txt` |
| html2canvas | 1.4.1 | 浏览器端 PNG 长图渲染 | MIT | `vendor/licenses/html2canvas-1.4.1-MIT.txt` |

## Tesseract 语言数据

`@tesseract.js-data/chi_sim` 与 `@tesseract.js-data/eng` 的 npm 包元数据声明为 MIT License，作者为 Balearica，贡献者包括 Balearica 和 jeromewu。包内没有单独附带许可证文本，以下保留 MIT 条款：

```text
MIT License

Copyright (c) Balearica and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

构建和测试依赖的完整版本记录见 `package-lock.json`；它们未作为应用运行资源复制到 `vendor/`。
