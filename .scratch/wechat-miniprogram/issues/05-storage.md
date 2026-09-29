# 05 本地保存与云同步

Status: ready-for-agent
Completion: in-progress
Dependencies: 03,04

## 实现范围

原子保存、恢复、账号隔离、CAS 和原图。范围和安全约束继承 ../spec.md。

## 验收

写入失败不丢旧设计；断网保存；冲突副本；账号不串用。代码验证、模拟器验证、真机验证分别记录，不把缺失证据当作通过。

## 规范

批准 PRD、CONTEXT.md、docs/adr/0028-wechat-personal.md。

## Comments

2026-09-29：依批准计划创建；验证进展集中记录 ../verification.md。

2026-09-29 实施交付：本地文件提交与恢复、会话/目录隔离、CAS、原图上传意图和删除抑制已实现；自动测试通过。待真机配额/中断和真实跨端网络验证。
