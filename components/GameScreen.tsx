
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchGameSummary } from '../services/espnService';
import { analyzeLiveProps, PropAnalysisResponse } from '../services/geminiService';
import { GameSummary } from '../types';
import StatTable from './StatTable';
import { ArrowLeft, Filter, Ticket, Loader2, AlertCircle, RefreshCcw, BrainCircuit, TrendingUp, TrendingDown, User } from 'lucide-react';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';

const GameScreen: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');

  // Odds API & AI Analysis State
  const [oddsApiKey, setOddsApiKey] = useState(localStorage.getItem('ODDS_API_KEY') || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isKeySubmitted, setIsKeySubmitted] = useState(!!localStorage.getItem('ODDS_API_KEY'));
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<PropAnalysisResponse | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>('draftkings');

  useEffect(() => {
    if (eventId) {
      fetchGameSummary(eventId)
        .then(setSummary)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [eventId]);

  const handleBuildParlay = async () => {
    if (!oddsApiKey) {
      setError("Please enter an API key");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setAiAnalysis(null);
    localStorage.setItem('ODDS_API_KEY', oddsApiKey);

    console.info("[Parlay Builder] Initializing analysis workflow...");

    try {
      // 1. Fetch Event List to Match Game
      const eventsRes = await fetch(`${ODDS_API_BASE}/events?apiKey=${oddsApiKey}`);
      if (!eventsRes.ok) {
        const errorData = await eventsRes.json().catch(() => ({ message: 'Invalid API Key or Rate Limit' }));
        console.error("[Parlay Builder] Odds API events list fetch failed:", errorData);
        throw new Error(errorData.message || "Failed to fetch event list.");
      }
      const events = await eventsRes.json();
      console.debug("[Parlay Builder DEBUG] Events list size from Odds API:", events.length);

      if (!summary) {
        console.error("[Parlay Builder ERROR] No ESPN summary found for eventId:", eventId);
        return;
      }
      const competition = summary.header.competitions?.[0];
      const awayTeamDisplayName = competition?.competitors.find(c => c.homeAway === 'away')?.team.displayName;
      const homeTeamDisplayName = competition?.competitors.find(c => c.homeAway === 'home')?.team.displayName;

      console.debug("[Parlay Builder DEBUG] Attempting to match teams from Odds API:", { away: awayTeamDisplayName, home: homeTeamDisplayName });

      const matchedEvent = events.find((e: any) => 
        (e.home_team.toLowerCase().includes(homeTeamDisplayName?.toLowerCase() || '') || homeTeamDisplayName?.toLowerCase().includes(e.home_team.toLowerCase())) &&
        (e.away_team.toLowerCase().includes(awayTeamDisplayName?.toLowerCase() || '') || awayTeamDisplayName?.toLowerCase().includes(e.away_team.toLowerCase()))
      );

      if (!matchedEvent) {
        console.warn("[Parlay Builder] Matching failed. No Odds API event corresponds to:", { home: homeTeamDisplayName, away: awayTeamDisplayName });
        throw new Error("No matching live or upcoming event found in The Odds API for this game.");
      }

      console.info("[Parlay Builder] Found matched event ID in Odds API:", matchedEvent.id);

      // 2. Fetch Odds for Matched Event
      const marketsList = [
        'player_anytime_td', 'player_pass_yds', 'player_rush_yds', 
        'player_receptions', 'player_reception_yds'
      ].join(',');

      const oddsUrl = `${ODDS_API_BASE}/events/${matchedEvent.id}/odds?apiKey=${oddsApiKey}&regions=us&markets=${marketsList}&oddsFormat=american&bookmakers=${selectedBookmaker}`;
      
      console.debug("[Parlay Builder DEBUG] Requesting odds data payload from:", oddsUrl);

      const oddsRes = await fetch(oddsUrl);
      if (!oddsRes.ok) {
        const errorData = await oddsRes.json().catch(() => ({ message: 'Could not fetch odds for this event' }));
        console.error("[Parlay Builder] Odds API specific event odds fetch failed:", errorData);
        throw new Error(errorData.message || "Market data fetch failed.");
      }
      const oddsData = await oddsRes.json();
      console.debug("[Parlay Builder DEBUG] Full raw odds JSON received:", oddsData);

      if (!oddsData.bookmakers || oddsData.bookmakers.length === 0) {
        console.warn("[Parlay Builder] No active bookmaker markets found for bookie:", selectedBookmaker);
        throw new Error(`The selected bookmaker (${selectedBookmaker}) currently has no active player props for this game. Try switching bookmakers.`);
      }

      const marketCount = oddsData.bookmakers[0]?.markets?.length || 0;
      console.debug(`[Parlay Builder DEBUG] Retained ${marketCount} markets for AI analysis.`);

      // 3. AI Analysis
      console.info("[Parlay Builder] Handing data off to Gemini AI...");
      const result = await analyzeLiveProps(oddsData, homeTeamDisplayName || 'Home', awayTeamDisplayName || 'Away');
      
      if (!result || !result.analysis || result.analysis.length === 0) {
        console.error("[Parlay Builder ERROR] AI returned an empty or invalid pick list.");
        throw new Error("The AI was unable to generate picks. This can happen if the market data is too sparse.");
      }
      
      console.info("[Parlay Builder] Parlay picks generated successfully.");
      setAiAnalysis(result);
    } catch (err: any) {
      console.error("[Parlay Builder FATAL ERROR]", err);
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeySubmit = () => {
    if (!oddsApiKey) {
      setError("Please enter an API key");
      return;
    }
    setError(null);
    localStorage.setItem('ODDS_API_KEY', oddsApiKey);
    setIsKeySubmitted(true);
  };

  const getTeamLogo = (team: { logo?: string; abbreviation: string }) => {
    if (team.logo) return team.logo;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation}.png`;
  };

  const getLogoByTeamString = (teamStr: string) => {
    if (!summary) return null;
    const comps = summary.header.competitions?.[0]?.competitors || [];
    const matched = comps.find(c => 
        c.team.displayName.toLowerCase().includes(teamStr.toLowerCase()) || 
        teamStr.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
        c.team.abbreviation.toLowerCase() === teamStr.toLowerCase()
    );
    return matched ? getTeamLogo(matched.team) : null;
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-sm font-medium">Loading game details...</p>
    </div>
  );
  
  if (!summary) return <div className="p-8 text-center text-red-500">Game not found.</div>;

  const { header, boxscore } = summary;
  const competition = header.competitions?.[0];
  const status = competition?.status || header.status;
  
  if (!competition || !status) {
      return <div className="p-8 text-center text-gray-500">Game details unavailable.</div>;
  }

  const isCompleted = status.type.completed;
  const competitors = competition.competitors || [];
  const homeComp = competitors.find(c => c.homeAway === 'home');
  const awayComp = competitors.find(c => c.homeAway === 'away');
  
  const homeScore = homeComp?.score || '0';
  const awayScore = awayComp?.score || '0';
  const homeTeamId = homeComp?.team?.id;
  const awayTeamId = awayComp?.team?.id;

  const homeTeamName = homeComp?.team?.displayName || 'Home';
  const awayTeamName = awayComp?.team?.displayName || 'Away';

  const home = boxscore?.teams?.find(t => t.team.id === homeTeamId);
  const away = boxscore?.teams?.find(t => t.team.id === awayTeamId);
  const hasStats = !!(home && away);

  const teamStatRows = hasStats ? away!.statistics.map((stat) => ({
    label: stat.label,
    awayValue: stat.displayValue,
    homeValue: home!.statistics.find(s => s.name === stat.name)?.displayValue || '-'
  })) : [];

  const getCategoryLabel = (catName: string) => {
    const name = catName.toLowerCase();
    if (name.includes('passing')) return 'Pass Yards';
    if (name.includes('rushing')) return 'Rush Yards';
    if (name.includes('receiving')) return 'Rec Yards';
    if (name.includes('receptions')) return 'Receptions';
    if (name.includes('td')) return 'TDs';
    return '';
  };

  return (
    <div className="max-w-3xl mx-auto bg-gray-50 min-h-screen pb-20">
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
                <div className="text-center text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider flex items-center justify-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`}></span>
                    {status.type.detail}
                </div>
                {homeComp && awayComp ? (
                    <div className="relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
                            <span className="text-xl md:text-2xl font-black text-gray-100 italic tracking-tighter">VS</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 md:gap-8 relative z-10">
                            <div className="flex flex-col items-center text-center">
                                <img 
                                    src={getTeamLogo(awayComp.team)} 
                                    alt={awayComp.team.abbreviation} 
                                    className="w-16 h-16 object-contain mb-2" 
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://a.espncdn.com/i/teamlogos/nfl/500/${awayComp.team.abbreviation}.png`; }}
                                />
                                <div className="font-bold leading-tight text-gray-900 text-sm md:text-base">{awayComp.team.displayName}</div>
                                <div className="text-xs text-gray-500 mt-1">{awayComp.records?.[0]?.summary}</div>
                                <div className="text-4xl font-bold mt-2 font-mono text-gray-900">{awayScore}</div>
                            </div>
                            <div className="flex flex-col items-center text-center">
                                <img 
                                    src={getTeamLogo(homeComp.team)} 
                                    alt={homeComp.team.abbreviation} 
                                    className="w-16 h-16 object-contain mb-2" 
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://a.espncdn.com/i/teamlogos/nfl/500/${homeComp.team.abbreviation}.png`; }}
                                />
                                <div className="font-bold leading-tight text-gray-900 text-sm md:text-base">{homeComp.team.displayName}</div>
                                <div className="text-xs text-gray-500 mt-1">{homeComp.records?.[0]?.summary}</div>
                                <div className="text-4xl font-bold mt-2 font-mono text-gray-900">{homeScore}</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-500">Team info unavailable</div>
                )}
            </div>

            {hasStats && (
                <StatTable 
                    title="Team Stats Comparison"
                    collapsible={true}
                    defaultExpanded={false}
                    className="border-t border-gray-100"
                    columns={[
                        { header: 'Stat', accessor: (row) => row.label, align: 'left', width: 'w-1/3' },
                        { header: away!.team.abbreviation, accessor: (row) => row.awayValue, align: 'center' },
                        { header: home!.team.abbreviation, accessor: (row) => row.homeValue, align: 'center' },
                    ]}
                    data={teamStatRows}
                />
            )}
        </div>

        {!isCompleted && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Ticket size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-tight">Player Stats Parlay Builder</h3>
              </div>
            </div>
            
            <div className="p-5">
              <div className="space-y-5">
                 {!isKeySubmitted ? (
                   <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Odds API Key</label>
                        <div className="flex gap-2">
                          <input 
                            type="password"
                            value={oddsApiKey}
                            onChange={(e) => setOddsApiKey(e.target.value)}
                            placeholder="Paste API Key..."
                            className="flex-1 p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          />
                          <button 
                            onClick={handleKeySubmit}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm active:scale-[0.98]"
                          >
                            Submit Key
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed italic text-center">
                        Submit your key to reveal parlay tools.
                      </p>
                   </div>
                 ) : (
                   <div className="space-y-5 animate-in fade-in duration-300">
                      <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Select bookmaker</label>
                          <select 
                            value={selectedBookmaker}
                            onChange={(e) => setSelectedBookmaker(e.target.value)}
                            className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                          >
                            <option value="draftkings">DraftKings</option>
                            <option value="fanduel">FanDuel</option>
                            <option value="betonlineag">BetOnline.ag</option>
                            <option value="betrivers">BetRivers</option>
                            <option value="betmgm">BetMGM</option>
                            <option value="bovada">Bovada</option>
                          </select>
                        </div>
                        <button 
                          onClick={handleBuildParlay}
                          disabled={isProcessing}
                          className="w-full md:w-auto bg-black text-white px-8 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] disabled:opacity-70"
                        >
                          {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
                          {isProcessing ? 'Analyzing...' : 'Build Parlay'}
                        </button>
                      </div>

                      {aiAnalysis && (
                        <div className="space-y-6 pt-4 border-t border-gray-100 animate-in slide-in-from-top-4 duration-500">
                           <div className="flex items-center gap-2 px-1 mb-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                 <BrainCircuit size={18} className="text-blue-600" />
                              </div>
                              <div>
                                 <h4 className="text-sm font-black text-gray-900 uppercase">Game Parlay Picks</h4>
                                 <p className="text-[10px] text-gray-400 font-bold">{awayTeamName} vs {homeTeamName}</p>
                              </div>
                           </div>

                           {aiAnalysis.analysis.map((category, catIdx) => (
                             <div key={catIdx} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                                   <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">
                                      {category.categoryName}
                                   </h3>
                                </div>
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                                   {[...category.picks].sort((a, b) => {
                                       // Sort: Away Team Pick Left, Home Team Pick Right
                                       const aIsAway = a.team.toLowerCase().includes(awayComp?.team.abbreviation.toLowerCase() || '') || 
                                                       a.team.toLowerCase().includes(awayComp?.team.displayName.toLowerCase() || '');
                                       const bIsAway = b.team.toLowerCase().includes(awayComp?.team.abbreviation.toLowerCase() || '') || 
                                                       b.team.toLowerCase().includes(awayComp?.team.displayName.toLowerCase() || '');
                                       if (aIsAway && !bIsAway) return -1;
                                       if (!aIsAway && bIsAway) return 1;
                                       return 0;
                                   }).map((pick, pickIdx) => {
                                     const teamLogo = getLogoByTeamString(pick.team);
                                     return (
                                       <div key={pickIdx} className="flex flex-col h-full border-b md:border-b-0 border-gray-100 last:border-0 pb-4 md:pb-0">
                                          <div className="flex justify-between items-start mb-3">
                                             <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-100 overflow-hidden shadow-sm p-1">
                                                   {teamLogo ? (
                                                      <img src={teamLogo} alt={pick.team} className="w-full h-full object-contain" />
                                                   ) : (
                                                      <User size={20} className="text-gray-400" />
                                                   )}
                                                </div>
                                                <div className="min-w-0">
                                                   <div className="text-sm font-black text-gray-900 leading-tight truncate">{pick.playerName}</div>
                                                   <div className="text-[10px] text-gray-400 font-bold truncate uppercase tracking-tight">{pick.team}</div>
                                                </div>
                                             </div>
                                             <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${pick.prediction === 'MORE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {pick.prediction === 'MORE' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                {pick.prediction}
                                             </div>
                                          </div>
                                          <div className="mb-3 text-center bg-gray-50/50 py-2.5 rounded-xl border border-gray-100">
                                             <span className="text-sm font-black text-gray-900">
                                                {category.categoryName.toLowerCase().includes('td') ? '0.5' : pick.line} {getCategoryLabel(category.categoryName)}
                                             </span>
                                          </div>
                                          <div className="bg-gray-50/80 border border-gray-100 rounded-xl p-4 flex-1">
                                             <p className="text-[11.5px] text-gray-600 leading-relaxed italic">
                                                "{pick.description}"
                                             </p>
                                          </div>
                                       </div>
                                     );
                                   })}
                                </div>
                             </div>
                           ))}
                        </div>
                      )}

                      <div className="flex justify-center pt-4 border-t border-gray-100">
                         <button 
                          onClick={() => { setIsKeySubmitted(false); setAiAnalysis(null); setError(null); }}
                          className="text-[10px] text-gray-400 hover:text-red-500 font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                         >
                           <RefreshCcw size={12} />
                           Change API Key
                         </button>
                      </div>
                   </div>
                 )}

                {error && (
                  <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 animate-in fade-in zoom-in-95">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <div>{error}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
