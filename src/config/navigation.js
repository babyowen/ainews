import catalog from '../../config/navigation.json' with { type: 'json' };
export const availableRoutes=catalog.routes;
export function canAccessRoute(user,path){
 const route=catalog.routes.find(r=>r.path===path);
 if(!user||!route)return false;
 if(user.role==='admin')return true;
 return Array.isArray(user.routes)&&user.routes.includes(path)&&(!route.requiredKeyword||user.keywords?.includes(route.requiredKeyword));
}
export function getVisibleNavigation(user){
 const leaf=route=>({...route,id:route.path});
 const groupNode=group=>({...group,children:[
  ...catalog.routes.filter(r=>r.group===group.id&&!r.hidden&&canAccessRoute(user,r.path)).map(leaf),
  ...catalog.groups.filter(g=>g.parentId===group.id).map(groupNode).filter(g=>g.children.length),
 ]});
 const nodes=catalog.routes.filter(r=>r.group==='main'&&!r.hidden&&canAccessRoute(user,r.path)).map(leaf);
 for(const group of catalog.groups.filter(g=>!g.parentId)){
  const node=groupNode(group);if(!node.children.length)continue;
  const index=nodes.findIndex(n=>n.path===group.afterPath);nodes.splice(index<0?0:index+1,0,node);
 }
 return nodes;
}
export function getDefaultAccessiblePath(user){
 if(user?.defaultPath&&canAccessRoute(user,user.defaultPath))return user.defaultPath;
 const firstLeaf=nodes=>{for(const node of nodes){if(node.path)return node.path;const path=firstLeaf(node.children||[]);if(path)return path;}return null;};
 return firstLeaf(getVisibleNavigation(user));
}
export function getActiveGroupIds(path){
 const route=catalog.routes.find(r=>r.path===path);const ids=[];let id=route?.group;
 while(id&&id!=='main'){ids.push(id);id=catalog.groups.find(g=>g.id===id)?.parentId;}
 return ids;
}
