import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SummaryNewsPage from './pages/SummaryNews';
import SourceAnalysisPage from './pages/SourceAnalysis';
import ReportGeneratorPage from './pages/ReportGenerator';
import ReportConfigPage from './pages/ReportConfig';
import QualityAnalysisPage from './pages/QualityAnalysis';
import ScoreEditPage from './pages/ScoreEdit';
import WordCountStatsPage from './pages/WordCountStats';
import HistoryReports from './pages/HistoryReports';
import CurrentPolicyPage from './pages/PolicyComparison/CurrentPolicy';
import WeeklyComparisonPage from './pages/PolicyComparison/WeeklyComparison';
import RegionPolicyBrowser from './pages/PolicyComparison/RegionPolicyBrowser';
import RegionPolicyReportPage from './pages/PolicyComparison/RegionPolicyReport';
import Layout from './components/Layout';
import './App.css'

function App() {
  return (
    <>
      <Router>
        <Layout>
          <Routes>
            <Route path="/summary" element={<SummaryNewsPage />} />
            <Route path="/analysis" element={<SourceAnalysisPage />} />
            <Route path="/report" element={<ReportGeneratorPage />} />
            <Route path="/config" element={<ReportConfigPage />} />
            <Route path="/quality" element={<QualityAnalysisPage />} />
            <Route path="/score-edit" element={<ScoreEditPage />} />
            <Route path="/word-count" element={<WordCountStatsPage />} />
            <Route path="/history" element={<HistoryReports />} />
            <Route path="/policy/current" element={<CurrentPolicyPage />} />
            <Route path="/policy/comparison" element={<WeeklyComparisonPage />} />
            <Route path="/policy/regions" element={<RegionPolicyBrowser />} />
            <Route path="/policy/region-report" element={<RegionPolicyReportPage />} />
            <Route path="*" element={<Navigate to="/summary" />} />
          </Routes>
        </Layout>
      </Router>
    </>
  )
}

export default App
