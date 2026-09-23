# 02 官方批次发布确认弹窗序号裁剪

Status: ready-for-human
Completion: complete

## 目标
发布已勾选草稿弹窗里 10 项以上时，序号完整可见。

## 范围
- `.batch-dialog ul`（`globals.css:756`）由 `list-style: decimal` + 20px padding 改为计数器 + 网格：`counter-reset` / `li::before { content: counter(n) "." }` / `grid-template-columns: 2.5rem minmax(0,1fr)`，保留 `max-height: 40vh` 与滚动。
- e2e 15 扩展：勾选 ≥10 项后断言 `ul.scrollWidth <= ul.clientWidth` 且第 10 行标记可见。

## 验收
e2e 断言通过；弹窗截图存档。
