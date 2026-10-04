import {serializePolicyBusinessSearch} from '../utils/policyBusinessFilters';
export async function fetchPolicyJson(url, options = {}) {
  const {fetcher = fetch,...requestOptions} = options;
  const response = await fetcher(url,requestOptions);
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data;
}
export function fetchPolicyBusinessNews(filters,pageOptions={},options={}) {
  const params=new URLSearchParams(serializePolicyBusinessSearch({...filters,...pageOptions}));
  if (pageOptions.pageSize) params.set('pageSize',pageOptions.pageSize);
  const paths={daily:'/api/provident-fund/news',region:'/api/policy/region-news',business:'/api/provident-fund/business-news'};
  return fetchPolicyJson(`${paths[pageOptions.mode || 'region']}?${params}`,options);
}
export const fetchPolicyBusinessFacets=(filters,options={})=>fetchPolicyJson(`/api/provident-fund/facets?${serializePolicyBusinessSearch(filters)}`,options);
export const fetchProvidentFundDailyNews=(date,pageOptions,options)=>fetchPolicyBusinessNews({startDate:date,endDate:date},{...pageOptions,mode:'daily'},options);
export const fetchProvidentFundBusinessNews=(filters,pageOptions,options)=>fetchPolicyBusinessNews(filters,{...pageOptions,mode:'business'},options);
