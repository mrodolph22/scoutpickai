import React from 'react';
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import GamesScreen from './components/GamesScreen';
import GameScreen from './components/GameScreen';
import PlayerScreen from './components/PlayerScreen';
import { DefensiveStatsProvider } from './contexts/DefensiveStatsContext';

const App: React.FC = () => {
  return (
    <DefensiveStatsProvider>
      <Router initialEntries={['/games']}>
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
          <Routes>
            <Route path="/" element={<Navigate to="/games" replace />} />
            <Route path="/games" element={<GamesScreen />} />
            <Route path="/game/:eventId" element={<GameScreen />} />
            <Route path="/player/:playerId/:teamAbbr" element={<PlayerScreen />} />
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/games" replace />} />
          </Routes>
        </div>
      </Router>
    </DefensiveStatsProvider>
  );
};

export default App;