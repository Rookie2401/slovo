import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme } from './database/settings';
import { ensureAnalysisSources } from './database/db';

applyTheme();
void ensureAnalysisSources().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
