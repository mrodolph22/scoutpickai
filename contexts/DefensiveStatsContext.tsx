import React, { createContext, useContext, useEffect, useState } from 'react';
import { aggregateLeagueDefensiveStats, DefensiveStat } from '../services/espnService';

interface DefensiveStatsContextType {
    stats: Record<string, DefensiveStat>;
    loading: boolean;
    season: number;
}

const DefensiveStatsContext = createContext<DefensiveStatsContextType>({
    stats: {},
    loading: false,
    season: 2025
});

export const useDefensiveStats = () => useContext(DefensiveStatsContext);

export const DefensiveStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [stats, setStats] = useState<Record<string, DefensiveStat>>({});
    const [loading, setLoading] = useState(true);
    const season = 2025; // Default to current season

    useEffect(() => {
        let mounted = true;
        const loadStats = async () => {
            try {
                const data = await aggregateLeagueDefensiveStats(season);
                if (mounted) {
                    setStats(data);
                    setLoading(false);
                }
            } catch (e) {
                console.error("Failed to aggregate defensive stats", e);
                if (mounted) setLoading(false);
            }
        };
        
        loadStats();
        return () => { mounted = false; };
    }, []);

    return (
        <DefensiveStatsContext.Provider value={{ stats, loading, season }}>
            {children}
        </DefensiveStatsContext.Provider>
    );
};