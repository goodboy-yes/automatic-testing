import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { CaseEditorPage } from './pages/CaseEditorPage';
import { CaseListPage } from './pages/CaseListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/cases" replace />} />
        <Route path="/" element={<AppLayout />}>
          <Route path="cases" element={<CaseListPage />} />
          <Route path="cases/:caseId" element={<CaseEditorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
