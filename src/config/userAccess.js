import { KEYWORDS } from './keywords.js';

export const USERS = {
  admin: {
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    defaultPath: '/summary',
    keywords: KEYWORDS,
    routes: [
      '/summary',
      '/analysis',
      '/report',
      '/score-edit',
      '/word-count',
      '/config',
      '/history',
      '/login-stats',
      '/policy/current',
      '/policy/comparison',
      '/policy/regions',
      '/policy/region-report',
    ],
  },
  yzgjj: {
    username: 'yzgjj',
    displayName: 'YZGJJ',
    role: 'restricted',
    defaultPath: '/summary',
    keywords: ['公积金'],
    routes: [
      '/summary',
      '/report',
      '/word-count',
      '/policy/current',
      '/policy/comparison',
      '/policy/regions',
      '/policy/region-report',
    ],
  },
};

export function getUserProfile(username) {
  const user = USERS[username];
  if (!user) return null;
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    defaultPath: user.defaultPath,
    keywords: [...user.keywords],
    routes: [...user.routes],
  };
}

export function getAllowedKeywords(username) {
  return getUserProfile(username)?.keywords || [];
}

export function getAllowedRoutes(username) {
  return getUserProfile(username)?.routes || [];
}

export function isRouteAllowed(username, routePath) {
  return getAllowedRoutes(username).includes(routePath);
}

export function isKeywordAllowed(username, keyword) {
  return getAllowedKeywords(username).includes(keyword);
}
