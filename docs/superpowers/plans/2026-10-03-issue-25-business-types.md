# 公积金专区、业务浏览与多地区专题报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 本项目建议由当前会话逐项实施；执行方法由用户评审计划时选择。

**Goal:** 在全站每日新闻下方建设公积金专区，将全国通用能力与扬州专用工具分组，接入地区和两级业务浏览及可查证的专题报告。

**Architecture:** 保留四个现有政策页面地址，新增专区每日新闻、业务新闻、业务政策报告三个地址，以共享菜单定义组织地区、业务、扬州三个子分组。继续使用 role、keywords、routes 授权；三个专区浏览入口共用新闻视图，两类 AI 报告共用组件和服务，各自路由固定用途和权限。全站每日新闻保持通用字段展示。

**Tech Stack:** React 19、Express 4、mysql2、Node 内置 test/assert、现有 Playwright PDF 渲染器。首版不新增依赖。

**Spec:** [设计与需求口径](../specs/2026-10-03-issue-25-business-types-design.md)。用户已同意其余方案；本次同步拆分地区/业务入口和限定全站字段展示。产品代码已按本计划实施；最终证据与偏差见下方交付记录。

## Global Constraints

- 菜单固定为“公积金专区 → 地区浏览／业务类型浏览／扬州公积金专区 → 对应页面”，专区每日新闻直接位于专区内，最多三层；专区放在全站每日新闻之后。
- 保留 `/summary` 和四个 `/policy/*` 页面地址；新增 `/provident-fund/news`、`/provident-fund/business`、`/provident-fund/business-report`。
- 沿用 `role + keywords + routes`，父分组不单独授权；不新增 RBAC 系统、菜单编辑器或城市数据权限。
- 全站每日新闻包含公积金在内的多关键词，只展示通用字段；专区每日新闻固定公积金，默认昨天，显示地区和业务标签；地区/业务浏览默认最近 30 天。
- 地区新闻与业务新闻分开入口、共用筛选口径；地区 AI 报告和业务政策 AI 报告各自固定路由和权限，不提供跨报告类型的模式开关。
- 一级固定为 `缴存 / 提取 / 贷款 / 其它`。
- 标签身份是 `(level1, level2)`，不能只用二级名称。
- 不同维度 AND，同维度 OR；先筛选、去重，再分页。
- 新筛选入口：区间至多 366 天、候选元数据至多 10,000 条、每页至多 100 条。
- 专题报告选择一个一级或二级业务、2—10 个地区；候选 200 条、最终 Prompt 180,000 字符为初始上限。
- 以上容量限制均待性能和样本验证，不代表已测得的服务能力；超限不得静默截断。
- 复用 `config/` 默认层与 `config/runtime/` 运行时层；管理员编辑只写运行时层。
- 数据库读取使用独立只读事务；网页请求不得创建字段、索引或触发补标。
- 测试使用假 SQL、假模型和临时配置，不读取真实凭据、不注册 cron、不调用真实模型。
- 新 CSS 限定在页面 wrapper 内。
- 首版专题报告用于政策和办理规则比较。全国通用报告不加载扬州政策基准，扬州专用对比才使用该基准。

## Review Focus

1. 同一级双标签、多地区、省市重叠：所有父级和总量按 ID 集合计数（Task 1、2）。
2. 二级别名变更及错误结构：列表、Prompt、hash 使用同一规范化结果，异常状态可见（Task 1、4）。
3. 预览后上游更新、快速切换筛选：返回 409 或丢弃旧响应，绝不生成/导出混合状态报告（Task 3、4、5）。
4. 多地区新闻、仅部分地区有材料：不做政策笛卡尔积推断，不足两个地区时阻止比较（Task 4）。
5. 自定义/内置受限用户、旧书签与运行时 Prompt：权限撤销不会被补回，父级不隐式授权，旧页面可用且 Prompt 不静默回退（Task 0、2、4、6）。

## 准备与交付顺序

