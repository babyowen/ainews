// Frozen publisher identity, not an inference about the location of an event.
const registry = require('../config/government-wechat-sources.json');
const accounts = new Map(registry.accounts.map(account => [account.biz, account]));
const SOURCE_RULE = `# 官微来源地域使用规则
以下仅补充本专题的地域证据规则：除标题和正文外，系统提供的已核验“来源上下文”也可在下述限定条件内用于消解本级指代。来源上下文只说明发布账号、账号辖区和层级。账号辖区不等于事件发生地，账号层级也不等于政策或事件层级。
1. 写作前逐事项确认“谁在做事、主体属于哪里、在哪里开展、适用什么范围”，先消解“我局、本局、我省、本省、我市、本市、市局、省局”等指代，再归类和落笔。正文明确的主体与地点关系优先；正文明确讲述发布机构自身或本级事务，且没有转载、引语或冲突证据时，才可用已核验账号辖区补足本级指代。
2. 输出采用能确认的地区、主体称谓，不保留没有明确先行主体的“我局、我省、我市、本局”等读者无法定位的表述。同一条先写清主体后可用“该局”。账号昵称和辖区不能证明机构法定全称，不得仅凭账号昵称补造法定全称；无法确认全称时用“厦门市机关事务部门”等证据支持的称谓，不擅加行政层级或隶属关系。
3. 跨地区交流须区分主体所在地和访问地：例如厦门官微明确写本局赴杭州交流，应写厦门相关部门赴杭州，不能把主体改成杭州部门。省级账号介绍下属城市案例时按案例主体标注城市；国管局转载地方做法仍按地方主体归类。正文明确是转载、他人引语、外地案例或多地综合稿时，“我局”等可能属于原作者，不能套用当前发布账号；只依据该事项自身证据判断。
4. 指代含糊、缺乏明确归属或证据冲突时不猜测地域，沿用原模板的待核实处理；不得因专题名含“江苏”而把外地新闻认作江苏新闻。国家政策按发布主体及适用范围判断，开会地点不等于政策范围。来源上下文只供理解，不逐条复述账号元数据。`;

const GOVERNMENT_LAYOUT_RULE = `# 机关事务周报分组与地区呈现
以下为“江苏机关事务”专题的排版补充，覆盖前文关于分组条数门槛、逐条重复业务标签及可选地区加粗的旧格式要求；原有事实、选材、日期、覆盖和去重规则继续执行。
1. 保留且依次输出三个大栏目：“## 一、江苏本地”“## 二、国家政策”“## 三、省外借鉴”。每个有内容的栏目统一用两层无序列表：父列表为加粗业务分类（例如“- **综合政策与治理改革**”），子列表在行首缩进两个空格，以“  - **地区**：事项内容”展开。不要再按条数决定是否分组，不额外插入业务三级标题；正文事项不要和分类标题处于同一层级。
2. 同一栏目内，同一业务分类只出现一次，其下集中列出该类的所有独立事项。仅合并分类标题，不把不同地区、不同动作吞并成“多地推进”，不重复逐条打印业务标签。同一事项的重复报道仍合并，同一事项只在最合适的一个栏目和业务分类详述；不得为了合并业务而跨越三个大栏目。沿用综合政策与治理改革、资产盘活与办公用房、公务用车与公务接待、公共机构节能与绿色运行、运行经费与服务保障这五类；没有内容的分类不输出，空栏目沿用原有简短说明。
3. 每个事项起首将证据支持的主体所属省或市加粗，如“**贵州省**：…”、“**福建省厦门市**：…”、“**重庆市**：…”。只确认城市时只写城市，不靠常识补上级省份。国家层面政策用“**全国**：…”，随后写清实际发布机关；不要把全国会议举办地作为政策地域。独立地方事项分别列出；同一跨地事项用一条写清各方角色，涉及的地区分别加粗，不因排版拆成重复新闻。地区标签不能代替正文中的具体实施主体，不要把发布账号辖区直接当成事项地域。
4. 出稿前检查三个主栏目顺序、分类是否重复、事项是否正确缩进、可确认的省市是否加粗，以及是否残留无法定位的第一人称指代。只输出周报正文，不输出检查过程或占位文字。`;


function sourceContext(news, keyword) {
  if (!news || keyword !== registry.keyword || news.sourceapi !== '极致了api'
      || [news.keyword, news.main_keyword].some(value => value != null && value !== '' && value !== registry.keyword)
      || typeof news.link !== 'string') return null;
  let url;
  try { url = new URL(news.link); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.host !== 'mp.weixin.qq.com'
      || url.username || url.password || url.pathname !== '/s') return null;
  // Match the collector's identity parsing: base64 '+' is literal, not a space.
  const params = new URLSearchParams(url.search.replaceAll('+', '%2B'));
  const values = ['__biz', 'mid', 'idx'].map(key => params.getAll(key));
  if (values.some(value => value.length !== 1)) return null;
  const [biz, mid, idx] = values.map(value => value[0]);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(biz) || !/^[1-9][0-9]*$/.test(mid) || !/^[1-9][0-9]*$/.test(idx)) return null;
  const account = accounts.get(biz);
  if (!account || ('wechat_ghid' in news && news.wechat_ghid !== account.ghid)
      || ('wechat_article_id' in news && news.wechat_article_id !== [biz,mid,idx].join('/'))) return null;
  return { 发布账号: account.name, 账号辖区: account.jurisdiction, 账号层级: account.level };
}

function sourceLine(news, keyword) {
  const context = sourceContext(news, keyword);
  return context ? `来源上下文：${JSON.stringify(context)}\n` : '';
}

function applyWeeklyNewsRules(systemPrompt, newsList, keyword) {
  // Preserve stored/default templates and every unrelated topic's request.
  if (keyword !== registry.keyword || newsList.length === 0) return systemPrompt;
  const rules = newsList.some(news => sourceContext(news, keyword))
    ? `${SOURCE_RULE}\n\n${GOVERNMENT_LAYOUT_RULE}` : GOVERNMENT_LAYOUT_RULE;
  return `${systemPrompt}\n\n${rules}`;
}

function newsText(news, summaryVersion) {
  return summaryVersion === 'short'
    ? (news.short_summary || news.content || '内容不详')
    : (news.content || news.short_summary || '内容不详');
}

function buildNewsContent(newsList, summaryVersion, keyword, useTitleFallback = true) {
  return newsList.map((news, index) => sourceLine(news, keyword)
    + `新闻${index + 1}标题:${useTitleFallback ? (news.title || '标题不详') : news.title}\n新闻${index + 1}内容:${newsText(news, summaryVersion)}`).join('\n\n');
}

function buildPotentialCustomerNewsContent(newsList, summaryVersion, keyword) {
  return newsList.map(news => sourceLine(news, keyword)
    + `这是我的潜在客户<${news.search_keyword || '未知客户'}>，以下是我搜索到的新闻<${newsText(news, summaryVersion)}>`).join('\n\n');
}

module.exports = { sourceContext, applyWeeklyNewsRules, buildNewsContent, buildPotentialCustomerNewsContent };
