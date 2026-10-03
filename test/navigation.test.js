import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {getVisibleNavigation,canAccessRoute,getDefaultAccessiblePath} from '../src/config/navigation.js';
const {canAccessPage}=createRequire(import.meta.url)('../services/routeAccess.cjs');
const user={role:'restricted',keywords:['公积金'],routes:['/policy/regions'],defaultPath:'/summary'};
const leaves=nodes=>nodes.flatMap(n=>n.children?leaves(n.children):[n.path]);
test('region browsing does not grant reports, business pages or Yangzhou tools',()=>{
 const nav=getVisibleNavigation(user); assert.deepEqual(leaves(nav),['/policy/regions']);
 assert.equal(nav[0].id,'housing-fund'); assert.equal(nav[0].children[0].id,'fund-regions');
 assert.equal(getDefaultAccessiblePath(user),'/policy/regions');
});
test('menu and server both require the keyword and the exact leaf permission',()=>{
 for(const profile of [user,{...user,keywords:[]},{...user,routes:[]},{role:'admin'},null]){
  for(const path of ['/summary','/policy/regions','/policy/current','/provident-fund/business-report','/unknown']) assert.equal(canAccessRoute(profile,path),canAccessPage(profile,path));
 }
 assert.equal(canAccessRoute({...user,keywords:[]},'/policy/regions'),false);
 assert.equal(getDefaultAccessiblePath({...user,routes:[]}),null);
});
test('admin navigation inserts the fund workspace after daily news and keeps all legacy leaves once',()=>{
 const nav=getVisibleNavigation({role:'admin'}); assert.equal(nav[0].path,'/summary');assert.equal(nav[1].id,'housing-fund');
 const paths=leaves(nav); assert.equal(new Set(paths).size,paths.length);
 for(const path of ['/policy/current','/policy/comparison','/policy/regions','/policy/region-report']) assert.ok(paths.includes(path));
 assert.equal(paths.includes('/history'),false);
});
