# 花销看板

把 Apple Numbers 里的花销明细，变成手机上能打开的静态网页：看分类占比、按月翻明细。记账仍在 Numbers，这个仓库只负责「导出 → 查看」。

公开仓库和 [GitHub Pages](https://pages.github.com/) 不带账单数据。你的真实账单不要提交上来。

## 本地预览

```bash
npm install
npm run dev
```

浏览器打开终端里给出的地址。同一 Wi-Fi 下可用局域网地址在手机上看。

## Numbers 怎么导出

1. 用一张固定的「花销」表记账，**第一行是表头**。
2. 菜单 **文件 → 导出到 → CSV…**，编码选 UTF-8。
3. 把文件存到手机「文件」或电脑本地。

建议列名（英文或中文都可以，多出来的列会忽略）：

| 必填 | 可用表头 |
| --- | --- |
| 日期 | `date` / 日期 |
| 金额 | `amount` / 金额 |
| 分类 | `category` / 分类 / 账目明细 |

| 选填 | 可用表头 |
| --- | --- |
| 备注 | `note` / 备注 |
| 支付方式 | `payMethod` / 支付方式 |

分类建议固定几项，例如：餐饮、交通、日用、住房、娱乐、医疗、其他。金额用正数；带 `¥` 或千分位逗号也可以。日期用 `2026-08-21` 或 Numbers 默认的 `2026/8/21`。

## 导入真实数据

页面右上角 **导入 CSV**。导入会**整表替换**上次的数据（不和旧文件合并），并记在这个浏览器的 IndexedDB 里。刷新还在；换浏览器、清站点数据或换手机后需要重新导入。

更省事的本地方式：把 Numbers 按月导出的 CSV 放到 `public/data/`，文件名用 `YYYYMM.csv`（例如 `202603.csv`），再跑 `npm run dev`。看板会自动合并这些文件。按月账单已 gitignore；单独账本 `六城漫游.csv` 会进仓库和 Pages。

## 隐私

| 可以进 Git | 不要进 Git |
| --- | --- |
| 看板代码、本 README、`六城漫游.csv` | `public/data/YYYYMM.csv`、其他真实月账单、Numbers 原文件 |

GitHub Pages 会带上六城漫游这本账。按月账单只留在本机或浏览器里。

## 发布到 GitHub Pages

1. 把本仓库推到 GitHub（建议公开仓库，不要包含真实 CSV）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送 `main` 后，工作流 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会构建并发布。

站点里默认能看到六城漫游。按月账单仍需在页面里导入。
