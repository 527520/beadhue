# 02 Firefox 重新裁剪后的保存超时

Status: ready-for-agent
Completion: in-progress
Dependencies: none

已知证据：main9a95b456 的 CI 中裁剪弹窗关闭、图纸生成后仍显示「保存中…」，30秒 waitSaved 超时。没有浏览器异常，无法仅凭快照判定锁或 IndexedDB 挂点。

范围：建立实际 Firefox 反馈循环；复现、最小化、提出可证伪假设后定位。找到根因才修复，并保留本地原图/设计与同步语义。

验收：原反馈循环通过、适合真实调用链的回归先红后绿；无法重现则记录尝试及准确边界，不加超时或跳过测试。

规范：../spec.md、AGENTS.md、CONTEXT.md、diagnosing-bugs 与现有存储 ADR。

2026-10-07：在 macOS Firefox 153.0 / Playwright 1.62.1 / Next.js 16.3.6 运行原用例3次，3通过、0失败、0跳过，单项14.2/12.8/13.9秒。未改源码、等待或跳过条件；3327测试端口已回收。仍需同一候选SHA的Linux/Firefox CI复验，不将未复现标为根因已修复或整票完成。详见 ../firefox-save-diagnosis.md。
