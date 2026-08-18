import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { routerBasename } from '@/config/env';
import { AppProvider } from '@/shared/hooks/useAppContext';
import { Toaster } from '@/shared/ui/Toast';
import { applyTheme, readStoredTheme } from '@/shared/theme/theme';
import '@/index.css';

applyTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <AppProvider>
        <App />
        <Toaster position="top-center" richColors closeButton />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
