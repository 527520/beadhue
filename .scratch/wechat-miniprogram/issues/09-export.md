# 09 导出和跨端互通

Status: ready-for-agent
Completion: in-progress
Dependencies: 03,08

## 实现范围

PNG/PDF/ZIP/项目文件；预览保存发送。范围和安全约束继承 ../spec.md。

## 验收

白底/中文/分页正确；项目 Web 双向导入。代码验证、模拟器验证、真机验证分别记录，不把缺失证据当作通过。

## 规范

批准 PRD、CONTEXT.md、docs/adr/0028-wechat-personal.md。

## Comments

2026-09-29：依批准计划创建；验证进展集中记录 ../verification.md。

2026-09-29 实施交付：PNG/PDF/ZIP/v3 项目导入导出已实现，Web 关键导出 E2E 通过。微信画布字体、PDF 预览、发送、相册与低内存能力仍待真机。

2026-10-07 开发者工具首轮验收：微信文件系统项目 v3 导出及真实 Worker ZIP 字节探针通过。PNG/PDF依赖未部署的字体资源，相册/文档/发送与真机仍待验。 详情见 ../devtools-20261007.md。
