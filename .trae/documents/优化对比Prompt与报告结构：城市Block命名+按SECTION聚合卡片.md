## 需求拆解
- Prompt 输出结构调整：把 `[[BLOCK|other]]` 改成 `[[BLOCK|泰州]]` 这类“城市名 block”，因为城市信息已在 `[[CARD|city=...]]` 里。
- 最终呈现调整：以 `[[SECTION|类别名称]]` 聚合成“一张大的卡片”，卡片内部用圆角分区呈现三大块（对比城市/扬州/对比分析），整体更紧凑。

## 现状定位
- 对比提示词模板在 [policy_prompts.md](file:///Users/babyowen/Documents/GitHub/ainews/config/policy_prompts.md#L49-L96)：目前硬编码 `[[BLOCK|other]]/[[BLOCK|yangzhou]]/[[BLOCK|diff]]`。
- 前端解析在 `PolicyMarkdown.parseMarkerMarkdown`（[WeeklyComparison.jsx](file:///Users/babyowen/Documents/GitHub/ainews/src/pages/PolicyComparison/WeeklyComparison.jsx#L7-L105)）：目前只接受 `other|yangzhou|diff` 三种 block。
- 目前渲染是“按 card 渲染”，section 只是标题（[WeeklyComparison.jsx](file:///Users/babyowen/Documents/GitHub/ainews/src/pages/PolicyComparison/WeeklyComparison.jsx#L204-L271)）。

## 实施方案
### 1) 修改对比Prompt模板（输出城市Block）
- 将输出模板从：
  - `[[BLOCK|other]]` 改为 `[[BLOCK|{城市名}]]`
- 保留 `[[BLOCK|yangzhou]]` 与 `[[BLOCK|diff]]`，确保机器可读结构稳定。
- 仍然维持“一条政策明细=一张 CARD”，这样不会丢失多城市/多条政策点的能力。

### 2) 前端解析升级：支持任意城市名Block
- 调整 `parseMarkerMarkdown` 的 block 正则：
  - 从仅匹配 `(other|yangzhou|diff)` 改为：
    - `yangzhou/diff` 作为特殊块
    - 其余任何 `[[BLOCK|XXX]]` 都视作“对比城市块”，`label=XXX`、`labelClass='other'`
- 这样 Prompt 改了以后无需再写死“other”。

### 3) 渲染结构升级：按 SECTION 聚合成大卡片
- 在 `PolicyMarkdown` 的渲染阶段先把 parsed items 重新组织为：
  - `section -> cards[]`
- UI 呈现：
  - 每个 section 渲染为一个 `.policy-section-card`（大卡片），标题就是类别名。
  - section 内的每条对比（原来的 CARD）渲染为紧凑的 `.policy-entry`（可包含城市标签 + 三块分区）。
  - 三块分区继续用圆角浅色背景呈现：`{城市名}` / `扬州` / `对比分析`。
- 这样用户视觉感受是“类别一张大卡片”，里面是该类别下的若干条对比项（如果某类别只有一条，那就是你说的‘里面三个 block’）。

### 4) CSS 调整（更像你参考图的卡片列表）
- 新增/调整样式：
  - `.policy-section-card`：白底、大圆角、克制阴影、统一边框
  - `.policy-entry`：更紧凑的间距与分隔线
  - `.policy-block`：继续浅色反白、弱边框，减少“像三张卡片”的割裂

## 影响范围
- 仅影响“对比分析”生成报告的 Prompt 格式与前端渲染；不会影响提取JSON结构与分批逻辑。

## 验证
- 生成一次对比报告：
  - 确认 Prompt 输出 `[[BLOCK|泰州]]` 等城市 block，前端能正确识别并渲染。
  - 确认每个 `[[SECTION|类别]]` 变成一张大卡片，内部条目紧凑，导出图片正常。
  - 如果某类别包含多城市多条政策点，确保都被包含在该类别大卡片内且不丢条目。