- [x] 用户已同意其余菜单、轻量权限和实施方案；按本轮要求拆分地区/业务入口，并使全站每日新闻保持通用展示。
- [x] 依 `using-git-worktrees` 建立或复用隔离工作区，分支使用 `codex/issue-25-business-types`；保留现有未跟踪 `.zcode/`。
- [x] 在执行工作区复核 main 与基线；当前记录为 `ebac46a7`，`npm test` 为 127/127，lint 为 0 errors、13 个现有 warnings。
- [x] 依次完成 Task 0—3，形成“专区结构＋业务浏览”可审查交付；再完成 Task 4—6，形成“专题报告”交付。

## Task 0：专区菜单与现有权限的有限整理

**Files**

- Create: `config/navigation.json`（随代码发布的菜单与页面元数据）
- Create: `src/config/navigation.js`（菜单过滤、当前页定位和安全首页）
- Create: `services/routeAccess.cjs`（后端叶子页面访问条件，读取同一 metadata）
- Modify: `src/components/Layout.jsx`、`src/components/Layout.css`
- Modify: `src/App.jsx`、`src/auth/AuthContext.jsx`、`src/config/userAccess.js`
- Modify: `src/pages/UserManagement.jsx`、`src/pages/UserManagement.css`
- Modify: `server.cjs`（AVAILABLE_ROUTES、loadUsersConfig、公开用户资料与 auth/me）
- Modify: `config/users.json`（仅初始化权限模板，不放凭据）
- Modify: `src/pages/PolicyComparison/CurrentPolicy.jsx`、`WeeklyComparison.jsx`（补传已有 authHeaders）
- Create: `test/navigation.test.js`、`test/route-access.test.cjs`
- Modify: `test/user-access.test.js`、`test/user-management.test.cjs`、`test/private-user-credentials.test.cjs`、`test/model-routes.test.cjs`（已有受保护政策接口的测试请求补 token）

**菜单路径映射**

| 分组 | 名称 | path |
|---|---|---|
| main | 每日新闻 | `/summary` |
| housing-fund | 每日新闻 | `/provident-fund/news` |
| fund-regions | 新闻浏览 | `/policy/regions` |
| fund-regions | 地区 AI 报告 | `/policy/region-report` |
| fund-business | 新闻浏览 | `/provident-fund/business` |
| fund-business | 业务政策 AI 报告 | `/provident-fund/business-report` |
| yangzhou-fund | 现行政策编辑 | `/policy/current` |
| yangzhou-fund | 周报政策对比 | `/policy/comparison` |

**Interfaces**

```js
// config/navigation.json: groups + routes, 不是可编辑的运行时配置
// groups: [{id,label,parentId?,afterPath?}]
// routes: [{path,label,group,requiredKeyword?,hidden?}]
// housing-fund 在 /summary 后，fund-regions、fund-business、yangzhou-fund 的 parentId 均为 housing-fund
// 平台通用 routes 仍使用 main，保持原先相对顺序

// src/config/navigation.js
getVisibleNavigation(user) // => [{id,label,path?,children?}], 无可见子项的组被移除
canAccessRoute(user,path) // => boolean，使用实际 user，不按用户名推断
getDefaultAccessiblePath(user) // => path|null；配置首页无权时选择首个获准叶子

// services/routeAccess.cjs
canAccessPage(user,path) // => boolean，与前端采用同一 metadata 和权限测试用例
// auth/me 使用现有 token 和实际 users 配置，只返回公开资料，不写配置
```

