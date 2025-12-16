import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchGameSummary } from '../services/espnService';
import { GameSummary } from '../types';
import StatTable from './StatTable';
import { ArrowLeft, Filter } from 'lucide-react';

const GameScreen: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');

  useEffect(() => {
    if (eventId) {
      fetchGameSummary(eventId)
        .then(setSummary)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [eventId]);

  const getTeamLogo = (team: { logo?: string; abbreviation: string }) => {
    if (team.logo) return team.logo;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation}.png`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading game data...</div>;
  if (!summary) return <div className="p-8 text-center text-red-500">Game not found.</div>;

  const { header, boxscore } = summary;
  
  // Safe access to competition and status (API structure differs slightly between endpoints)
  const competition = header.competitions?.[0];
  const status = competition?.status || header.status;
  
  if (!competition || !status) {
      return <div className="p-8 text-center text-gray-500">Game details unavailable.</div>;
  }

  const competitors = competition.competitors || [];
  const homeComp = competitors.find(c => c.homeAway === 'home');
  const awayComp = competitors.find(c => c.homeAway === 'away');
  
  const homeScore = homeComp?.score || '0';
  const awayScore = awayComp?.score || '0';

  // Safe access to teams in boxscore
  const homeTeamId = homeComp?.team?.id;
  const awayTeamId = awayComp?.team?.id;

  const home = boxscore?.teams?.find(t => t.team.id === homeTeamId);
  const away = boxscore?.teams?.find(t => t.team.id === awayTeamId);
  
  // If boxscore data is missing (e.g. game hasn't started), handle gracefully
  const hasStats = !!(home && away);

  // Prepare Team Totals Data for StatTable
  const teamStatRows = hasStats ? away!.statistics.map((stat, idx) => ({
    label: stat.label,
    awayValue: stat.displayValue,
    homeValue: home!.statistics.find(s => s.name === stat.name)?.displayValue || '-'
  })) : [];

  return (
    <div className="max-w-3xl mx-auto bg-gray-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 border-b shadow-sm">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate('/games')} 
            className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Game Statistics</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Score Card with Integrated Team Stats */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
                <div className="text-center text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">
                    {status.type.detail}
                </div>
                {homeComp && awayComp ? (
                    <div className="flex justify-between items-center px-4">
                        <div className="flex flex-col items-center w-1/3">
                            <img 
                            src={getTeamLogo(awayComp.team)} 
                            alt={awayComp.team.abbreviation} 
                            className="w-16 h-16 object-contain mb-2" 
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://a.espncdn.com/i/teamlogos/nfl/500/${awayComp.team.abbreviation}.png`;
                            }}
                            />
                            <div className="font-bold text-center leading-tight text-gray-900">{awayComp.team.displayName}</div>
                            <div className="text-4xl font-bold mt-2 font-mono text-gray-900">{awayScore}</div>
                        </div>
                        <div className="text-gray-300 font-light text-3xl">vs</div>
                        <div className="flex flex-col items-center w-1/3">
                            <img 
                            src={getTeamLogo(homeComp.team)} 
                            alt={homeComp.team.abbreviation} 
                            className="w-16 h-16 object-contain mb-2" 
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://a.espncdn.com/i/teamlogos/nfl/500/${homeComp.team.abbreviation}.png`;
                            }}
                            />
                            <div className="font-bold text-center leading-tight text-gray-900">{homeComp.team.displayName}</div>
                            <div className="text-4xl font-bold mt-2 font-mono text-gray-900">{homeScore}</div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-500">Team info unavailable</div>
                )}
            </div>

            {/* Team Stats Integrated Here */}
            {hasStats && (
                <StatTable 
                    title="Team Stats Comparison"
                    collapsible={true}
                    defaultExpanded={false}
                    className="border-t border-gray-100" // Custom styling to blend with card
                    columns={[
                        { header: 'Stat', accessor: (row) => row.label, align: 'left', width: 'w-1/3' },
                        { header: away!.team.abbreviation, accessor: (row) => row.awayValue, align: 'center' },
                        { header: home!.team.abbreviation, accessor: (row) => row.homeValue, align: 'center' },
                    ]}
                    data={teamStatRows}
                />
            )}
        </div>

        {/* Team Filter for Player Stats */}
        {hasStats && boxscore?.players && boxscore.players.length > 0 && (
            <div className="flex items-center justify-end gap-2 mb-2">
                <Filter size={16} className="text-gray-400" />
                <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer hover:border-blue-400 transition-colors"
                >
                    <option value="all">All Teams</option>
                    {boxscore.players.map((teamPlayers) => (
                        <option key={teamPlayers.team.id} value={teamPlayers.team.id}>
                            {teamPlayers.team.displayName}
                        </option>
                    ))}
                </select>
            </div>
        )}

        {/* Player Stats - Grouped by Team then Category */}
        {hasStats && boxscore?.players && (
            <div className="space-y-8">
                {boxscore.players
                    .filter(teamPlayers => selectedTeamId === 'all' || teamPlayers.team.id === selectedTeamId)
                    .map((teamPlayers) => (
                    <div key={teamPlayers.team.id}>
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <img src={getTeamLogo(teamPlayers.team)} className="w-6 h-6 object-contain" alt="logo"/>
                            <h2 className="text-xl font-bold text-gray-900">{teamPlayers.team.displayName} Stats</h2>
                        </div>
                        
                        {teamPlayers.statistics.map((category) => (
                            <StatTable 
                                key={category.name}
                                title={category.text || category.name}
                                columns={[
                                    { 
                                        header: 'Player', 
                                        accessor: (row: any) => (
                                            <div className="font-medium text-gray-900">{row.name}</div>
                                        ), 
                                        width: 'w-1/3' 
                                    },
                                    ...category.labels.map((label, i) => ({
                                        header: label,
                                        accessor: (row: any) => row.stats[i],
                                        align: 'center' as const
                                    }))
                                ]}
                                data={[
                                    ...category.athletes.map(a => ({
                                        id: a.athlete.id,
                                        teamAbbr: teamPlayers.team.abbreviation,
                                        name: a.athlete.displayName,
                                        stats: a.stats
                                    })),
                                    ...(category.totals ? [{
                                        id: 'total',
                                        name: 'TOTALS',
                                        stats: category.totals
                                    }] : [])
                                ]}
                                highlightRow={!!category.totals}
                                onRowClick={(item) => {
                                    if (item.id !== 'total') {
                                        navigate(`/player/${item.id}/${item.teamAbbr}`);
                                    }
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default GameScreen;