import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { CaseEditorPage } from './pages/CaseEditorPage';
import { EnvironmentPage } from './pages/EnvironmentPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { RunListPage } from './pages/RunListPage';
import { RunReportPage } from './pages/RunReportPage';
import { SuiteDetailPage } from './pages/SuiteDetailPage';
import { SuiteListPage } from './pages/SuiteListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<AppLayout />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="environments" element={<EnvironmentPage />} />
          <Route path="suites" element={<SuiteListPage />} />
          <Route path="suites/:suiteId" element={<SuiteDetailPage />} />
          <Route path="cases/:caseId" element={<CaseEditorPage />} />
          <Route path="runs" element={<RunListPage />} />
          <Route path="runs/:runId" element={<RunReportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
