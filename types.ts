export interface EspnEvent {
  id: string;
  date: string;
  shortName: string;
  status: {
    type: {
      name: string;
      description: string;
      detail: string;
      completed: boolean;
    };
    displayClock: string;
    period: number;
  };
  competitions: {
    id: string;
    status?: {
      type: {
        name: string;
        description: string;
        detail: string;
        completed: boolean;
      };
      displayClock: string;
      period: number;
    };
    venue?: {
      fullName: string;
      address?: {
        city: string;
        state: string;
      };
    };
    competitors: {
      id: string;
      homeAway: string;
      team: {
        id: string;
        abbreviation: string;
        displayName: string;
        logo?: string;
        color?: string;
      };
      score: string;
      winner?: boolean;
      records?: {
        summary: string;
      }[];
    }[];
  }[];
}

export interface GameSummary {
  header: EspnEvent;
  boxscore: {
    teams: {
      team: {
        id: string;
        abbreviation: string;
        displayName: string;
        logo: string;
      };
      statistics: {
        name: string;
        displayValue: string;
        label: string;
      }[];
    }[];
    players: {
      team: {
        id: string;
        abbreviation: string;
        displayName: string;
        logo: string;
      };
      statistics: {
        name: string;
        keys: string[];
        text: string;
        labels: string[];
        descriptions: string[];
        athletes: {
          athlete: {
            id: string;
            displayName: string;
            shortName: string;
            jersey?: string;
            position?: {
              abbreviation: string;
            };
          };
          stats: string[];
        }[];
        totals?: string[];
      }[];
    }[];
  };
}

export interface PlayerStats {
  id: string;
  uid: string;
  guid: string;
  displayName: string;
  experience: {
    years: number;
  };
  categories: {
    name: string;
    displayName: string;
    labels: string[];
    statistics: {
      season: {
        year: number;
        displayName: string;
      };
      stats: string[];
    }[];
  }[];
}

export interface RosterAthlete {
  id: string;
  fullName: string;
  displayName: string;
  jersey: string;
  position: {
    abbreviation: string;
    name: string;
  };
  height: string;
  weight: string;
}

export interface NflTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logo: string;
}

export interface TeamDetail extends NflTeam {
  record?: {
    items?: {
      description?: string;
      type?: string;
      summary?: string;
      stats?: { name: string; value: number }[];
    }[];
  };
  standingSummary?: string;
  nextEvent?: {
    name: string;
    date: string;
  }[];
}

export interface GameLog {
  events?: {
    [key: string]: {
      gameDate?: string;
      gameResult?: string;
      atVs?: string;
      score?: string;
      opponent?: {
        id: string;
        abbreviation: string;
        displayName: string;
      };
    };
  };
  seasonTypes?: {
    id?: string;
    name?: string;
    displayName?: string;
    categories?: {
      name?: string;
      labels?: string[];
      events?: {
        eventId?: string;
        id?: string;
        gameDate?: string;
        date?: string;
        game_date?: string;
        opponent?: {
          id: string;
          abbreviation: string;
          displayName: string;
        };
        gameResult?: string;
        stats?: string[];
      }[];
    }[];
  }[];
}

export enum SeasonType {
  Preseason = 1,
  Regular = 2,
  Postseason = 3,
}