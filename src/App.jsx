import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import SummaryNewsPage from './pages/SummaryNews';
import SourceAnalysisPage from './pages/SourceAnalysis';
import ReportGeneratorPage from './pages/ReportGenerator';
import ReportConfigPage from './pages/ReportConfig';
import QualityAnalysisPage from './pages/QualityAnalysis';
import ScoreEditPage from './pages/ScoreEdit';
import WordCountStatsPage from './pages/WordCountStats';
import HistoryReports from './pages/HistoryReports';
import AutoReportPage from './pages/AutoReportConfig';
import LoginPage from './pages/Login';
import LoginStatsPage from './pages/LoginStats';
import UserManagementPage from './pages/UserManagement';
import CurrentPolicyPage from './pages/PolicyComparison/CurrentPolicy';
import WeeklyComparisonPage from './pages/PolicyComparison/WeeklyComparison';
import RegionPolicyBrowser from './pages/PolicyComparison/RegionPolicyBrowser';
import RegionPolicyReportPage from './pages/PolicyComparison/RegionPolicyReport';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './auth/AuthContext';
import './App.css'
import {canAccessRoute,getDefaultAccessiblePath} from './config/navigation';

function ProtectedShell() {
  const { isAuthenticated, user, loading, authError, refreshUser } = useAuth();

  if (loading) return <div className="kd-page">正在读取权限…</div>;
  if (authError) return <div className="kd-page">{authError}<button onClick={refreshUser}>重试</button></div>;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function ProtectedPage({ routePath, children }) {
  const { user } = useAuth();

  if (!canAccessRoute(user,routePath)) {
    const path=getDefaultAccessiblePath(user);
    return path ? <Navigate to={path} replace /> : <div className="kd-page">暂无可访问功能，请联系管理员。</div>;
  }

  return children;
}

function HomeRedirect() {
  const {isAuthenticated,user,loading}=useAuth();
  if(loading)return <div className="kd-page">正在读取权限…</div>;
  const path=isAuthenticated?getDefaultAccessiblePath(user):'/login';
  return path?<Navigate to={path} replace />:<div className="kd-page">暂无可访问功能，请联系管理员。</div>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedShell />}>
              <Route path="/summary" element={<ProtectedPage routePath="/summary"><SummaryNewsPage /></ProtectedPage>} />
              <Route path="/analysis" element={<ProtectedPage routePath="/analysis"><SourceAnalysisPage /></ProtectedPage>} />
              <Route path="/report" element={<ProtectedPage routePath="/report"><ReportGeneratorPage /></ProtectedPage>} />
              <Route path="/config" element={<ProtectedPage routePath="/config"><ReportConfigPage /></ProtectedPage>} />
              <Route path="/quality" element={<ProtectedPage routePath="/quality"><QualityAnalysisPage /></ProtectedPage>} />
              <Route path="/score-edit" element={<ProtectedPage routePath="/score-edit"><ScoreEditPage /></ProtectedPage>} />
              <Route path="/word-count" element={<ProtectedPage routePath="/word-count"><WordCountStatsPage /></ProtectedPage>} />
              <Route path="/history" element={<ProtectedPage routePath="/history"><HistoryReports /></ProtectedPage>} />
              <Route path="/auto-report" element={<ProtectedPage routePath="/auto-report"><AutoReportPage /></ProtectedPage>} />
              <Route path="/login-stats" element={<ProtectedPage routePath="/login-stats"><LoginStatsPage /></ProtectedPage>} />
              <Route path="/user-management" element={<ProtectedPage routePath="/user-management"><UserManagementPage /></ProtectedPage>} />
              <Route path="/policy/current" element={<ProtectedPage routePath="/policy/current"><CurrentPolicyPage /></ProtectedPage>} />
              <Route path="/policy/comparison" element={<ProtectedPage routePath="/policy/comparison"><WeeklyComparisonPage /></ProtectedPage>} />
              <Route path="/policy/regions" element={<ProtectedPage routePath="/policy/regions"><RegionPolicyBrowser /></ProtectedPage>} />
              <Route path="/policy/region-report" element={<ProtectedPage routePath="/policy/region-report"><RegionPolicyReportPage /></ProtectedPage>} />
            </Route>
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
