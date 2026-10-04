const navigation = require('../config/navigation.json');
function canAccessPage(user, path) {
 const route=navigation.routes.find(r=>r.path===path);
 if(!user||!route) return false;
 if(user.role==='admin') return true;
 return Array.isArray(user.routes)&&user.routes.includes(path)&&(!route.requiredKeyword||user.keywords?.includes(route.requiredKeyword));
}
module.exports={canAccessPage,availableRoutes:navigation.routes};
