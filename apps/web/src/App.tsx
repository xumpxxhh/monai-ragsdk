import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/layouts/AppShell';
import HomePage from '@/features/home/HomePage';
import KnowledgeBasesPage from '@/features/knowledge-bases/KnowledgeBasesPage';
import DocumentsPage from '@/features/documents/DocumentsPage';
import StrategyPage from '@/features/strategy/StrategyPage';
import AskPage from '@/features/ask/AskPage';
import EvalPage from '@/features/eval/EvalPage';
import ObservePage from '@/features/observe/ObservePage';
import SettingsPage from '@/features/settings/SettingsPage';
import { useAppContext } from '@/shared/hooks/useAppContext';

/** `/` 按着陆偏好分流；终端用户始终进问答，避免误落管理员工作台。 */
function LandingRedirect() {
  const { preferences, isAdmin } = useAppContext();
  if (preferences.landingPage === 'ask' || !isAdmin) {
    return <Navigate to="/ask" replace />;
  }
  return <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingRedirect />} />
        <Route path="home" element={<HomePage />} />
        <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
        <Route path="knowledge-bases/:id/documents" element={<DocumentsPage />} />
        <Route path="strategy" element={<StrategyPage />} />
        <Route path="eval" element={<EvalPage />} />
        <Route path="knowledge-bases/:id/strategy" element={<Navigate to="/strategy" replace />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="search-debug" element={<Navigate to="/ask?mode=search" replace />} />
        <Route path="observe" element={<ObservePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
