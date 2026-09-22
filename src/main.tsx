import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme } from './database/settings';
import { ensureAnalysisSources } from './database/db';
import { cleanupObsoleteDataCaches } from './pwa/cleanupCaches';

applyTheme();
void ensureAnalysisSources().catch(() => {});
void cleanupObsoleteDataCaches().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