- [x] 写失败测试：公积金分组在每日新闻之后；地区/业务各有新闻与对应 AI 报告；四个旧 path 各出现一次；仅地区权限不显示业务组；仅浏览权限不授予报告权限；仅授权全国页面时无扬州子区；仅授权扬州页面时只有该子区；无公积金关键词时专区隐藏；管理员完整可用。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {getVisibleNavigation,canAccessRoute,getDefaultAccessiblePath} from '../src/config/navigation.js';
test('全国通用功能不隐式授予扬州专用功能', () => {
  const user={role:'restricted',keywords:['公积金'],routes:['/policy/regions'],defaultPath:'/summary'};
  const fund=getVisibleNavigation(user).find(x=>x.id==='housing-fund');
  assert.ok(fund);
  assert.equal(fund.children.some(x=>x.id==='yangzhou-fund'),false);
  assert.equal(canAccessRoute(user,'/policy/current'),false);
  assert.equal(getDefaultAccessiblePath(user),'/policy/regions');
});
test('无可访问页面不重定向回同一个受限页面', () => {
  assert.equal(getDefaultAccessiblePath({role:'restricted',keywords:[],routes:[]}),null);
});
```

- [x] 增加配置回归：从测试用 yzgjj 的 runtime routes 删除 `/policy/current`，再次登录、auth/me 和读取用户管理列表都不补回；读取不修改配置文件。admin 的全局访问按 role 处理，不靠反复写入 routes 实现。
- [x] 运行 `node --test test/navigation.test.js test/route-access.test.cjs test/user-management.test.cjs test/private-user-credentials.test.cjs` 确认新断言失败。
- [x] 建立共享菜单定义，将四个旧入口归位；保留隐藏的历史等既有路由，不因整理侧栏删除页面。Layout 使用专区、地区、业务、扬州的独立折叠状态，以当前叶子决定父级展开，移除按 yzgjj 用户名展开的分支。
- [x] 实现轻度专区样式和三级缩进；替换写死的 submenu 220px 高度。新增浏览入口与 Task 3 一起交付，新增业务报告入口与 Task 4 一起交付；未完成的页面不进入已发布导航。
- [x] 用户管理按平台通用、公积金通用、扬州专用分组；公积金通用组内按每日、地区、业务组织叶子，独立控制浏览与报告。分组全选只操作本组叶子。未选公积金关键词时提示专区页面不生效；不静默增加关键词或扬州授权。
- [x] 将 loadUsersConfig 改为读取实际 runtime 授权；默认模板只初始化。新增 daily、business、business-report 权限随对应页面交付进入默认模板，已有生产用户由管理员在用户管理页明确勾选，不写自动补权脚本。
- [x] 添加 auth/me；AuthContext 启动时有加载态，刷新公开用户资料后再判定路由。401 清理会话，403 刷新权限；无可用路由显示空权限页。用户管理修改自身权限后使用相同刷新函数。
- [x] 为扬州现有接口加叶子权限：versions/latest 允许 current 或 comparison；save 需 current；extract/preview-prompt/compare/comparison-export 需 comparison；reportId 必须属于公积金。保持页面授权粒度，不引入新的按钮权限体系。
- [x] 用同一组用户权限 fixture 测试前后端判定一致；旧书签、默认首页、撤销权限、移动端深层菜单均验证。
- [x] 提交：`feat: organize housing fund workspace and scoped navigation access`。与 Task 1—3 组成第一阶段 PR。

## Task 1：业务标签和地区的统一数据契约

**Files**

- Create: `services/newsBusinessTypes.cjs`
- Create: `services/newsRegions.cjs`
- Modify: `server.cjs`（迁出 3059—3259 附近的地区常量和匹配函数，实施时按函数定位）
- Create: `test/news-business-types.test.cjs`
- Create: `test/news-regions.test.cjs`

**Interfaces**

```js
// newsBusinessTypes.cjs
// aliases: [{ level1, retired_level2, canonical_level2 }]
// status: 'pending' | 'unidentified' | 'tagged' | 'invalid'
decodeBusinessTypes(raw, aliases = []) // => { tags: [{level1, level2}], status }
matchesBusinessTypes(tags, selections) // => boolean; [] selections means all
countBusinessTypes(rows) // => [{level1, count, children:[{level2,count}]}]
// rows: [{id, businessTypes:[{level1,level2}]}]; counts use ID sets

