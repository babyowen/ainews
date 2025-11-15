import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SummaryNewsPage from './pages/SummaryNews';
import SourceAnalysisPage from './pages/SourceAnalysis';
import ReportGeneratorPage from './pages/ReportGenerator';
import ReportConfigPage from './pages/ReportConfig';
import QualityAnalysisPage from './pages/QualityAnalysis';
import ScoreEditPage from './pages/ScoreEdit';
import WordCountStatsPage from './pages/WordCountStats';
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
            <Route path="*" element={<Navigate to="/summary" />} />
          </Routes>
        </Layout>
      </Router>
    </>
  )
}

export default App
