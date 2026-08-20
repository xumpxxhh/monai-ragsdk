import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/layouts/AppShell';
import HomePage from '@/features/home/HomePage';
import KnowledgeBasesPage from '@/features/knowledge-bases/KnowledgeBasesPage';
import DocumentsPage from '@/features/documents/DocumentsPage';
import StrategyPage from '@/features/strategy/StrategyPage';
import AskPage from '@/features/ask/AskPage';
import SearchDebugPage from '@/features/search-debug/SearchDebugPage';
import ObservePage from '@/features/observe/ObservePage';
import SettingsPage from '@/features/settings/SettingsPage';
import { useAppContext } from '@/shared/hooks/useAppContext';

function LandingRedirect() {
  const { preferences } = useAppContext();
  return <Navigate to={preferences.landingPage === 'ask' ? '/ask' : '/'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
        <Route path="knowledge-bases/:id/documents" element={<DocumentsPage />} />
        <Route path="strategy" element={<StrategyPage />} />
        <Route path="knowledge-bases/:id/strategy" element={<Navigate to="/strategy" replace />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="search-debug" element={<SearchDebugPage />} />
        <Route path="observe" element={<ObservePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="home" element={<LandingRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
