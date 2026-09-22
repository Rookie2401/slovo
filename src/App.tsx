import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSettings } from './database/settings';
import { Home } from './ui/Home';
import { Onboarding } from './ui/Onboarding';
import { ImportScreen } from './ui/Import';
import { Reader } from './reader/Reader';
import { SettingsScreen } from './ui/Settings';
import { AlphabetHome, StageScreen, LetterScreen, DrillScreen, HandwritingScreen } from './ui/Alphabet';
import { WordScreen } from './ui/Word';
import { VocabularyScreen } from './ui/Vocabulary';
import { ChapterPrepScreen } from './ui/ChapterPrep';
import { UpdateToast } from './ui/UpdateToast';

function Gate({ children }: { children: React.ReactNode }) {
  const [s] = useSettings();
  const loc = useLocation();
  if (!s.onboarded && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <Gate>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/read/:bookId/:chapterId" element={<Reader />} />
          <Route path="/prep/:bookId/:chapterId" element={<ChapterPrepScreen />} />
          <Route path="/word/:key" element={<WordScreen />} />
          <Route path="/vocabulary" element={<VocabularyScreen />} />
          <Route path="/alphabet" element={<AlphabetHome />} />
          <Route path="/alphabet/stage/:stageId" element={<StageScreen />} />
          <Route path="/alphabet/letter/:symbol" element={<LetterScreen />} />
          <Route path="/alphabet/drill/:mode" element={<DrillScreen />} />
          <Route path="/alphabet/write/:symbol" element={<HandwritingScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Gate>
      <UpdateToast />
    </HashRouter>
  );
}