// newsRegions.cjs
normalizeRegionSelections(input) // => [{name,level,label}]
getMatchedRegionsForSelection(region, selection) // => canonical region names
buildRegionTree(rows) // => {national,provinces,municipalities,unknownCount}
// rows: [{id,region,score}]; all nodes count unique IDs
```

- [x] 先写失败测试，覆盖 JSON 字符串/数组、NULL、空数组、错误 JSON、非法一级、缺二级、重复标签、别名链/循环及一级计数。

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeBusinessTypes, matchesBusinessTypes, countBusinessTypes } = require('../services/newsBusinessTypes.cjs');
test('同一篇新闻的两个贷款标签在一级只计一次', () => {
  const { tags, status } = decodeBusinessTypes([
    { level1: '贷款', level2: '首付比例调整' },
    { level1: '贷款', level2: '利息补贴' },
  ]);
  assert.equal(status, 'tagged');
  assert.equal(matchesBusinessTypes(tags, [{ level1: '贷款' }]), true);
  assert.equal(matchesBusinessTypes(tags, [{ level1: '提取' }]), false);
  const loan = countBusinessTypes([{ id: 1, businessTypes: tags }]).find(x => x.level1 === '贷款');
  assert.equal(loan.count, 1);
  assert.equal(loan.children.length, 2);
});
test('待标注和未识别不是其它业务', () => {
  assert.equal(decodeBusinessTypes(null).status, 'pending');
  assert.equal(decodeBusinessTypes('[]').status, 'unidentified');
  assert.equal(decodeBusinessTypes('{').status, 'invalid');
});
```

- [x] 为 `江苏|南京`、`南京|苏州`、`北京/北京市`、`南京/南京市`、全国、地区缺失、国外混合值和未知地区编写精确匹配测试。市名别名仅基于已知映射，避免任意删除字符导致误认。
- [x] 运行 `node --test test/news-business-types.test.cjs test/news-regions.test.cjs`，确认因模块缺失而失败。
- [x] 实现上述纯函数，迁出原地区代码并让已有调用使用导入。别名循环标记异常且终止；不修改数据库原始标签。
- [x] 重跑新增测试及 `node --test test/model-routes.test.cjs`，确认旧报告地区路径仍通过。
- [x] 提交：`feat: normalize housing fund business tags and region matching`。

## Task 2：统一筛选、统计、分页与权限

**Files**

- Create: `services/policyNewsQuery.cjs`
- Modify: `server.cjs`（regions、region-news，增加 business-types、公积金每日新闻及业务新闻接口）
- Modify: `test/helpers/isolatedApp.cjs`
- Create: `test/policy-news-query.test.cjs`
- Create: `test/policy-business-routes.test.cjs`

**Interfaces**

```js
normalizePolicyFilters(input)
// => {startDate,endDate,regions,businessTypes,tagState,minScore:3}
// businessTypes: [{level1,level2?}]; tagState: 'all'|'without-valid-tags'
createPolicyNewsQuery({ pool })
// => { query(filters,{page,pageSize,sortBy,order}), reportCandidates(filters) }
// query => {rows,total,page,pageSize,totalPages,regionTree,businessFacets,coverage}
// reportCandidates => {filters,rows,aliasesVersion}
// rows contain businessTypes + businessTypeStatus and stable IDs
```

- [x] 扩展隔离测试助手允许注入测试 pool，支持 `req.query` 重复参数、`req.get`、用户 token；默认仍拒绝 SQL 和模型调用。
- [x] 写真实路由 handler 测试，数据包括低分省级新闻、双标签、多地区、未标注、无地区。断言省级列表不出现低分样本、同一新闻总数为 1、筛选后分页正确。
- [x] 写权限测试：未登录 401；无公积金或页面权限 403；管理员和具有相应权限的自定义用户成功。
- [x] 写边界测试：非法日期/反向区间/未知一级/非法 level/页大小超限 400；超过 10,000 候选明确失败；SQL 输入作为绑定参数传入。
- [x] 运行 `node --test test/policy-news-query.test.cjs test/policy-business-routes.test.cjs`，确认新增断言失败。
- [x] 实现只读事务查询：元数据候选 → 归并和精确匹配 → ID 去重与 facet → 排序分页 → 按 ID 批量读取正文。事务在 finally 中释放，不使用全局共享连接。

```sql
START TRANSACTION READ ONLY;
SELECT id, fetchdate, region, business_types, score
FROM scored_news
WHERE keyword = ? AND score >= ? AND fetchdate >= ? AND fetchdate < ?
ORDER BY fetchdate DESC, id DESC
LIMIT 10001;
-- 参数中的关键词固定为 公积金，评分固定为 3。
-- 后续正文查询只允许使用服务端候选集中的 ID。
```

