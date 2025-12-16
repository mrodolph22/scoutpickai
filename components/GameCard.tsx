import React from 'react';
import { EspnEvent } from '../types';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';

interface GameCardProps {
  game: EspnEvent;
  onPress: (id: string) => void;
}

const GameCard: React.FC<GameCardProps> = ({ game, onPress }) => {
  const competition = game.competitions[0];
  const home = competition.competitors.find((c) => c.homeAway === 'home');
  const away = competition.competitors.find((c) => c.homeAway === 'away');
  
  if (!home || !away) return null;

  const date = new Date(game.date).toLocaleString([], { 
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  return (
    <div 
      onClick={() => onPress(game.id)}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center text-xs text-gray-500 font-medium space-x-2">
            <span className={`px-2 py-0.5 rounded ${game.status.type.completed ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                {game.status.type.detail}
            </span>
            <span className="flex items-center"><Calendar size={12} className="mr-1"/> {date}</span>
        </div>
        {competition.venue && (
           <div className="flex items-center text-xs text-gray-400">
               <MapPin size={12} className="mr-1"/>
               <span className="truncate max-w-[150px]">{competition.venue.fullName}</span>
           </div>
        )}
      </div>

      <div className="flex flex-col space-y-3">
        {/* Away Team */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img src={away.team.logo} alt={away.team.abbreviation} className="w-8 h-8 object-contain" />
            <div>
                <div className="font-bold text-gray-900 leading-tight">{away.team.displayName}</div>
                <div className="text-xs text-gray-500">{away.records?.[0]?.summary || ''}</div>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 font-mono">{away.score}</div>
        </div>

        {/* Home Team */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img src={home.team.logo} alt={home.team.abbreviation} className="w-8 h-8 object-contain" />
            <div>
                <div className="font-bold text-gray-900 leading-tight">{home.team.displayName}</div>
                <div className="text-xs text-gray-500">{home.records?.[0]?.summary || ''}</div>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 font-mono">{home.score}</div>
        </div>
      </div>
    </div>
  );
};

export default GameCard;