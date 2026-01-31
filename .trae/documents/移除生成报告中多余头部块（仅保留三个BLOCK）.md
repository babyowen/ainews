## 需求确认
- 需要移除：`div.policy-entry-header`（你不需要的那块）。
- 同时希望这个节点更明显一些：
  - `div.policy-section-card-list > div:nth-child(1)`（也就是 `.policy-entry`）
  让“每一组对比（一个条目）”在视觉上更清楚，但不要喧宾夺主。

## 修改目标
- 每条对比条目仅保留三个 block：
  - 城市名块（`[[BLOCK|泰州]]` 等）
  - 扬州块（`[[BLOCK|yangzhou]]`）
  - 对比分析块（`[[BLOCK|diff]]`）
- 条目容器（`.policy-entry`）更“像一组”，但整体仍正式、克制。

## 具体改动
### 1) JSX：移除 policy-entry-header
- 文件：[WeeklyComparison.jsx](file:///Users/babyowen/Documents/GitHub/ainews/src/pages/PolicyComparison/WeeklyComparison.jsx)
- 在 `PolicyMarkdown` 渲染 `cards.map(...)` 的条目里：
  - 删除 `div.policy-entry-header`（含 `policy-entry-city` 与 `policy-entry-title`）
  - 条目结构变为：`div.policy-entry > div.policy-entry-body > 3个 policy-block`

### 2) CSS：增强 .policy-entry 的“组”辨识度（轻量）
- 文件：[WeeklyComparison.css](file:///Users/babyowen/Documents/GitHub/ainews/src/pages/PolicyComparison/WeeklyComparison.css)
- 调整 `.policy-entry`：
  - 背景改为非常淡的灰蓝（例如 `#f8fafc`），与 section 卡片白底区分
  - 边框加深一点（例如 `rgba(15,23,42,0.14)`）
  - 增加一个细的左侧强调条（例如 3px 深蓝），表示“这是一条对比项”
  - 轻微内阴影/投影（很克制）
- 同时删除/清理不再使用的 `.policy-entry-header/.policy-entry-city/.policy-entry-title` 样式，避免留白。

### 3) 验证
- 生成报告页查看：
  - `div.policy-entry-header` 消失
  - 每条 `.policy-entry` 视觉上更像一组（更明显）
  - 导出图片布局正常

确认后我会按以上三步直接修改 JSX 与 CSS。