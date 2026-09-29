# 08 生成、编辑与跟拼

Status: ready-for-agent
Completion: in-progress
Dependencies: 03,05,06

## 实现范围

图片解码裁剪、Worker、画布手势、历史、进度。范围和安全约束继承 ../spec.md。

## 验收

选图→生成→编辑→跟拼→重启恢复；双指不提交。代码验证、模拟器验证、真机验证分别记录，不把缺失证据当作通过。

## 规范

批准 PRD、CONTEXT.md、docs/adr/0028-wechat-personal.md。

## Comments

2026-09-29：依批准计划创建；验证进展集中记录 ../verification.md。

2026-09-29 实施交付：选图、裁剪、共享生成、编辑历史、变换/生成源、原图恢复和本机跟拼已实现；手势/Worker 单实例/过期消息/算法一致性通过。Canvas/EXIF/200×200 真机待验。