- [x] facet 分别忽略自身维度的选择，保留另外维度；列表应用全部条件。空选项、缺地区和异常标签返回明确计数。
- [x] 接入三个地区浏览接口，增加 `GET /api/provident-fund/news` 薄路由：固定 keyword=公积金，校验单日与新增 daily 叶子权限，复用 query 服务。测试外部传入其他 keyword 无法改变查询关键词。
- [x] 增加 `GET /api/provident-fund/business-news` 薄路由，校验业务浏览叶子权限，复用相同 query 服务；参数与地区列表规范化后一致时，ID 集合、数量、分页一致。
- [x] 旧 `region + regionLevel` 参数转换为 regions，未提供新筛选时维持已有响应字段。共用地区/业务 facets 允许相应浏览或报告权限读取，但每日列表、地区列表、业务列表和两类报告分别要求对应叶子权限。所有调用补 authHeaders。
- [x] 重跑新增测试与现有地区报告、用户配置测试；提交：`feat: query housing fund news by region and business type`。

## Task 3：专区每日新闻、独立地区/业务浏览和标签跳转

**Files**

- Create: `src/components/BusinessTypeFilter.jsx`
- Create: `src/components/BusinessTypeTags.jsx`
- Create: `src/components/ProvidentFundNewsView.jsx`（共用 daily/region/business 公积金新闻视图）
- Create: `src/pages/ProvidentFundNews.jsx`（单日模式薄包装）
- Create: `src/pages/ProvidentFundBusiness.jsx`（业务优先模式薄包装）
- Create: `src/utils/policyBusinessFilters.js`
- Create: `src/api/policyBusiness.js`
- Modify: `src/pages/PolicyComparison/RegionPolicyBrowser.jsx` 和同名 CSS
- Modify: `src/App.jsx`（注册两个新增浏览页面，各自使用对应路径权限）
- Regression only: `src/components/NewsTable.jsx`、`src/pages/SummaryNews.jsx`（全站列表继续展示通用字段，不在此添加地区、业务类型或标注状态）
- Create: `test/policy-business-filters.test.js`

**Interfaces**

```js
// policyBusinessFilters.js
parsePolicyBusinessSearch(search) // => {startDate,endDate,regions,businessTypes,tagState}
serializePolicyBusinessSearch(filters) // => URLSearchParams string
// policyBusiness.js: caller supplies authHeaders(), no credentials in URL
fetchPolicyBusinessNews(filters, pageOptions, { headers, signal })
fetchPolicyBusinessFacets(filters, { headers, signal })
fetchProvidentFundDailyNews(date, pageOptions, { headers, signal })
fetchProvidentFundBusinessNews(filters, pageOptions, { headers, signal })
// ProvidentFundNewsView: {mode:'daily'|'region'|'business'}
// daily 固定 startDate=endDate=选中日；region 调用 region-news；business 调用 business-news
// BusinessTypeFilter: {value,options,onChange,disabled}
// BusinessTypeTags: {tags,status,selected,onSelect}
```

- [x] 先写 URL 往返测试与筛选状态测试，固定同维度 OR、维度间 AND、取消冗余子项、切换条件重置页码。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicyBusinessSearch, serializePolicyBusinessSearch } from '../src/utils/policyBusinessFilters.js';
test('URL 保留多地区与精确业务组合', () => {
  const filters = {
    startDate:'2026-09-03', endDate:'2026-10-03',
    regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],
    businessTypes:[{level1:'贷款',level2:'贷款额度调整'}], tagState:'all',
  };
  const restored = parsePolicyBusinessSearch(serializePolicyBusinessSearch(filters));
  assert.deepEqual(restored.businessTypes, filters.businessTypes);
  assert.equal(restored.regions.length, 2);
});
```

- [x] 从原地区浏览页抽出共用公积金新闻视图。daily 包装默认昨天，显示地区和业务标签，不显示关键词切换器；region 默认最近 30 天，以地区树为主、业务辅助；business 默认最近 30 天，以两级业务目录为主、地区辅助。三种模式共用行展示、状态处理和参数规范化。
- [x] 实现两级选择器、可搜索二级选项、多地区选择、联动数量、清空条件、空状态和错误提示。保留已选的零计数项；区分“全部地区”与“全国”。专区 daily 点击地区进入 region，点击业务标签进入 business，并保留当天日期。
- [x] 地区页提供地区 AI 报告跳转，业务页提供业务政策 AI 报告跳转，携带已有筛选条件并分别校验报告权限。业务选中多个条件时提示明确选择一个用于报告，禁止静默取第一项；对应报告页面尚未交付时不提供无效链接。
- [x] 使用 AbortController/请求序号防止旧响应覆盖新筛选；切换任何查询条件重置分页。共享组件不持有第二份独立筛选状态。
- [x] 回归全站每日新闻：公积金单选、混合关键词均正常返回新闻，只显示原有通用列；不显示地区、业务类型、标注状态、专有筛选器或标签跳转。专区正常显示专有字段；没有对应浏览权限时专区标签仅展示，不提供无权进入的链接。
- [x] 执行新增状态测试；使用受控假数据启动测试页面，通过 Playwright 验证：两个每日入口的区别、默认日期、固定关键词、URL 刷新、多选、翻页、空样本、快速切换、三层菜单、窄屏。截图保留到临时测试输出目录。
- [x] 运行 `npm test`、`npm run lint`、`npm run build`；记录已有告警与新错误，不为本 Issue 修复无关问题。
- [x] 提交：`feat: add housing fund daily news and business browsing`。此处形成“专区结构＋浏览”第一阶段评审点。

## Task 4：分别接入地区 AI 报告与业务政策 AI 报告

**Files**

- Create: `services/businessTopicReport.cjs`
- Modify: `server.cjs`（旧地区报告路由固定 region；新增业务报告 news、generate、export-pdf 薄路由固定 business）
- Modify: `config/region-policy-report-prompts.json`
- Modify: `src/pages/PolicyComparison/RegionPolicyReport.jsx` 和同名 CSS
- Create: `src/components/ProvidentFundReportView.jsx`（从现有地区报告页抽出共享视图，reportKind 由路由包装固定）
- Create: `src/pages/ProvidentFundBusinessReport.jsx`（业务报告薄包装）
- Modify: `src/App.jsx`（注册 `/provident-fund/business-report`，单独守卫权限）
- Create: `test/business-topic-report.test.cjs`
- Modify: `test/model-routes.test.cjs`、`test/prompt-store.test.cjs`

**Interfaces**

```js
// businessTopicReport.cjs
buildBusinessTopicPreview({ filters, rows, aliasesVersion })
// => {reportKind:'business',filters,rows,previewHash,regionCoverage}
// rows include includedInAnalysis, filterReason, evidenceKind
buildBusinessTopicInput({ preview, manualOverrides, prompt })
// => {messages, snapshot}
// snapshot: {reportKind,filters,previewHash,promptId,promptHash,newsReferences,regionCoverage}
validateBusinessTopicOutput({ reportContent, newsReferences })
// => {valid,errors}; validates citation IDs and required sections, not semantic truth
```

- [x] 先写材料测试：同业务筛选、多标签命中、同篇新闻只提供一次、地区材料不足、指南作为既有规则、财务公积金排除、跨地区材料明确保留原始归属。
- [x] 写业务报告一致性测试：预览后正文/摘要/标签/别名改变导致 409；外部 ID 和非法 override 拒绝；未知 Prompt 不回退；零样本/只有一个有材料地区/超限不调用模型。
- [x] 写类型和授权测试：仅地区报告权限不能调用业务报告；仅业务报告权限不能调用地区报告；伪造 mode/reportKind 不能改变服务端路由固定类型。单地区仍可生成地区报告；业务政策比较仍要求至少两个有材料地区。

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBusinessTopicPreview } = require('../services/businessTopicReport.cjs');
test('同一新闻的材料更新会改变预览 hash', () => {
  const filters = {startDate:'2026-09-03',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]};
  const row = {id:1,title:'贷款政策',region:'南京',score:5,short_summary:'额度80万元',businessTypes:[{level1:'贷款',level2:'贷款额度调整'}]};
  const first = buildBusinessTopicPreview({filters,rows:[row],aliasesVersion:'empty'});
  const next = buildBusinessTopicPreview({filters,rows:[{...row,short_summary:'额度100万元'}],aliasesVersion:'empty'});
  assert.notEqual(first.previewHash,next.previewHash);
});
```

