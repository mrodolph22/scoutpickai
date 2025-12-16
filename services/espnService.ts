import { EspnEvent, GameSummary, PlayerStats, RosterAthlete, SeasonType, NflTeam, TeamDetail, GameLog } from '../types';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const COMMON_API = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl';

export const isGameCompleted = (game: any): boolean => {
    if (!game) return false;
    
    // 1. Check direct status.type.completed
    if (game.status?.type?.completed === true) return true;
    
    // 2. Check status name/description
    const statusName = game.status?.type?.name;
    const statusDesc = game.status?.type?.description;
    if (statusName === 'STATUS_FINAL' || statusName === 'STATUS_FULL_TIME') return true;
    if (statusDesc === 'Final') return true;

    // 3. Check within competitions array
    if (game.competitions && game.competitions.length > 0) {
        const compStatus = game.competitions[0]?.status;
        if (compStatus?.type?.completed === true) return true;
        if (compStatus?.type?.name === 'STATUS_FINAL') return true;
    }

    return false;
};

export const fetchScoreboard = async (week: number, seasonType: SeasonType): Promise<EspnEvent[]> => {
  try {
    const response = await fetch(`${BASE_URL}/scoreboard?week=${week}&seasontype=${seasonType}`);
    if (!response.ok) throw new Error('Failed to fetch scoreboard');
    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const fetchGameSummary = async (eventId: string): Promise<GameSummary> => {
  try {
    const response = await fetch(`${BASE_URL}/summary?event=${eventId}`);
    if (!response.ok) throw new Error('Failed to fetch game summary');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const fetchTeamRoster = async (teamAbbr: string): Promise<RosterAthlete[]> => {
  try {
    const response = await fetch(`${BASE_URL}/teams/${teamAbbr}/roster`);
    if (!response.ok) throw new Error('Failed to fetch roster');
    const data = await response.json();
    // Flatten the roster groups (Offense, Defense, Special Teams)
    const allAthletes: RosterAthlete[] = [];
    data.athletes?.forEach((group: any) => {
      if (group.items) {
        allAthletes.push(...group.items);
      }
    });
    return allAthletes;
  } catch (error) {
    console.error(error);
    // Return empty if fails, as it's enrichment data
    return [];
  }
};

export const fetchPlayerStats = async (playerId: string): Promise<PlayerStats> => {
  try {
    const response = await fetch(`${COMMON_API}/athletes/${playerId}/stats`);
    if (!response.ok) throw new Error('Failed to fetch player stats');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const fetchAllTeams = async (): Promise<NflTeam[]> => {
  try {
    const response = await fetch(`${BASE_URL}/teams?limit=35`);
    if (!response.ok) throw new Error('Failed to fetch teams');
    const data = await response.json();
    // Extract teams from the nested structure: sports[0].leagues[0].teams
    const teams = data.sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => t.team) || [];
    return teams;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const fetchTeamDetails = async (teamId: string): Promise<TeamDetail | null> => {
  try {
    const response = await fetch(`${BASE_URL}/teams/${teamId}`);
    if (!response.ok) throw new Error('Failed to fetch team details');
    const data = await response.json();
    return data.team;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const fetchPlayerGameLog = async (playerId: string, season?: number): Promise<GameLog | null> => {
  try {
    const seasonParam = season ? `?season=${season}` : '';
    const response = await fetch(`${COMMON_API}/athletes/${playerId}/gamelog${seasonParam}`);
    if (!response.ok) throw new Error('Failed to fetch game log');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const fetchTeamSchedule = async (teamAbbr: string, season?: number): Promise<any[]> => {
  try {
    // If season is provided, append it to query params
    const seasonParam = season ? `?season=${season}` : '';
    const response = await fetch(`${BASE_URL}/teams/${teamAbbr}/schedule${seasonParam}`);
    if (!response.ok) throw new Error('Failed to fetch team schedule');
    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error("Error fetching team schedule:", error);
    return [];
  }
};

export const fetchLeagueDefensiveStats = async (season: number) => {
  try {
    const response = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byteam?region=us&lang=en&contentorigin=espn&isqualified=false&category=general&view=defense&season=${season}&seasontype=2&limit=32&sort=totalYards%3Aasc`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Error fetching league stats:", error);
    return null;
  }
};

export const fetchTeamSpecificStats = async (teamId: string, season: number) => {
  try {
    // Uses Core API V2 to get specific stats with pre-calculated ranks
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/teams/${teamId}/statistics`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Error fetching team specific stats:", error);
    return null;
  }
};

export const fetchLeagueStandings = async (season?: number) => {
    try {
        const seasonParam = season ? `?season=${season}` : '';
        const response = await fetch(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings${seasonParam}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Error fetching standings:", error);
        return null;
    }
};

// --- New Manual Aggregation Logic ---

export interface DefensiveStat {
  teamId: string;
  gamesPlayed: number;
  totalYardsAllowed: number;
  passYardsAllowed: number;
  rushYardsAllowed: number;
  avgTotalYards: number;
  avgPassYards: number;
  avgRushYards: number;
  rankTotal: number;
  rankPass: number;
  rankRush: number;
}

export const aggregateLeagueDefensiveStats = async (season: number): Promise<Record<string, DefensiveStat>> => {
    
    // 1. Fetch All Teams
    const teams = await fetchAllTeams();
    if (teams.length === 0) return {};

    const statsMap: Record<string, { 
        pass: number[], rush: number[], total: number[], games: number 
    }> = {};

    teams.forEach(t => {
        statsMap[t.id] = { pass: [], rush: [], total: [], games: 0 };
    });

    // 2. Fetch All Schedules to find unique completed games
    // We limit concurrency here slightly or just do Promise.all since 32 requests is manageable
    const schedulePromises = teams.map(t => fetchTeamSchedule(t.abbreviation, season).catch(e => []));
    const allSchedules = await Promise.all(schedulePromises);

    const uniqueGameIds = new Set<string>();
    
    allSchedules.flat().forEach((evt: any) => {
        if (isGameCompleted(evt)) {
            uniqueGameIds.add(evt.id);
        }
    });

    // 3. Process Games in Batches to avoid rate limiting or browser stall
    const gameIds = Array.from(uniqueGameIds);
    const BATCH_SIZE = 5; 
    
    for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
        const batch = gameIds.slice(i, i + BATCH_SIZE);
        const summaries = await Promise.all(
            batch.map(id => fetchGameSummary(id).catch(e => null))
        );

        summaries.forEach(summary => {
            if (!summary || !summary.boxscore || !summary.boxscore.teams) return;

            const team1 = summary.boxscore.teams[0];
            const team2 = summary.boxscore.teams[1];

            if (!team1 || !team2) return;

            const extractStats = (teamData: any) => {
                const getVal = (keys: string[]) => {
                     const s = teamData.statistics.find((item: any) => keys.includes(item.name));
                     return s && s.displayValue ? parseFloat(s.displayValue.replace(/,/g, '')) : 0;
                };
                return {
                    pass: getVal(['netPassingYards', 'passingYards']),
                    rush: getVal(['rushingYards']),
                    total: getVal(['totalYards', 'netTotalYards'])
                };
            };

            const t1Stats = extractStats(team1);
            const t2Stats = extractStats(team2);

            // Team 1 Defense allowed Team 2's Stats
            if (statsMap[team1.team.id]) {
                statsMap[team1.team.id].pass.push(t2Stats.pass);
                statsMap[team1.team.id].rush.push(t2Stats.rush);
                statsMap[team1.team.id].total.push(t2Stats.total);
                statsMap[team1.team.id].games++;
            }

            // Team 2 Defense allowed Team 1's Stats
            if (statsMap[team2.team.id]) {
                statsMap[team2.team.id].pass.push(t1Stats.pass);
                statsMap[team2.team.id].rush.push(t1Stats.rush);
                statsMap[team2.team.id].total.push(t1Stats.total);
                statsMap[team2.team.id].games++;
            }
        });
    }

    // 4. Calculate Averages
    const results: DefensiveStat[] = [];
    Object.keys(statsMap).forEach(teamId => {
        const data = statsMap[teamId];
        if (data.games === 0) return;

        const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

        results.push({
            teamId,
            gamesPlayed: data.games,
            totalYardsAllowed: sum(data.total),
            passYardsAllowed: sum(data.pass),
            rushYardsAllowed: sum(data.rush),
            avgTotalYards: Math.round(sum(data.total) / data.games),
            avgPassYards: Math.round(sum(data.pass) / data.games),
            avgRushYards: Math.round(sum(data.rush) / data.games),
            rankTotal: 0,
            rankPass: 0,
            rankRush: 0
        });
    });

    // 5. Sort and Assign Ranks (Lower is better)
    
    // Rank by Total Yards
    results.sort((a, b) => a.avgTotalYards - b.avgTotalYards);
    results.forEach((item, idx) => item.rankTotal = idx + 1);

    // Rank by Pass Yards
    results.sort((a, b) => a.avgPassYards - b.avgPassYards);
    results.forEach((item, idx) => item.rankPass = idx + 1);

    // Rank by Rush Yards
    results.sort((a, b) => a.avgRushYards - b.avgRushYards);
    results.forEach((item, idx) => item.rankRush = idx + 1);

    // Convert to Record for easy lookup
    const finalMap: Record<string, DefensiveStat> = {};
    results.forEach(r => {
        finalMap[r.teamId] = r;
    });

    return finalMap;
};