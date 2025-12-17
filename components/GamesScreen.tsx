import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchScoreboard } from '../services/espnService';
import { SeasonType, EspnEvent } from '../types';
import GameCard from './GameCard';
import { Loader2, RefreshCw, Github } from 'lucide-react';

const GamesScreen: React.FC = () => {
  const navigate = useNavigate();
  const [week, setWeek] = useState(1);
  const [seasonType, setSeasonType] = useState<SeasonType>(SeasonType.Regular);
  const [games, setGames] = useState<EspnEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGames = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScoreboard(week, seasonType);
      setGames(data);
    } catch (err) {
      setError('Failed to load scoreboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initial load only, let user trigger subsequent loads via button as per prompt req or we can auto-load on change

  const handleGamePress = (eventId: string) => {
    navigate(`/game/${eventId}`);
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10 p-4">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="w-8"></div> {/* Spacer for symmetry */}
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">NFL Scoreboard</h1>
          <a 
            href="https://github.com/mrodolph22/scoutpickai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 text-gray-400 hover:text-black transition-all rounded-full hover:bg-gray-100 active:scale-95"
            title="View Source on GitHub"
          >
            <Github size={20} />
          </a>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <select 
            value={seasonType}
            onChange={(e) => setSeasonType(Number(e.target.value))}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
          >
            <option value={1}>Preseason</option>
            <option value={2}>Regular Season</option>
            <option value={3}>Postseason</option>
          </select>

          <select 
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
          >
            {Array.from({ length: 22 }, (_, i) => i + 1).map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>

          <button 
            onClick={loadGames}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Load
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
           <div className="flex flex-col items-center justify-center py-20 text-gray-500">
             <Loader2 className="animate-spin mb-2" size={32} />
             <p className="font-medium">Loading scores...</p>
           </div>
        ) : error ? (
           <div className="text-center py-10 text-red-500 bg-red-50 rounded-xl border border-red-100 m-4">
             <p className="font-medium">{error}</p>
             <button onClick={loadGames} className="mt-2 text-blue-600 hover:underline text-sm font-bold">Retry</button>
           </div>
        ) : games.length === 0 ? (
           <div className="text-center py-20 text-gray-400 font-medium">No games found for this week.</div>
        ) : (
          <div className="space-y-4">
            {games.map(game => (
              <GameCard key={game.id} game={game} onPress={handleGamePress} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamesScreen;