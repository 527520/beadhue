# B 方案：截图反馈修复

基线：`ccb7a01`。本轮只修截图暴露的布局、控件和交互问题，保持 B 品牌、导航与配色；冻结原型不改写。

## 设计约束

- 色彩沿用云白 `#F7F9FC`、白 `#FFFFFF`、墨蓝 `#23324D`、海蓝 `#295BCB`、杏黄 `#FFD36B`、珊瑚 `#DC6559`。
- 标题保留 BeadHue Round，正文 BeadHue Text，色号与 HEX 使用等宽字体。
- 搜索、排序、筛选作为一组，桌面横向排列；手机搜索独占一行，排序和更多筛选同排。聚焦只突出当前控件的一条完整边界。
- 编辑器以常驻的“色块 + 色号 + HEX”作为工作反馈；原图仍单向跟随画布。
- 设置在大屏为侧栏，800px 以下为贴底抽屉。复用已有 Modal 的焦点、遮罩、Esc 和滚动约束，不再模拟悬浮侧栏。

## 问题、原因与修复

| 反馈 | 证据 / 原因 | 修复 |
| --- | --- | --- |
| 统计横幅过长 | 1920px 浏览器实测宽度为 1920px | 内容区居中，最大 1200px，手机保留边距 |
| 裁剪出现内部滚动条 | 560px 下容器高 370px，scrollHeight 386px；画布高度没扣内边距 | 用实测内容高度等比缩放，容器高度受视口约束，不隐藏被裁掉的原图 |
| 返回箭头无效 | 已在预览时仍只 setTab(preview) | 编辑/跟拼返回预览，预览保存后返回我的设计；裁剪中返回则取消裁剪 |
| 关闭图标偏左 | inline-flex 覆盖 grid 后缺少 justify-content | 方形图标按钮统一水平、垂直居中 |
| 名称编辑蓝框被裁 | 零内边距输入框的外扩焦点环落入父级 overflow:hidden | 完整细边框、内部留白和白底聚焦态，不扩出容器 |
| 看不到当前用色 | 原来的当前色按钮与手机状态被隐藏 | 画布顶栏常驻色块、色号与 HEX；吸取后更新，切画笔/桶仍保留 |
| 抽屉外部无法关闭 | 只有 fixed aside，没有真正的遮罩 | 改用 Modal，遮罩点击和 Esc 关闭、焦点回入口 |
| 抽屉底部漏出工具栏 | bottom:78px | 贴合视口底部，只保留内部安全区内边距 |
| 我的设计左侧空白 | 标题容器 max-width + auto margin，却没有 width；560px 下只有353px宽 | 标题与内容统一宽度和左边线；标题在前、说明在后 |
| PNG 选项控件分离 | 原型 settings-panel label 全局规则覆盖 Switch | 收窄通用 label 规则，文字左、开关右，统一字段间距与操作区 |
| 推荐图挤压与标题断行 | 手机图片117%放大旋转，标题限制145px | 等比完整显示、取消旋转与越界，文字可用宽度自适应；只有一张推荐时不空置右列 |
| 搜索框重复焦点边框 | 外框与内部 input 各自画焦点 | 整体搜索栏一条细边界，内部输入不再套粗框 |
| 原生排序菜单与控件混杂 | 原生 select + 原型通用 button 样式压过组件 CSS | 接入 ResponsiveSelect；日期和制作规格使用已有统一控件；降低默认按钮样式优先级 |

推荐图来自 `listPublicCommunityWorks` 数据库查询，首页默认按精选排序；后台既有“精选/取消精选”管理入口。`E2E 已公开作品` 是本地验收库里的测试作品，不是写死的首页图片。本轮没有新增独立的广告位或另建一套配置系统。

## 验证

- 先运行新增反馈回归，实际复现横幅1920px、裁剪超出16px、抽屉底部78px留空等症状。
- 154 项相关单测通过：工作台保存/恢复、裁剪、编辑工具、PNG 导出、选择器。
- Chromium 新增4项反馈流程通过，随后执行三浏览器的既有 B 流程与新增反馈流程。
- 静态复核发现抽屉内原生 summary 未纳入 Modal Tab 循环；先增加失败测试，再修复并验证键盘展开。
- 最终三浏览器、类型、Lint、构建及截图结果见本文末尾的交付记录。

## Standards

复核发现 1 项：新抽屉使用 Modal，而原有 focusableElements 未包含 summary，导致 Tab 无法到达两个高级设置入口。已纳入 summary 并补测试，复核确认闭合。Safari 关闭抽屉焦点恢复差异也已实测修复。

## Spec

复核未发现必须修复项。用户反馈均有对应改动；推荐作品确认来自数据库查询，非写死。

本轮只使用本地测试环境与独立浏览器上下文；没有上线，也没有把模拟设备尺寸当作真实设备验收。

## 最终交付记录

- 相关单测 154 项通过；Modal 单测新增回归后 9 项通过，共 163 项。
- 三浏览器既有 B 流程 12 项通过；新增反馈流程最终 12 项通过（34.5 秒）。首次组合运行 23/24，通过失败项定位 Safari 焦点差异，修复后重跑新增流程三浏览器全部通过，未使用自动重试掩盖失败。
- 类型检查、Lint、字体完整性、旧品牌扫描通过。生产构建 `BEADHUE_E2E_BUILD=1 npm run build` 通过。
- Standards 最终只读复核：summary 焦点循环与 Safari 入口聚焦两点闭合，无剩余必须修复项。
- Spec 最终只读复核：未发现必须修复项。

截图为正式应用的本地测试数据；已经逐张检查手机排序弹层、PNG 选项、设置抽屉、当前颜色、名称聚焦、我的设计与桌面搜索。

- [手机排序](feedback-evidence/sort-open-390.png) / [手机搜索](feedback-evidence/search-focus-390.png) / [桌面搜索](feedback-evidence/search-focus-1440.png)
- [高级筛选](feedback-evidence/filters-390.png) / [我的设计](feedback-evidence/my-designs.png)
- [设置抽屉](feedback-evidence/settings-drawer.png) / [PNG 选项](feedback-evidence/png-options.png)
- [当前颜色](feedback-evidence/active-color.png) / [名称聚焦](feedback-evidence/design-name-focus.png)
- [推荐卡片](feedback-evidence/inspiration.png) / [大屏统计提示](feedback-evidence/consent-desktop.png) / [极端竖图裁剪](feedback-evidence/portrait-crop.png)

本轮没有推送、合并或部署。代码保持在 `feat/beadhue-redesign` 独立工作树，原工作区截图改动未动。