- [x] 实现统一材料 builder 和内容 hash。先用 Task 2 查询，再判定材料性质；允许人工调整，禁止越出候选集。生成在调用模型前复核 hash，并使用刚核对的同一份材料。
- [x] 添加 `business-topic-comparison-v1`，保留现有两个默认模板和全局默认 ID。按 Spec 的五部分结构编写完整模板，关键事实要求 `[N新闻ID]` 引用，未知值写“材料未提及”。
- [x] 服务端添加不可缺少的专题上下文；Prompt ID 精确查找；记录 Prompt 内容 hash。运行时删除专题模板时返回可操作错误，禁止绕过墓碑回退至出厂模板。
- [x] 假模型测试检查实际 messages：仅包含命中业务材料、数字/来源 ID/链接齐全、同一 ID 不重复，抓取内容被标为证据而非指令。测试输出不存在的引用 ID 和空输出被拒绝。
- [x] 地区报告页面包装共享视图 `reportKind='region'`，位于地区浏览组；业务报告页面包装 `reportKind='business'`，位于业务类型浏览组，包含单业务选择、地区覆盖和纳入理由。没有跨类型开关；页面跳转或条件/Prompt 变化时取消旧请求并使旧报告失效。
- [x] 地区路由沿用 `/api/policy/region-report/news|generate|export-pdf`；业务薄路由使用 `/api/provident-fund/business-report/news|generate|export-pdf`，分别验证对应页面权限，再传服务端常量 reportKind 调用共享材料与生成服务。生成快照和 previewHash 覆盖 reportKind，禁止跨类型复用预览。
- [x] 测试全国通用报告没有读取 `config/policies` 中的扬州政策基准；扬州 comparison 页面仍按其原链路进行专用对比。
- [x] 专题模式请求携带 previewHash、businessTypes、人工调整；生成响应携带实际 snapshot。保留旧综合模式的可用性，并让其导出也采用实际生成来源，避免新旧来源逻辑分叉。
- [x] 重跑新增测试、`test/model-routes.test.cjs`、`test/prompt-store.test.cjs`；提交：`feat: generate evidence-linked business topic comparisons`。

## Task 5：报告导出和失效状态

**Files**

- Modify: `src/components/ProvidentFundReportView.jsx`
- Modify: `server.cjs`（地区及业务报告的 export-pdf 薄路由）
- Modify: `server/pdf/regionPolicyReportPdfTemplate.cjs`
- Modify: `server/pdf/renderRegionPolicyReportPdf.cjs`（仅在参数传递需要时）
- Create: `test/business-topic-pdf.test.cjs`

- [x] 先写模板测试：标题含专题，元信息是生成时条件，参考来源包含稳定 ID 和原文链接，特殊字符转义，非 http/https 链接不可点击。
- [x] 实现以生成响应 snapshot 构造导出请求；前端不再从实时 preview 重建来源。报告过期状态覆盖筛选、Prompt、人工调整和进行中的旧请求。
- [x] 验证 PDF 导出接口的页面权限和请求结构；保留旧报告无业务字段时的渲染兼容。
- [x] 用固定报告内容实际渲染一个 PDF，检查第一页、跨页对比表和来源页；验证中文、长标题、长链接、分页及链接可用性。不调用模型来生成渲染素材。
- [x] 提交：`feat: include business scope and verified sources in report PDFs`。

## Task 6：集成验收与交付

**Files**

- Create: `docs/issue-25-business-types.md`
- Modify: `CLAUDE.md`（专区结构、新入口、权限分组、接口、服务职责和数据口径）
- Modify: `docs/multi-user-auth.md`（保留存储格式、撤销行为、旧用户新增 daily 权限步骤）
- Modify: `config/README.md`（专题 Prompt 和运行时兼容）
- Update: 当前计划的勾选状态，记录实际偏差及验证证据。

