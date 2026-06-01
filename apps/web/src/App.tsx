import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProjectListPage } from './pages/ProjectListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectListPage />} />
      </Routes>
    </BrowserRouter>
  );
}
