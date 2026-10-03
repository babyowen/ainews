const provinceNameMap = {
  '北京': '北京市', '上海': '上海市', '天津': '天津市', '重庆': '重庆市',
  '江苏': '江苏省', '浙江': '浙江省', '广东': '广东省', '山东': '山东省',
  '河南': '河南省', '四川': '四川省', '湖北': '湖北省', '湖南': '湖南省',
  '河北': '河北省', '福建': '福建省', '安徽': '安徽省', '辽宁': '辽宁省',
  '陕西': '陕西省', '江西': '江西省', '黑龙江': '黑龙江省', '吉林': '吉林省',
  '云南': '云南省', '贵州': '贵州省', '山西': '山西省', '广西': '广西壮族自治区',
  '内蒙古': '内蒙古自治区', '新疆': '新疆维吾尔自治区', '西藏': '西藏自治区',
  '宁夏': '宁夏回族自治区', '青海': '青海省', '甘肃': '甘肃省', '海南': '海南省',
  '台湾': '台湾省', '香港': '香港特别行政区', '澳门': '澳门特别行政区'
};

const provinceCityMap = {
  '江苏省': ['南京', '苏州', '无锡', '常州', '扬州', '镇江', '泰州', '南通', '盐城', '淮安', '宿迁', '连云港', '徐州'],
  '浙江省': ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'],
  '广东省': ['广州', '深圳', '珠海', '汕头', '佛山', '韶关', '湛江', '肇庆', '江门', '茂名', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '东莞', '中山', '潮州', '揭阳', '云浮'],
  '山东省': ['济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'],
  '河南省': ['郑州', '开封', '洛阳', '平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店'],
  '四川省': ['成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山'],
  '湖北省': ['武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '仙桃', '潜江', '天门', '神农架'],
  '湖南省': ['长沙', '株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底', '湘西'],
  '河北省': ['石家庄', '唐山', '秦皇岛', '邯郸', '邢台', '保定', '张家口', '承德', '沧州', '廊坊', '衡水'],
  '福建省': ['福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德'],
  '安徽省': ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城'],
  '辽宁省': ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛'],
  '陕西省': ['西安', '铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛'],
  '江西省': ['南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'],
  '黑龙江省': ['哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭'],
  '吉林省': ['长春', '吉林', '四平', '辽源', '通化', '白山', '松原', '白城', '延边', '长白山'],
  '云南省': ['昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆'],
  '贵州省': ['贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'],
  '山西省': ['太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'],
  '广西壮族自治区': ['南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左'],
  '内蒙古自治区': ['呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安', '锡林郭勒', '阿拉善'],
  '新疆维吾尔自治区': ['乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰', '石河子', '阿拉尔', '图木舒克', '五家渠', '北屯', '铁门关', '双河', '可克达拉', '昆玉', '胡杨河', '新星'],
  '西藏自治区': ['拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里'],
  '宁夏回族自治区': ['银川', '石嘴山', '吴忠', '固原', '中卫'],
  '青海省': ['西宁', '海东', '海北', '黄南', '海南', '果洛', '玉树', '海西'],
  '甘肃省': ['兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南'],
  '海南省': ['海口', '三亚', '三沙', '儋州', '五指山', '琼海', '文昌', '万宁', '东方', '定安', '屯昌', '澄迈', '临高', '白沙', '昌江', '乐东', '陵水', '保亭', '琼中'],
  '台湾省': ['台北', '新北', '桃园', '台中', '台南', '高雄', '基隆', '新竹', '嘉义'],
  '香港特别行政区': ['香港'],
  '澳门特别行政区': ['澳门']
};

const municipalities = ['北京市', '上海市', '天津市', '重庆市'];
const cityNames = new Map(Object.entries(provinceCityMap).flatMap(([province, cities]) => cities.flatMap(city => [[city, {name: city, province}], [`${city}市`, {name: city, province}]])));
function classifyRegion(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw === '全国') return {name: raw, level: 'national', parent: null};
  const name = provinceNameMap[raw] || raw;
  if (municipalities.includes(name)) return {name, level: 'municipality', parent: '全国'};
  if (Object.values(provinceNameMap).includes(name)) return {name, level: 'province', parent: '全国'};
  const city = cityNames.get(raw);
  return city ? {name: city.name, level: 'city', parent: city.province} : null;
}
function splitMultiRegion(value) {
  return [...new Set(String(value || '').split('|').map(v => classifyRegion(v)?.name).filter(Boolean))];
}
function getCityProvince(name) { return cityNames.get(name)?.province || null; }
function getSelectionDisplayName(s) { return s.level === 'provincial' ? `${s.name}（省级）` : s.name; }
function normalizeRegionSelections(input) {
  let values = input || [];
  if (typeof values === 'string' && values.trim().startsWith('[')) {
    try { values = JSON.parse(values); } catch { throw Object.assign(new Error('地区参数格式错误'), {status: 400}); }
  }
  if (!Array.isArray(values)) values = [values];
  const selections = new Map();
  for (let value of values) {
    if (typeof value === 'string') {
      try { value = value.startsWith('{') ? JSON.parse(value) : {level: value.split('::')[0], name: value.split('::').slice(1).join('::')}; }
      catch { value = null; }
    }
    const kind = value && classifyRegion(value.name);
    if (value?.level === 'missing' && value.name === '未识别地区') {
      selections.set('missing', {name: value.name, level: 'missing', label: value.name}); continue;
    }
    if (!kind || !(kind.level === value.level || kind.level === 'province' && value.level === 'provincial')) {
      throw Object.assign(new Error('地区名称或层级无效'), {status: 400});
    }
    const selection = {name: kind.name, level: value.level};
    selection.label = getSelectionDisplayName(selection);
    selections.set(`${selection.level}::${selection.name}`, selection);
  }
  return [...selections.values()];
}
function getMatchedRegionsForSelection(value, selection) {
  if (!selection) return [];
  const regions = splitMultiRegion(value);
  if (selection.level === 'missing') return regions.length ? [] : ['未识别地区'];
  return regions.filter(name => {
    const kind = classifyRegion(name);
    if (selection.level === 'province') return kind.name === selection.name || kind.parent === selection.name;
    return kind.name === selection.name && kind.level === (selection.level === 'provincial' ? 'province' : selection.level);
  });
}
function buildRegionTree(rows) {
  const nodes = new Map();
  const unknown = new Set();
  function add(name, id, provincial = false) {
    if (!nodes.has(name)) nodes.set(name, {ids: new Set(), provincial: new Set()});
    nodes.get(name).ids.add(String(id));
    if (provincial) nodes.get(name).provincial.add(String(id));
  }
  for (const row of rows) {
    const regions = splitMultiRegion(row.region);
    if (!regions.length) unknown.add(String(row.id));
    for (const name of regions) {
      const kind = classifyRegion(name);
      add(name, row.id, kind.level === 'province');
      if (kind.level === 'city') add(kind.parent, row.id);
    }
  }
  const result = {national: {name:'全国', level:'national', count:nodes.get('全国')?.ids.size || 0}, provinces:[], municipalities:[], unknownCount:unknown.size};
  for (const [name, node] of nodes) {
    const kind = classifyRegion(name);
    if (kind.level === 'municipality') result.municipalities.push({...kind, count:node.ids.size});
    if (kind.level === 'province') result.provinces.push({...kind, count:node.ids.size, provincialCount:node.provincial.size, cities:[...nodes].filter(([city]) => classifyRegion(city)?.parent === name).map(([city, data]) => ({name:city,level:'city',count:data.ids.size})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))});
  }
  result.provinces.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  return result;
}
module.exports = {provinceNameMap, provinceCityMap, municipalities, classifyRegion, splitMultiRegion, getCityProvince, getSelectionDisplayName, normalizeRegionSelections, getMatchedRegionsForSelection, buildRegionTree};
