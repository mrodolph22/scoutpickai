import { GoogleGenAI, Type } from "@google/genai";
import { GameSummary, PlayerStats, TeamDetail } from '../types';

const getAiClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API_KEY is not set in environment variables.");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

export interface PropPick {
    playerName: string;
    team: string;
    line: string;
    prediction: 'MORE' | 'LESS';
    description: string;
}

export interface PropCategoryAnalysis {
    categoryName: string;
    picks: PropPick[];
}

export interface PropAnalysisResponse {
    analysis: PropCategoryAnalysis[];
}

export const analyzeLiveProps = async (propsData: any, homeTeam: string, awayTeam: string): Promise<PropAnalysisResponse | null> => {
    const ai = getAiClient();
    if (!ai) {
        console.error("[AI] Failed to initialize GoogleGenAI client. Check API key.");
        return null;
    }

    // Filter and prepare the props data for the prompt to keep it relevant
    const bookmaker = propsData?.bookmakers?.[0];
    const relevantMarkets = bookmaker?.markets || [];
    
    if (relevantMarkets.length === 0) {
        console.warn("[AI] No market data available in propsData for analysis.");
        return null;
    }

    const payload = JSON.stringify(relevantMarkets);
    console.debug("[AI DEBUG] Sending Market Data to Gemini:", {
        homeTeam,
        awayTeam,
        bookmaker: bookmaker?.title,
        marketCount: relevantMarkets.length,
        payloadSize: payload.length
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `You are an expert NFL analyst and professional betting consultant. 
            Analyze the following live player props data from ${bookmaker?.title || 'the selected bookmaker'} for a game between the ${awayTeam} (Away) and ${homeTeam} (Home).
            
            CRITICAL INSTRUCTIONS:
            1. Report on exactly 10 player stats distributed across 5 categories: Passing Yards, Rushing Yards, Receiving Yards, Receptions, and Anytime TD.
            2. For each category, identify 2 picks: ideally one from the ${homeTeam} and one from the ${awayTeam}.
            3. For Anytime TD picks, use '0.5' as the line value.
            4. Each pick must include: Player Name, Team, betting line, a "MORE" or "LESS" prediction (representing Over/Under), and a concise 1-sentence professional justification.
            5. If a specific team or category is missing data in the provided JSON, make an educated selection based on common knowledge of the star players for those teams, but prioritize using the provided data.
            
            MARKET DATA JSON: ${payload}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        analysis: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    categoryName: { type: Type.STRING },
                                    picks: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                playerName: { type: Type.STRING },
                                                team: { type: Type.STRING },
                                                line: { type: Type.STRING },
                                                prediction: { type: Type.STRING, enum: ['MORE', 'LESS'] },
                                                description: { type: Type.STRING }
                                            },
                                            required: ['playerName', 'team', 'line', 'prediction', 'description']
                                        }
                                    }
                                },
                                required: ['categoryName', 'picks']
                            }
                        }
                    },
                    required: ['analysis']
                }
            }
        });

        const text = response.text;
        console.debug("[AI DEBUG] Raw Response Text Received:", text);

        if (!text) {
            console.error("[AI ERROR] Gemini returned an empty response text.");
            return null;
        }

        const parsed = JSON.parse(text) as PropAnalysisResponse;
        console.debug("[AI DEBUG] Parsed Analysis Successfully:", parsed);
        return parsed;
    } catch (error) {
        console.error("[AI ERROR] Gemini Prop Analysis Failed during execution", error);
        return null;
    }
};

export const analyzeGame = async (summary: GameSummary): Promise<string> => {
    const ai = getAiClient();
    if (!ai) return "API Key missing. Cannot generate analysis.";

    const awayTeam = summary.boxscore.teams[0].team.displayName;
    const homeTeam = summary.boxscore.teams[1].team.displayName;
    
    const context = {
        matchup: `${awayTeam} vs ${homeTeam}`,
        score: `${summary.header.competitions[0].competitors.find(c => c.homeAway === 'away')?.score} - ${summary.header.competitions[0].competitors.find(c => c.homeAway === 'home')?.score}`,
        teamStats: summary.boxscore.teams.map(t => ({
            team: t.team.displayName,
            stats: t.statistics.filter(s => ['firstDowns', 'totalYards', 'turnovers', 'possessionTime'].includes(s.name))
        })),
        keyPlayers: summary.boxscore.players.map(team => ({
            team: team.team.displayName,
            leaders: team.statistics.map(cat => ({
                category: cat.name,
                topPerformer: cat.athletes[0] ? `${cat.athletes[0].athlete.displayName} (${cat.athletes[0].stats.join(', ')})` : 'N/A'
            })).slice(0, 3) 
        }))
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `You are an expert NFL analyst. Analyze this game summary JSON and provide a concise 3-paragraph report. 
            1. Game Flow & Outcome: Who won and why? Key turning points.
            2. Stat Breakdown: Compare total yards, turnovers, and efficiency.
            3. MVP & Key Performances: Highlight the best players.
            
            Data: ${JSON.stringify(context)}`,
        });
        return response.text || "No analysis generated.";
    } catch (error) {
        console.error("Gemini Analysis Failed", error);
        return "Failed to generate analysis. Please try again.";
    }
};

export interface ScoutingContext {
    opponent?: string;
    opponentInfo?: TeamDetail | null;
    matchupHistory?: any[]; 
    userPredictions?: Record<string, string>;
    last5Games?: any[];
    opponentSeasonStats?: any;
    opponentLast5Games?: any[];
    seasonAverages?: {
        passing?: string | null;
        rushing?: string | null;
        receiving?: string | null;
        receptions?: string | null;
        totalTd?: string | null;
    };
}

export const scoutPlayer = async (
    stats: PlayerStats, 
    athleteName: string, 
    position: string, 
    context: ScoutingContext
): Promise<string> => {
    const ai = getAiClient();
    if (!ai) return "API Key missing. Cannot generate report.";

    const recentStats = stats.categories.map(cat => {
        const sortedStats = [...cat.statistics].sort((a, b) => b.season.year - a.season.year);
        return {
            name: cat.displayName,
            data: sortedStats.slice(0, 3)
        };
    });

    let prompt = `You are an expert NFL scout. Provide a general scouting report for ${athleteName} (${position}).
           Based on the recent stats provided below, analyze their performance trend, strengths, and role.
           Keep it professional, concise, and insightful.`;

    if (context.opponent && context.opponentInfo) {
        const record = context.opponentInfo.record?.items?.find(i => i.type === 'total')?.summary || 'N/A';
        const standing = context.opponentInfo.standingSummary || 'N/A';
        
        let historyText = "No specific recent games found in the schedule.";
        let hasHistory = false;

        if (context.matchupHistory && context.matchupHistory.length > 0) {
            hasHistory = true;
            historyText = context.matchupHistory.map((h: any) => {
                const date = new Date(h.date).toLocaleDateString();
                const statsList = Array.isArray(h.stats) ? h.stats : Object.values(h.stats || {});
                const statsBlock = statsList.length > 0 
                    ? statsList.map((cat: any) => {
                         const pairs = cat.labels.map((l: string, i: number) => `${l}: ${cat.stats[i]}`).join(', ');
                         return `[${cat.name.toUpperCase()}: ${pairs}]`;
                      }).join(' ')
                    : 'Stats unavailable';

                return `* DATE: ${date} | OPPONENT: ${h.opponentName || context.opponent} | RESULT: ${h.result} (${h.score}) | STATS: ${statsBlock}`;
            }).join('\n');
        }

        const last5Log = context.last5Games && context.last5Games.length > 0
            ? context.last5Games.map((g: any) => `[${new Date(g.date).toLocaleDateString()}] vs ${g.opponent} - Pass: ${g.passYds}, Rush: ${g.rushYds}, Rec Yds: ${g.recYds}, Recs: ${g.receptions || 'N/A'}, TDs: ${g.totalTd}`).join('\n')
            : "No recent games available.";

        let defenseStatsText = "Defense stats unavailable.";
        if (context.opponentSeasonStats) {
            const d = context.opponentSeasonStats;
            defenseStatsText = `
            - Pass Defense: Rank #${d.rankPass} (${d.avgPassYards} YPG)
            - Rush Defense: Rank #${d.rankRush} (${d.avgRushYards} YPG)
            - Total Defense: Rank #${d.rankTotal} (${d.avgTotalYards} YPG)
            - Games Played: ${d.gamesPlayed}
            `;
        }

        const oppLast5Log = context.opponentLast5Games && context.opponentLast5Games.length > 0
            ? context.opponentLast5Games.map((g: any) => 
                `[${new Date(g.date).toLocaleDateString()}] vs ${g.opponent?.abbreviation || 'OPP'} - Allowed: Pass ${g.passAllowed}, Rush ${g.rushAllowed}, Total ${g.totalAllowed}`
              ).join('\n')
            : "No recent defensive game logs available.";

        prompt = `You are an expert NFL scout. Provide an AI scouting report for ${athleteName} (${position}) specifically preparing for a matchup against the ${context.opponent}.
           
           **Opponent Context:**
           - Team: ${context.opponent}
           - Current Record: ${record}
           - Standing: ${standing}

           **Opponent Defensive Profile (Current Season):**
           ${defenseStatsText}

           **Opponent Defense - Last 5 Games Performance:**
           ${oppLast5Log}

           **Matchup History (Historical Context):**
           The following is the COMPLETE log of games found played by ${athleteName} against ${context.opponent} in recent years.
           ${hasHistory ? "You MUST explicitly reference ALL games listed below in your analysis." : "No specific historical matchups found."}
           --- BEGIN MATCHUP LOG ---
           ${historyText}
           --- END MATCHUP LOG ---

           **Player's Last 5 Games Log (Current Form):**
           Use this data below to calculate the player's CURRENT average.
           --- BEGIN LAST 5 LOG ---
           ${last5Log}
           --- END LAST 5 LOG ---

           ${context.userPredictions ? `
           **COMPARATIVE STAT ANALYSIS (PRIORITY):**
           The user has requested analysis on these specific lines:
           ${Object.entries(context.userPredictions).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
           
           For EACH line above:
           1. Compare the input value against the opponent's defensive rank/stats in that category (Use "Opponent Defensive Profile" and "Last 5 Games Performance").
           2. **Player's Season Average:** Reference the player's 2025 season average:
              ${context.seasonAverages?.passing ? `- Passing: ${context.seasonAverages.passing} YPG` : ''}
              ${context.seasonAverages?.rushing ? `- Rushing: ${context.seasonAverages.rushing} YPG` : ''}
              ${context.seasonAverages?.receiving ? `- Receiving: ${context.seasonAverages.receiving} YPG` : ''}
              ${context.seasonAverages?.receptions ? `- Receptions: ${context.seasonAverages.receptions} per game` : ''}
              ${context.seasonAverages?.totalTd ? `- Total TDs: ${context.seasonAverages.totalTd} per game` : ''}
           3. **Player's Recent Average:** Calculate the player's average for this specific stat based STRICTLY on the "Last 5 Games Log" provided above. **DO NOT** include stats from previous years or games not listed in the "Last 5 Games Log". Show your calculation (e.g. "Avg last 5: X.X").
           4. Explicitly predict: "Prediction: MORE" or "Prediction: LESS".
           ` : ''}

           **Task:**
           Use the provided player stats and the logs above to:
           1. ${context.userPredictions ? "**First, perform the Comparative Stat Analysis requested above.**" : "Analyze the player's current form based on the Last 5 Games."}
           2. **Opponent Analysis:** Discuss how the player matches up against ${context.opponent}'s defense based on the 'Opponent Defensive Profile' and their 'Last 5 Games Performance'. Mention if the defense is trending up or down.
           3. Identify key opportunities or risks.

           Keep it professional, concise (max 400 words), and actionable.`;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `${prompt}
            
            **Recent Season Stats (Sorted Newest to Oldest):** 
            ${JSON.stringify(recentStats)}`,
        });
        return response.text || "No report generated.";
    } catch (error) {
        console.error("Gemini Scout Report Failed", error);
        return "Failed to generate scouting report. Please try again.";
    }
};