- [x] 固定一组代表性样本：多个地区、一级和二级业务、多标签、无标签、无地区、冲突额度、指南和多地区混合新闻。测试数据注明为测试样本，避免凭据和不必要的完整正文进入仓库。
- [x] 用假 SQL/假模型完整走通：地区筛选 → 业务筛选 → 新闻预览 → 人工排除 → 生成 → 引用定位 → PDF。
- [x] 回归四个旧页面 URL、全站每日新闻公积金及其他关键词的通用字段、地区单/多地区报告、业务报告、扬州政策编辑/对比、管理员 Prompt 编辑和自定义用户。测试仅地区/仅业务/仅浏览无报告/仅扬州/全专区/无专区六种组合，直接请求受限接口同样拒绝。
- [x] 执行最终门槛：`npm test`、`npm run lint`、`npm run build`、`git diff --check`。记录断言总数及真实 PDF 检查结果，不能沿用本轮的 127 项基线作为新功能结果。
- [x] 测量默认 30 天、90 天及最大允许区间的查询计划与响应大小；需要真实 DB 时只读、单连接、有限时。记录 P50/P95、元数据规模和正文读取量，再决定是否另提复合索引迁移。
- [ ] 经用户确定真实模型验收范围后，对一组固定多地区单业务材料生成报告，人工逐条核对至少 10 项关键事实、数字、地区归属及引用。单独记录“技术验证”和“报告质量”；失败时调整模板并重新验收，不用单元测试代替。
- [x] 文档、本地验证和远程交付已完成。用户授权后创建一个包含清晰阶段提交的 [草稿 PR #27](https://github.com/babyowen/ainews/pull/27)，覆盖“专区结构＋浏览”与“专题报告”；未合并或部署。

## 完成条件

公积金专区紧接全站每日新闻，包含每日新闻、地区浏览（新闻＋地区 AI 报告）、业务类型浏览（新闻＋业务政策 AI 报告），以及扬州子区（现行政策编辑＋周报政策对比）。全站每日新闻继续显示公积金新闻，所有关键词统一使用通用字段。权限可分别控制各浏览和报告入口；同一筛选条件在地区、业务页面产生一致结果；报告使用确认过的材料，事实可查证，PDF 保留生成时条件与来源；四个旧页面 URL 保持可用。

部署前仍须核对实际发布版本、有效运行时 Prompt 及真实模型验收结果。本次实现未部署，也未进行真实模型内容验收。

## 实施记录与偏差

- 分支 `codex/issue-25-business-types`，基线 `ebac46a7`。原生 worktree 在本机沙箱中不可写，按技能回退在原 checkout 的新分支实施；预先存在的 `.zcode/` 未改动。
- Task 0–5 按阶段提交；所有新菜单在完整分支交付时均有页面。用户于2026-10-03明确授权提交 PR 后，分支已推送并创建 [草稿 PR #27](https://github.com/babyowen/ainews/pull/27)；一个 PR 保留各阶段提交，避免两份 PR 之间出现无效入口。
- 路由权限测试合并进 `navigation.test.js`、`policy-business-routes.test.cjs` 与真实 handler 的报告测试，不另建重复的 `route-access.test.cjs`。
- 新增 `PolicyRegionFilter.jsx` 复用地区选择器；原地区页作为薄包装。旧地区响应保留字典/children 结构和去重平均分。
- Task 4 已同时完成快照签名与导出请求，Task 5 专注 PDF 模板、来源链接和实际渲染。签名覆盖正文与快照，可拒绝篡改和跨类型导出。
- Task 0/3 的浏览器验收集中到 Task 6，脚本 `npm run test:fund-ui` 使用固定日期与测试数据。已验证两个每日入口、独立报告、Prompt 编辑、旧响应丢弃、六种权限组合及窄屏三级菜单。
- 独立审查发现 DATE 转 UTC、吉林市与吉林省歧义两项问题；均已加入先失败后通过的回归测试。命中标签高亮和采集日期说明也已补齐。移动端关闭按钮被侧栏遮挡的问题已用真实点击复现并修复。
- 实际 PDF 渲染7页、40个原文链接；逐页检查中文、跨页表格与来源列表，修正来源条目被跨页拆分。
- 数据库性能使用单连接只读、每区间3次、每次20篇正文；未修改表、索引或配置。结果见 `docs/issue-25-business-types.md`。小样本观测不代表容量承诺。
- 真实模型关键事实验收保留为发布前待办；本次没有付费模型调用、生产改动、合并或部署。

最终自动门槛：156/156 tests；lint 0 errors、11 existing warnings；build 通过；diff whitespace 检查通过。
