import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPlayerStats, fetchTeamRoster, fetchAllTeams, fetchTeamDetails, fetchTeamSchedule, fetchGameSummary, fetchPlayerGameLog, isGameCompleted } from '../services/espnService';
import { scoutPlayer } from '../services/geminiService';
import { PlayerStats, RosterAthlete, NflTeam, GameLog } from '../types';
import StatTable from './StatTable';
import { ArrowLeft, FileText, Swords, AlertCircle, Loader2, Shield, TrendingUp } from 'lucide-react';
import { useDefensiveStats } from '../contexts/DefensiveStatsContext';

interface ProcessedGame {
    eventId: string;
    date: string;
    opponent: {
        abbreviation: string;
        displayName: string;
        logo?: string;
    } | null;
    isHome: boolean;
    passYds: string;
    rushYds: string;
    recYds: string;
    receptions: string;
    totalTd: number;
}

interface OpponentGame {
    eventId: string;
    date: string;
    opponent: {
        abbreviation: string;
        displayName: string;
        logo?: string;
    } | null;
    isHome: boolean;
    passAllowed: number;
    rushAllowed: number;
    totalAllowed: number;
}

const PlayerScreen: React.FC = () => {
  const { playerId, teamAbbr } = useParams<{ playerId: string; teamAbbr: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [rosterData, setRosterData] = useState<RosterAthlete | null>(null);
  const [detailedGames, setDetailedGames] = useState<ProcessedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllGames, setShowAllGames] = useState(false);
  const [showAllOpponentGames, setShowAllOpponentGames] = useState(false);
  
  // Fallback position if roster data is missing
  const [fallbackPosition, setFallbackPosition] = useState<string>('');

  // Scouting State
  const [scoutReport, setScoutReport] = useState<string | null>(null);
  const [scouting, setScouting] = useState(false);
  const [allTeams, setAllTeams] = useState<NflTeam[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<string>('');
  const [matchupHistory, setMatchupHistory] = useState<any[] | null>(null);

  // Prediction Inputs State
  const [statInput1, setStatInput1] = useState('');
  const [statInput2, setStatInput2] = useState('');
  const [statInputTD, setStatInputTD] = useState('');

  // Global Context for Defensive Stats
  const { stats: leagueDefensiveStats, loading: leagueStatsLoading, season: currentSeason } = useDefensiveStats();

  // Opponent Analysis State (Local Game Log)
  const [opponentGames, setOpponentGames] = useState<OpponentGame[]>([]);
  const [opponentLoading, setOpponentLoading] = useState(false);
  const [opponentInfo, setOpponentInfo] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
        if (!playerId) return;
        setLoading(true);
        try {
            const [statsData, rosterList, teamsList, gameLogData] = await Promise.all([
                fetchPlayerStats(playerId),
                teamAbbr ? fetchTeamRoster(teamAbbr) : Promise.resolve([]),
                fetchAllTeams(),
                fetchPlayerGameLog(playerId, currentSeason)
            ]);
            
            setStats(statsData);
            setAllTeams(teamsList);
            
            if (rosterList.length > 0) {
                const found = rosterList.find(p => String(p.id) === String(playerId));
                if (found) setRosterData(found);
            }

            // Fetch Detailed Game Summaries
            if (gameLogData && gameLogData.seasonTypes) {
                const eventsToFetch: { id: string; date: string | null }[] = [];
                const seenIds = new Set<string>();
                const rootEvents = gameLogData.events || {};

                gameLogData.seasonTypes.forEach(st => {
                    st.categories?.forEach(cat => {
                        cat.events?.forEach(evt => {
                            const rawId = evt.eventId || evt.id;
                            if (rawId) {
                                const eid = String(rawId);
                                if (!seenIds.has(eid)) {
                                    seenIds.add(eid);
                                    const e = evt as any;
                                    const logDate = rootEvents[eid]?.gameDate || e.gameDate || e.date || e.game_date || null;
                                    eventsToFetch.push({ id: eid, date: logDate });
                                }
                            }
                        });
                    });
                });

                if (eventsToFetch.length > 0) {
                    const summaries = await Promise.all(
                        eventsToFetch.map(evt => fetchGameSummary(evt.id).catch(e => null))
                    );

                    let detectedPos = '';

                    const processed = summaries.map((summary, index) => {
                        if (!summary || !summary.header || !summary.boxscore) return null;

                        let playerTeamId = null;
                        let pass = '-';
                        let rush = '-';
                        let rec = '-';
                        let receptions = '-';
                        
                        let passTd = 0;
                        let rushTd = 0;
                        let recTd = 0;

                        if (summary.boxscore.players) {
                            for (const section of summary.boxscore.players) {
                                for (const category of section.statistics) {
                                    const athlete = category.athletes.find(a => String(a.athlete.id) === String(playerId));
                                    if (athlete) {
                                        playerTeamId = section.team.id;
                                        
                                        // Attempt to detect position from game log if available
                                        if (athlete.athlete.position?.abbreviation) {
                                            detectedPos = athlete.athlete.position.abbreviation;
                                        }

                                        const labels = category.labels.map(l => l.toLowerCase());
                                        const ydsIdx = labels.findIndex(l => l === 'yds' || l === 'yards');
                                        const recIdx = labels.findIndex(l => l === 'rec');
                                        const tdIdx = labels.findIndex(l => l === 'td' || l === 'tds' || l === 'touchdowns');
                                        
                                        const catName = category.name.toLowerCase();

                                        if (ydsIdx !== -1) {
                                            const val = athlete.stats[ydsIdx];
                                            if (catName === 'passing') pass = val;
                                            else if (catName === 'rushing') rush = val;
                                            else if (catName === 'receiving') {
                                                rec = val;
                                                if (recIdx !== -1) {
                                                    receptions = athlete.stats[recIdx];
                                                }
                                            }
                                        }

                                        if (tdIdx !== -1) {
                                            const val = parseInt(athlete.stats[tdIdx]) || 0;
                                            if (catName === 'passing') passTd = val;
                                            else if (catName === 'rushing') rushTd = val;
                                            else if (catName === 'receiving') recTd = val;
                                        }
                                    }
                                }
                            }
                        }

                        if (!playerTeamId) return null;

                        const comp = summary.header.competitions[0];
                        const oppComp = comp.competitors.find(c => c.team.id !== playerTeamId);
                        const playerComp = comp.competitors.find(c => c.team.id === playerTeamId);
                        
                        const logDate = eventsToFetch[index].date;
                        const displayDate = logDate || summary.header.date;

                        return {
                            eventId: summary.header.id,
                            date: displayDate,
                            opponent: oppComp ? oppComp.team : null,
                            isHome: playerComp?.homeAway === 'home',
                            passYds: pass,
                            rushYds: rush,
                            recYds: rec,
                            receptions,
                            totalTd: passTd + rushTd + recTd
                        };
                    }).filter((g): g is ProcessedGame => g !== null);

                    if (detectedPos) setFallbackPosition(detectedPos);

                    // Sort descending (newest first)
                    processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setDetailedGames(processed);
                }
            }

        } catch (e) {
            console.error("Error loading player data:", e);
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, [playerId, teamAbbr]);

  // Opponent Analysis Logic (Fetching Game Log for visual reference)
  useEffect(() => {
    if (!selectedOpponent) {
        setOpponentGames([]);
        setOpponentInfo(null);
        return;
    }

    const fetchOpponentLog = async () => {
        setOpponentGames([]); // Clear previous opponent data immediately to avoid stale state
        setOpponentLoading(true);
        try {
            const team = allTeams.find(t => String(t.id) === String(selectedOpponent));
            if (!team) {
                setOpponentLoading(false);
                return;
            }

            const details = await fetchTeamDetails(selectedOpponent);
            setOpponentInfo(details);

            // Fetch schedule for current season
            const schedule = await fetchTeamSchedule(team.abbreviation, currentSeason);
            const completedGames = schedule.filter(isGameCompleted);
            
            // Fetch Game Summaries for the selected opponent (Game Log)
            const summaries = await Promise.all(
                completedGames.map(g => fetchGameSummary(g.id).catch(e => {
                    return null;
                }))
            );

            const processedOps = summaries.map((summary, index) => {
                 const scheduleItem = completedGames[index];
                 
                 if (!summary || !summary.header || !summary.boxscore) return null;
                 
                 const gameComp = summary.header.competitions?.[0];
                 if (!gameComp) return null;
                 
                 const teamComp = gameComp.competitors.find(c => String(c.team.id) === String(selectedOpponent));
                 const oppComp = gameComp.competitors.find(c => String(c.team.id) !== String(selectedOpponent));
                 
                 if (!teamComp || !oppComp) return null;

                 const opponentOfSelectedId = oppComp.team.id;
                 const statsSection = summary.boxscore.teams.find(t => String(t.team.id) === String(opponentOfSelectedId));
                 
                 let pass = 0, rush = 0, total = 0;
                 if (statsSection) {
                     const getStat = (names: string[]) => {
                         const s = statsSection.statistics.find(item => names.includes(item.name));
                         if (!s || !s.displayValue) return 0;
                         return parseFloat(s.displayValue.replace(/,/g, ''));
                     };
                     
                     pass = getStat(['netPassingYards', 'passingYards']);
                     rush = getStat(['rushingYards']);
                     total = getStat(['totalYards', 'netTotalYards']);
                 }

                 const validDate = (summary.header.date && summary.header.date !== "Invalid Date") 
                                    ? summary.header.date 
                                    : scheduleItem.date;

                 return {
                     eventId: summary.header.id,
                     date: validDate,
                     opponent: oppComp.team,
                     isHome: teamComp.homeAway === 'home',
                     passAllowed: pass,
                     rushAllowed: rush,
                     totalAllowed: total
                 };
            }).filter((g): g is OpponentGame => g !== null);

            processedOps.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setOpponentGames(processedOps);

        } catch (error) {
            console.error("Error fetching opponent stats:", error);
        } finally {
            setOpponentLoading(false);
        }
    };

    fetchOpponentLog();
  }, [selectedOpponent, allTeams, currentSeason]);


  // Determine Inputs for Prop Analysis
  const posAbbr = rosterData?.position?.abbreviation || fallbackPosition || '';
  const isReceiver = ['WR', 'TE'].includes(posAbbr);
  
  // Calculate totals for Game Log columns visibility and Prop Input logic
  const totalPassYds = detailedGames.reduce((acc, game) => acc + (parseFloat(game.passYds.replace(/,/g, '')) || 0), 0);
  const totalRushYds = detailedGames.reduce((acc, game) => acc + (parseFloat(game.rushYds.replace(/,/g, '')) || 0), 0);
  const totalRecYds = detailedGames.reduce((acc, game) => acc + (parseFloat(game.recYds.replace(/,/g, '')) || 0), 0);

  let inputLabels = { label1: '', label2: '' };

  if (posAbbr === 'QB') {
      inputLabels = { label1: 'Passing Yds', label2: 'Rushing Yds' };
  } else if (['RB', 'FB'].includes(posAbbr)) {
      // Only show Receiving Yds if player has receiving stats
      inputLabels = { 
          label1: 'Rushing Yds', 
          label2: totalRecYds > 0 ? 'Receiving Yds' : '' 
      };
  } else if (isReceiver) {
      inputLabels = { label1: 'Receptions', label2: 'Receiving Yds' };
  } else if (totalPassYds > 200 && !posAbbr) {
      // Fallback for QBs where position is unknown
      inputLabels = { label1: 'Passing Yds', label2: 'Rushing Yds' };
  } else if (totalRushYds > 200 && !posAbbr) {
      // Fallback for RBs where position is unknown
      inputLabels = { label1: 'Rushing Yds', label2: 'Receiving Yds' };
  } else if (totalRecYds > 200 && !posAbbr) {
      // Fallback for WRs/TEs where position is unknown
      inputLabels = { label1: 'Receptions', label2: 'Receiving Yds' };
  }

  const showPropInputs = !!inputLabels.label1;

  // --- Helper Functions for UI Stats (Moved up for Scout usage) ---

  const getStatValue = (labels: string[], values: any[], key: string) => {
    if (!labels || !values || labels.length === 0 || values.length === 0) return '-';
    if (!key) return '-';
    const searchKey = String(key).toLowerCase();
    
    let idx = labels.findIndex(l => String(l).toLowerCase() === searchKey);
    if (idx === -1) {
        if (searchKey === 'yds') idx = labels.findIndex(l => ['yds', 'yards', 'yd'].includes(String(l).toLowerCase()));
        else if (searchKey === 'td') idx = labels.findIndex(l => ['td', 'tds'].includes(String(l).toLowerCase()));
        else if (searchKey === 'rec') idx = labels.findIndex(l => ['rec'].includes(String(l).toLowerCase()));
    }
    
    if (idx === -1) return '-';
    return values[idx] !== undefined && values[idx] !== null ? String(values[idx]) : '-';
  };

  const getSeasonStats = (categoryName: string) => {
    if (!stats || !stats.categories) return null;
    const cat = stats.categories.find(c => c.name === categoryName);
    if (!cat || !cat.statistics || cat.statistics.length === 0) return null;
    const sortedStats = [...cat.statistics].sort((a, b) => b.season.year - a.season.year);
    const currentSeason = sortedStats[0];
    if (!currentSeason || !currentSeason.stats) return null;
    return { labels: cat.labels || [], values: currentSeason.stats };
  };

  const isZeroStat = (labels: string[], values: string[], key: string) => {
    const val = getStatValue(labels, values, key);
    if (val === '-' || !val) return true;
    const num = parseFloat(val.replace(/,/g, ''));
    return isNaN(num) || num === 0;
  };

  const calcAvg = (statsObj: { labels: string[], values: string[] } | null, statKey: string) => {
      if (!statsObj) return null;
      const valStr = getStatValue(statsObj.labels, statsObj.values, statKey);
      if (!valStr || valStr === '-') return null;
      
      const val = parseFloat(valStr.replace(/,/g, ''));
      if (isNaN(val)) return null;

      let gp = 0;
      let gIdx = statsObj.labels.findIndex(l => String(l) === 'GP' || String(l) === 'G');
      
      if (gIdx !== -1) {
          gp = parseFloat(statsObj.values[gIdx]);
      }
      
      // Fallback to General stats for GP if not in specific category
      if ((!gp || gp === 0) && stats && stats.categories) {
          const general = stats.categories.find(c => c.name === 'general');
          if (general) {
               const sorted = [...general.statistics].sort((a, b) => b.season.year - a.season.year);
               const current = sorted[0];
               if (current) {
                   const idx = general.labels.findIndex(l => l === 'GP');
                   if (idx !== -1) gp = parseFloat(current.stats[idx]);
               }
          }
      }

      if (!gp || gp === 0) return null;
      return (val / gp).toFixed(1);
  };

  const calcLast5Avg = (statKey: string) => {
      const last5 = detailedGames.slice(0, 5);
      if (last5.length === 0) return '-';
      
      let total = 0;
      let count = 0;

      last5.forEach(g => {
          let valStr = '0';
          if (statKey === 'passing') valStr = g.passYds;
          else if (statKey === 'rushing') valStr = g.rushYds;
          else if (statKey === 'receiving') valStr = g.recYds;
          else if (statKey === 'receptions') valStr = g.receptions;
          else if (statKey === 'totalTd') valStr = String(g.totalTd);

          if (valStr && valStr !== '-') {
              const val = parseFloat(valStr.replace(/,/g, ''));
              if (!isNaN(val)) {
                  total += val;
                  count++;
              }
          }
      });
      
      if (count === 0) return '-';
      return (total / count).toFixed(1);
  };
  
  const formatHeight = (h: string) => {
    if (!h) return '';
    // check if it is just numbers (inches)
    if (/^\d+$/.test(h)) {
        const totalInches = parseInt(h, 10);
        const ft = Math.floor(totalInches / 12);
        const inch = totalInches % 12;
        return `${ft}' ${inch}"`;
    }
    return h;
  };

  const passingStats = getSeasonStats('passing');
  const rushingStats = getSeasonStats('rushing');
  const receivingStats = getSeasonStats('receiving');

  const showPassing = passingStats && !isZeroStat(passingStats.labels, passingStats.values, 'Yds');
  const showRushing = rushingStats && !isZeroStat(rushingStats.labels, rushingStats.values, 'Yds');
  const showReceiving = receivingStats && !isZeroStat(receivingStats.labels, receivingStats.values, 'Yds');
  
  // Calculate derived stats for the header
  const seasonTotalTDs = detailedGames.reduce((acc, game) => acc + game.totalTd, 0);
  const seasonAvgTDs = detailedGames.length > 0 ? (seasonTotalTDs / detailedGames.length).toFixed(1) : '0.0';
  const last5AvgTDs = calcLast5Avg('totalTd');

  // --- Scout Handler ---

  const handleScout = async () => {
    if (!stats || !teamAbbr) return; // Removed rosterData check
    setScouting(true);
    setScoutReport(null);
    setMatchupHistory(null);

    let opponentContext: any = { opponent: undefined, opponentInfo: null, matchupHistory: [] };

    // Add User Predictions to Context if available
    if (showPropInputs && (statInput1 || (statInput2 && inputLabels.label2) || statInputTD)) {
        opponentContext.userPredictions = {};
        if (statInput1) opponentContext.userPredictions[inputLabels.label1] = statInput1;
        if (statInput2 && inputLabels.label2) opponentContext.userPredictions[inputLabels.label2] = statInput2;
        if (statInputTD) opponentContext.userPredictions['Anytime TD'] = statInputTD;
    }

    // Add Season Averages to Context
    const currentSeasonAverages = {
        passing: calcAvg(passingStats, 'Yds'),
        rushing: calcAvg(rushingStats, 'Yds'),
        receiving: calcAvg(receivingStats, 'Yds'),
        receptions: calcAvg(receivingStats, 'Rec'),
        totalTd: seasonAvgTDs
    };
    opponentContext.seasonAverages = currentSeasonAverages;
    
    // Process Last 5 Games for AI Context
    // detailedGames is already sorted descending (newest first)
    const last5 = detailedGames.slice(0, 5).map(g => ({
        date: g.date,
        opponent: g.opponent?.abbreviation || 'N/A',
        passYds: g.passYds,
        rushYds: g.rushYds,
        recYds: g.recYds,
        receptions: g.receptions,
        totalTd: g.totalTd
    }));
    opponentContext.last5Games = last5;

    if (selectedOpponent) {
        const opponentTeam = allTeams.find(t => String(t.id) === String(selectedOpponent));
        opponentContext.opponent = opponentTeam?.displayName;
        
        // Pass Opponent Defense Data for AI
        if (opponentDefensiveStats) {
            opponentContext.opponentSeasonStats = opponentDefensiveStats;
        }
        if (opponentGames && opponentGames.length > 0) {
            opponentContext.opponentLast5Games = opponentGames.slice(0, 5);
        }

        try {
            const teamDetails = await fetchTeamDetails(selectedOpponent);
            opponentContext.opponentInfo = teamDetails;

            const latestStatsYear = stats.categories
                .flatMap(c => c.statistics)
                .map(s => s.season.year)
                .reduce((max, current) => Math.max(max, current), 0);
            
            const yearsToCheck = new Set<number>();
            const currentYear = new Date().getFullYear();
            
            yearsToCheck.add(currentYear);
            yearsToCheck.add(currentYear - 1); 
            yearsToCheck.add(currentYear - 2); 
            
            if (latestStatsYear > 0) {
                yearsToCheck.add(latestStatsYear);     
            }

            const schedules = await Promise.all(
                Array.from(yearsToCheck).map(y => fetchTeamSchedule(teamAbbr, y))
            );

            const allGames = schedules.flat();
            const uniqueGamesMap = new Map();
            allGames.forEach(g => uniqueGamesMap.set(g.id, g));
            const uniqueSchedule = Array.from(uniqueGamesMap.values());
            
            const relevantGames = uniqueSchedule.filter((event: any) => {
                const competition = event.competitions?.[0];
                if (!competition) return false;
                const opponentComp = competition.competitors.find((c: any) => String(c.team.id) === String(selectedOpponent));
                return !!opponentComp; 
            });

            const historyPromises = relevantGames.map(async (game: any) => {
                try {
                    const summary = await fetchGameSummary(game.id);
                    const competition = summary.header.competitions?.[0];
                    if (!competition) return null;

                    const opponentComp = competition.competitors.find((c: any) => String(c.team.id) === String(selectedOpponent));
                    const playerComp = competition.competitors.find((c: any) => String(c.team.id) !== String(selectedOpponent));

                    let playerGameStats: any[] = [];
                    if (summary.boxscore?.players) {
                        summary.boxscore.players.forEach((teamSection) => {
                            teamSection.statistics.forEach((category) => {
                                const athleteEntry = category.athletes.find((a) => String(a.athlete.id) === String(playerId));
                                if (athleteEntry) {
                                    playerGameStats.push({
                                        name: category.name,
                                        labels: category.labels,
                                        stats: athleteEntry.stats
                                    });
                                }
                            });
                        });
                    }
                    if (playerGameStats.length === 0) return null;

                    return {
                        eventId: game.id,
                        date: game.date,
                        result: playerComp?.winner ? 'W' : (parseInt(playerComp?.score || '0') > parseInt(opponentComp?.score || '0') ? 'W' : 'L'),
                        score: `${playerComp?.score}-${opponentComp?.score}`,
                        opponentName: opponentComp?.team.displayName,
                        opponentAbbr: opponentComp?.team.abbreviation,
                        stats: playerGameStats.reduce((acc: any, item: any) => {
                            if (item.name) acc[String(item.name).toLowerCase()] = item;
                            return acc;
                        }, {})
                    };

                } catch (err) {
                    console.error("Failed to load game details for scout", err);
                    return null;
                }
            });

            const detailedHistory = await Promise.all(historyPromises);
            const validHistory = detailedHistory.filter(Boolean);
            
            setMatchupHistory(validHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            opponentContext.matchupHistory = validHistory;

        } catch (err) {
            console.error("Error fetching detailed scouting data", err);
        }
    }

    const result = await scoutPlayer(stats, rosterData?.displayName || stats.displayName, rosterData?.position?.name || posAbbr || 'Player', opponentContext);
    setScoutReport(result);
    setScouting(false);
  };

  // --- Render ---

  if (loading) return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-3">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <div className="text-sm font-medium">Loading player profile & game logs...</div>
      </div>
  );
  
  if (!stats) return <div className="p-8 text-center">Player stats not available.</div>;

  const displayName = rosterData?.displayName || stats.displayName;
  const jersey = rosterData?.jersey || '#';
  const position = rosterData?.position?.name || posAbbr || 'Player';
  const height = formatHeight(rosterData?.height || '');
  const weight = rosterData?.weight || '';
  const teamLogoUrl = teamAbbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${teamAbbr}.png` : null;
  const availableOpponents = allTeams.filter(t => t.abbreviation !== teamAbbr).sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  const selectedTeamData = allTeams.find(t => String(t.id) === String(selectedOpponent));
  const opponentName = selectedTeamData ? selectedTeamData.displayName : 'Opponent';

  // Retrieve pre-calculated stats for the selected opponent
  const opponentDefensiveStats = selectedOpponent ? leagueDefensiveStats[selectedOpponent] : null;

  const showGameLogPass = totalPassYds !== 0 && !isReceiver;
  const showGameLogRush = totalRushYds !== 0;
  const showGameLogRec = totalRecYds !== 0 && posAbbr !== 'QB';
  
  // Determine colSpan for "No games found" message
  const emptyColSpan = 3 + (showGameLogPass ? 1 : 0) + (showGameLogRush ? 1 : 0) + (showGameLogRec ? 1 : 0);

  // Position-based Stats Ordering
  
  const displayStats = [];
  
  if (posAbbr === 'QB') {
      if (showPassing) displayStats.push({ key: 'passing', data: passingStats, statKey: 'Yds', label: 'PASS YDS', suffix: 'YPG' });
      if (showRushing) displayStats.push({ key: 'rushing', data: rushingStats, statKey: 'Yds', label: 'RUSH YDS', suffix: 'YPG' });
  } else if (isReceiver) {
      if (showReceiving) displayStats.push({ key: 'receptions', data: receivingStats, statKey: 'Rec', label: 'REC', suffix: 'RPG' });
      if (showReceiving) displayStats.push({ key: 'receiving', data: receivingStats, statKey: 'Yds', label: 'REC YDS', suffix: 'YPG' });
  } else {
      // RB and others
      if (showRushing) displayStats.push({ key: 'rushing', data: rushingStats, statKey: 'Yds', label: 'RUSH YDS', suffix: 'YPG' });
      if (showReceiving) displayStats.push({ key: 'receiving', data: receivingStats, statKey: 'Yds', label: 'REC YDS', suffix: 'YPG' });
  }
  
  const gamesToDisplay = showAllGames ? detailedGames : detailedGames.slice(0, 5);
  const opponentGamesToDisplay = showAllOpponentGames ? opponentGames : opponentGames.slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto bg-gray-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 border-b shadow-sm">
        <div className="flex items-center p-4">
          <button onClick={() => navigate(-1)} className="mr-4 p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Player Profile</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Bio Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 relative overflow-hidden">
            <div className="flex justify-between items-center relative z-10 flex-wrap gap-4 mb-6">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex-shrink-0 flex items-center justify-center border-2 border-white shadow-md text-2xl font-bold text-gray-400 overflow-hidden">
                        {rosterData ? (
                            <img 
                                src={`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${playerId}.png&w=350&h=254`} 
                                alt={displayName} 
                                className="w-full h-full object-cover"
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                        ) : jersey}
                    </div>
                    <div className="text-left">
                        <h2 className="text-2xl font-bold text-gray-900 leading-tight">{displayName}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-600 font-medium">
                            <div className="flex items-center gap-1">
                                {teamLogoUrl && (
                                    <img 
                                        src={teamLogoUrl} 
                                        alt={teamAbbr} 
                                        className="w-5 h-5 object-contain"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
                                )}
                                <span className="text-blue-700 font-bold">{teamAbbr}</span>
                            </div>
                            <span>•</span>
                            <span>#{jersey}</span>
                            <span>•</span>
                            <span>{position}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {height} {weight && `• ${weight} lbs`}
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-6 ml-auto">
                     {displayStats.map(block => (
                         block.data && (
                             <div key={block.key} className="text-right">
                                 <div className="text-2xl font-bold text-gray-900 leading-none">
                                     {getStatValue(block.data.labels, block.data.values, block.statKey)}
                                 </div>
                                 <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{block.label}</div>
                                 <div className="text-[10px] text-gray-400 font-medium">
                                     {calcAvg(block.data, block.statKey)} {block.suffix}
                                 </div>
                                 <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                                     Last 5: {calcLast5Avg(block.key === 'receptions' ? 'receptions' : block.key)} {block.suffix}
                                 </div>
                             </div>
                         )
                     ))}
                     
                     {/* New TDS Block - Added Manually */}
                     <div className="text-right">
                         <div className="text-2xl font-bold text-gray-900 leading-none">
                             {seasonTotalTDs}
                         </div>
                         <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total TDS</div>
                         <div className="text-[10px] text-gray-400 font-medium">
                             {seasonAvgTDs} TD/G
                         </div>
                         <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                             Last 5: {last5AvgTDs} TD/G
                         </div>
                     </div>
                </div>
            </div>

            {/* 2025 Season Games Table (MOVED HERE) */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden relative z-10">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-bold text-gray-900 text-sm">2025 Season Games</h3>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowAllGames(false)} 
                            className={`text-xs font-semibold transition-colors ${!showAllGames ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Last 5
                        </button>
                        <div className="w-px h-3 bg-gray-300"></div>
                        <button 
                            onClick={() => setShowAllGames(true)} 
                            className={`text-xs font-semibold transition-colors ${showAllGames ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            View All
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-14">Date</th>
                                <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Opp</th>
                                {showGameLogPass && <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">Pass Yds</th>}
                                
                                {isReceiver ? (
                                    <>
                                        <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">Rec</th>
                                        <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">Rec Yds</th>
                                    </>
                                ) : (
                                    <>
                                        {showGameLogRush && <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">Rush Yds</th>}
                                        {showGameLogRec && <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">Rec Yds</th>}
                                    </>
                                )}
                                <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-20">TDs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gamesToDisplay.length === 0 ? (
                                <tr>
                                    <td colSpan={Math.max(2, emptyColSpan)} className="p-8 text-center text-gray-500 italic">
                                        <div className="flex flex-col items-center gap-2">
                                            <AlertCircle size={20} className="text-gray-300"/>
                                            <span>No games found for this season.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                gamesToDisplay.map((game, idx) => {
                                    const dateStr = game.date ? new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }) : '-';
                                    const formattedDate = dateStr.replace(/,/, ''); 
                                    const oppAbbr = game.opponent?.abbreviation || 'OPP';
                                    const oppLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${oppAbbr}.png`;
                                    const vsText = game.isHome ? 'vs' : '@';
                                    
                                    return (
                                        <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors h-11" onClick={() => navigate(`/game/${game.eventId}`)}>
                                            <td className="py-2 px-3 text-xs text-gray-600 font-medium whitespace-nowrap cursor-pointer">{formattedDate}</td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-gray-400 font-medium">{vsText}</span>
                                                    <img src={oppLogo} className="w-4 h-4 object-contain" alt="" onError={(e) => (e.currentTarget.style.display='none')}/>
                                                    <span className="text-xs font-bold text-blue-600">{oppAbbr}</span>
                                                </div>
                                            </td>
                                            {showGameLogPass && <td className="py-2 px-2 text-xs text-gray-700 text-right font-medium">{game.passYds}</td>}
                                            
                                            {isReceiver ? (
                                                <>
                                                    <td className="py-2 px-2 text-xs text-gray-700 text-right font-medium">{game.receptions}</td>
                                                    <td className="py-2 px-2 text-xs text-gray-700 text-right font-medium">{game.recYds}</td>
                                                </>
                                            ) : (
                                                <>
                                                    {showGameLogRush && <td className="py-2 px-2 text-xs text-gray-700 text-right font-medium">{game.rushYds}</td>}
                                                    {showGameLogRec && <td className="py-2 px-2 text-xs text-gray-700 text-right font-medium">{game.recYds}</td>}
                                                </>
                                            )}
                                            <td className="py-2 px-2 text-xs text-gray-800 text-right font-bold">{game.totalTd}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* AI Scout Report Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <FileText size={18} className="text-blue-500"/>
                <h3 className="font-bold text-gray-900">Scouting Report</h3>
            </div>
            
            {/* Prop Analysis Inputs */}
            {showPropInputs && (
                <div className="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-800">
                        <TrendingUp size={16} />
                        Player Stat Analysis
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">{inputLabels.label1}</label>
                            <input 
                                type="number" 
                                value={statInput1}
                                onChange={(e) => setStatInput1(e.target.value)}
                                placeholder="0"
                                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        {inputLabels.label2 && (
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">{inputLabels.label2}</label>
                                <input 
                                    type="number" 
                                    value={statInput2}
                                    onChange={(e) => setStatInput2(e.target.value)}
                                    placeholder="0"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        )}
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Anytime TDS</label>
                            <input 
                                type="number" 
                                value={statInputTD}
                                onChange={(e) => setStatInputTD(e.target.value)}
                                placeholder="0.5"
                                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="flex flex-col md:flex-row items-center gap-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="relative w-full md:flex-1">
                    <Swords size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <select 
                        value={selectedOpponent}
                        onChange={(e) => {
                            setSelectedOpponent(e.target.value);
                            setScoutReport(null); 
                            setMatchupHistory(null);
                        }}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors appearance-none cursor-pointer"
                    >
                        <option value="">Select Opponent...</option>
                        {availableOpponents.map(team => (
                            <option key={team.id} value={team.id}>vs {team.displayName}</option>
                        ))}
                    </select>
                </div>
                
                <button 
                    onClick={handleScout} 
                    disabled={scouting || !selectedOpponent || opponentLoading}
                    className="w-full md:w-auto bg-black text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                    {scouting ? 'Analyzing' : opponentLoading ? 'Loading Opponent...' : 'Scout Matchup'}
                </button>
            </div>

            {/* Opponent Defense Stats Section */}
            {selectedOpponent && (
                <div className="mb-6 animate-in fade-in duration-500">
                     <div className="flex items-center gap-2 mb-3 px-1">
                        <Shield size={16} className="text-gray-500"/>
                        <h4 className="font-bold text-gray-800 text-sm">{opponentName} Defense Analysis ({currentSeason})</h4>
                     </div>

                     {opponentLoading || (leagueStatsLoading && !opponentDefensiveStats) ? (
                         <div className="flex justify-center py-8 bg-gray-50 rounded-lg border border-gray-100 flex-col items-center">
                             <Loader2 className="animate-spin text-gray-400 mb-2" size={20} />
                             {leagueStatsLoading && <span className="text-xs text-gray-400">Aggregating league defensive stats...</span>}
                         </div>
                     ) : (
                         <>
                            {/* Stats Summary Cards */}
                            {opponentDefensiveStats ? (
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center flex flex-col items-center justify-center min-h-[90px]">
                                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Pass Allowed</div>
                                        <div className="text-lg font-bold text-gray-800 leading-tight mb-1">{opponentDefensiveStats.avgPassYards} <span className="text-[10px] text-gray-400 font-normal">YPG</span></div>
                                        <div className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full mt-1">Rank #{opponentDefensiveStats.rankPass}</div>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center flex flex-col items-center justify-center min-h-[90px]">
                                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Rush Allowed</div>
                                        <div className="text-lg font-bold text-gray-800 leading-tight mb-1">{opponentDefensiveStats.avgRushYards} <span className="text-[10px] text-gray-400 font-normal">YPG</span></div>
                                        <div className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full mt-1">Rank #{opponentDefensiveStats.rankRush}</div>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center flex flex-col items-center justify-center min-h-[90px]">
                                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Total Allowed</div>
                                        <div className="text-lg font-bold text-gray-800 leading-tight mb-1">{opponentDefensiveStats.avgTotalYards} <span className="text-[10px] text-gray-400 font-normal">YPG</span></div>
                                        <div className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full mt-1">Rank #{opponentDefensiveStats.rankTotal}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 text-center text-gray-400 bg-gray-50 rounded-lg mb-4">
                                    Defensive stats unavailable.
                                </div>
                            )}

                            {/* Defense Game Log Table */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-bold text-gray-900 text-xs">{opponentName} Defensive Game Stats</h3>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => setShowAllOpponentGames(false)} 
                                            className={`text-xs font-semibold transition-colors ${!showAllOpponentGames ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Last 5
                                        </button>
                                        <div className="w-px h-3 bg-gray-300"></div>
                                        <button 
                                            onClick={() => setShowAllOpponentGames(true)} 
                                            className={`text-xs font-semibold transition-colors ${showAllOpponentGames ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            View All
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-200 bg-gray-50">
                                                <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-16">Date</th>
                                                <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">vs Opp</th>
                                                <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Pass Allowed</th>
                                                <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Rush Allowed</th>
                                                <th className="py-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Total Allowed</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {opponentGamesToDisplay.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-6 text-center text-gray-400 text-xs italic">
                                                        No game data available for {currentSeason}.
                                                    </td>
                                                </tr>
                                            ) : (
                                                opponentGamesToDisplay.map((game, idx) => {
                                                    const dateStr = new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                                                    const oppAbbr = game.opponent?.abbreviation || 'OPP';
                                                    const oppLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${oppAbbr}.png`;
                                                    
                                                    return (
                                                        <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors h-10">
                                                            <td className="py-2 px-3 text-xs text-gray-600 font-medium whitespace-nowrap">{dateStr}</td>
                                                            <td className="py-2 px-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <img src={oppLogo} className="w-4 h-4 object-contain" alt="" onError={(e) => (e.currentTarget.style.display='none')}/>
                                                                    <span className="text-xs font-bold text-gray-700">{oppAbbr}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2 text-xs text-gray-600 text-right font-medium">{game.passAllowed}</td>
                                                            <td className="py-2 px-2 text-xs text-gray-600 text-right font-medium">{game.rushAllowed}</td>
                                                            <td className="py-2 px-2 text-xs text-gray-800 text-right font-bold">{game.totalAllowed}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                         </>
                     )}
                </div>
            )}

            {/* AI Output Text */}
            {scoutReport && (
                <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-800 leading-relaxed whitespace-pre-line border border-blue-100 animate-in fade-in duration-500 mb-6">
                    {scoutReport}
                </div>
            )}
        </div>

        {/* Career Stats Tables */}
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Career Statistics</h3>
            {stats.categories.map((category, idx) => (
                <StatTable
                    key={idx}
                    title={category.displayName}
                    columns={[
                        { header: 'Year', accessor: (row) => row.season.displayName, width: 'w-24', align: 'left' },
                        ...category.labels.map((label, i) => ({
                            header: label,
                            accessor: (row: any) => row.stats[i],
                            align: 'center' as const
                        }))
                    ]}
                    data={category.statistics}
                />
            ))}
        </div>
      </div>
    </div>
  );
};

export default PlayerScreen;