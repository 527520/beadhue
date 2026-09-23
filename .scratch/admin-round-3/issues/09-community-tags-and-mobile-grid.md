# 09 豆社：标签呈现、标签筛选控件、移动端两列

Status: ready-for-human
Completion: complete

## 目标
列表不显示标签、详情保留；标签筛选改为可搜索的单选控件；手机两列小卡片。

## 范围
- 删除 `community/page.tsx:60` 标签行；`listPublicCommunityWorks` 增 `includeTags` 选项（页面传 false，API 默认不变）。
- 新增 `listAllCommunityTagsWithCounts`（谓词与列表一致）；修 `tagFilterCondition` 种子补 `active`；新组件 `TagFilter.tsx`（react-aria combobox，本地过滤，URL 仍 `?tag=<名称>`）；热门芯片收敛到前 8。
- 移动端：删 `≤430px` 单列规则，新增紧凑档（间距/圆角/字号/两行截断/footer 换行）。

## 验收
`db/communityQueries.test.ts`（inactive 不再筛出、计数一致、includeTags=false 不查 tags）；页面组件测试；e2e 350/390 两列断言 + 既有 scrollWidth/axe 保持。
