import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAllowedKeywords,
  getAllowedRoutes,
  getUserProfile,
  isRouteAllowed,
} from '../src/config/userAccess.js';

test('admin keeps full access and receives login stats route', () => {
  const profile = getUserProfile('admin');

  assert.equal(profile.username, 'admin');
  assert.equal(profile.defaultPath, '/summary');
  assert.equal(getAllowedKeywords('admin').includes('公积金'), true);
  assert.equal(getAllowedRoutes('admin').includes('/config'), true);
  assert.equal(getAllowedRoutes('admin').includes('/login-stats'), true);
  assert.equal(isRouteAllowed('admin', '/score-edit'), true);
});

test('yzgjj is limited to housing fund keyword and selected routes', () => {
  assert.deepEqual(getAllowedKeywords('yzgjj'), ['公积金']);
  assert.equal(isRouteAllowed('yzgjj', '/summary'), true);
  assert.equal(isRouteAllowed('yzgjj', '/report'), true);
  assert.equal(isRouteAllowed('yzgjj', '/word-count'), true);
  assert.equal(isRouteAllowed('yzgjj', '/policy/current'), true);
  assert.equal(isRouteAllowed('yzgjj', '/policy/comparison'), true);
  assert.equal(isRouteAllowed('yzgjj', '/policy/regions'), true);
  assert.equal(isRouteAllowed('yzgjj', '/policy/region-report'), true);
  assert.equal(isRouteAllowed('yzgjj', '/config'), false);
  assert.equal(isRouteAllowed('yzgjj', '/score-edit'), false);
});
