import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
const SESSION_KEY='keydigest_current_user';
const TOKEN_KEY='keydigest_auth_token';
const AuthContext=createContext(null);
function storedUser(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY))||null;}catch{return null;}}
export function AuthProvider({children}){
 const [user,setUser]=useState(storedUser);
 const [loading,setLoading]=useState(true);
 const [authError,setAuthError]=useState('');
 const revision=useRef(0);
 const authHeaders=useCallback(()=>{const token=sessionStorage.getItem(TOKEN_KEY);return token?{Authorization:`Bearer ${token}`}:{ };},[]);
 const storeUser=useCallback(profile=>{setUser(profile);if(profile)sessionStorage.setItem(SESSION_KEY,JSON.stringify(profile));else sessionStorage.removeItem(SESSION_KEY);},[]);
 const logout=useCallback(()=>{revision.current++;sessionStorage.removeItem(TOKEN_KEY);storeUser(null);setAuthError('');setLoading(false);},[storeUser]);
 const refreshUser=useCallback(async()=>{
  const current=++revision.current;
  if(!sessionStorage.getItem(TOKEN_KEY)){storeUser(null);setLoading(false);return null;}
  try{
   const res=await fetch('/api/auth/me',{headers:authHeaders()});
   if(current!==revision.current)return null;
   if(res.status===401){logout();return null;}
   if(!res.ok)throw new Error('无法读取当前权限，请重试');
   const data=await res.json();if(current!==revision.current)return null;
   storeUser(data.user);setAuthError('');return data.user;
  }catch(error){if(current===revision.current)setAuthError(error.message);return null;}
  finally{if(current===revision.current)setLoading(false);}
 },[authHeaders,logout,storeUser]);
 useEffect(()=>{refreshUser();},[refreshUser]);
 const login=useCallback(async credentials=>{
  const current=++revision.current;
  const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'登录失败');
  if(current!==revision.current)return null;
  sessionStorage.setItem(TOKEN_KEY,data.token);storeUser(data.user);setLoading(false);setAuthError('');return data.user;
 },[storeUser]);
 const apiFetch=useCallback(async(url,options={})=>{
  const token=sessionStorage.getItem(TOKEN_KEY);
  const res=await fetch(url,{...options,headers:{...options.headers,...authHeaders()}});
  if(token===sessionStorage.getItem(TOKEN_KEY)){
   if(res.status===401)logout();else if(res.status===403)await refreshUser();
  }
  return res;
 },[authHeaders,logout,refreshUser]);
 const value=useMemo(()=>({user,isAuthenticated:!!user?.username,loading,authError,allowedKeywords:user?.keywords||[],authToken:sessionStorage.getItem(TOKEN_KEY)||'',authHeaders,login,logout,refreshUser,apiFetch}),[user,loading,authError,authHeaders,login,logout,refreshUser,apiFetch]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be used inside AuthProvider');return value;}
