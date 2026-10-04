const key = item => JSON.stringify(item);
export function defaultPolicyDates(mode = 'region') {
  const now = new Date();
  const format = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if (mode === 'daily') now.setDate(now.getDate()-1);
  const endDate = format(now);
  now.setDate(now.getDate()-(mode==='daily'?6:29));
  return {startDate:format(now),endDate};
}
export function parsePolicyBusinessSearch(search, mode = 'region') {
  const params = new URLSearchParams(search);
  const readList = name => params.getAll(name).flatMap(value => {
    try {const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[parsed];} catch {
      if (name === 'regions' && value.includes('::')) {const [level,name]=value.split('::');return [{name,level}];}
      return [];
    }
  }).filter(x=>x && typeof x==='object');
  const dates=defaultPolicyDates(mode);
  return {startDate:params.get('startDate')||params.get('date')||dates.startDate,endDate:params.get('endDate')||params.get('date')||dates.endDate,regions:readList('regions'),businessTypes:readList('businessTypes'),tagState:params.get('tagState')||'all',page:Math.max(1,Number(params.get('page'))||1)};
}
export function serializePolicyBusinessSearch(filters) {
  const params = new URLSearchParams();
  for (const name of ['startDate','endDate','tagState']) if (filters[name]) params.set(name,filters[name]);
  for (const name of ['regions','businessTypes']) for (const item of filters[name] || []) params.append(name,JSON.stringify(item));
  if (filters.page > 1) params.set('page',filters.page);
  return params.toString();
}
export function updatePolicySearch(search, changes, mode) {
  return serializePolicyBusinessSearch({...parsePolicyBusinessSearch(search,mode),...changes,page:changes.page || 1});
}
export function toggleBusinessSelection(current, next) {
  if (current.some(x=>key(x)===key(next))) return current.filter(x=>key(x)!==key(next));
  return [...current.filter(x=>x.level1!==next.level1 || next.level2 && x.level2),next];
}
export const safeNewsUrl = value => /^https?:\/\//i.test(value || '') ? value : null;
