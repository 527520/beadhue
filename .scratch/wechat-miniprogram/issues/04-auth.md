# 04 共用后端与微信认证

Status: ready-for-agent
Completion: complete
Dependencies: 03

## 实现范围

增量迁移、会话类型、绑定、限流和私人接口授权。范围和安全约束继承 ../spec.md。

## 验收

绑定冲突、token 类型、来源校验、退出/撤销/注销契约测试。代码验证、模拟器验证、真机验证分别记录，不把缺失证据当作通过。

## 规范

批准 PRD、CONTEXT.md、docs/adr/0028-wechat-personal.md。

## Comments

2026-09-29：依批准计划创建；验证进展集中记录 ../verification.md。

2026-09-29 实施交付：增量迁移与后端认证实现完成；mini/session/admin 专项 24 项通过，Web 登录 E2E 通过。真实微信身份交换、邮件与正式网络联调仍待票 10 的环境。
