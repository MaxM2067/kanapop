
export type KanaMode = 'hiragana' | 'katakana' | 'both';
export type Difficulty = 'slow' | 'normal' | 'fast';

export interface KanaCharacter {
  id: string;
  char: string;
  romaji: string;
  type: 'hiragana' | 'katakana';
  x: number;
  y: number;
  column: number;
  isDead: boolean;
}

export interface GameStats {
  correct: number;
  missed: number;
  byCharacter: Record<string, { correct: number; missed: number; char: string; romaji: string }>;
}

export interface Explosion {
  id: string;
  x: number;
  y: number;
}

export interface Soul {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface GameState {
  score: number;
  isActive: boolean;
  isGameOver: boolean;
  activeKana: KanaCharacter[];
  stackedKana: KanaCharacter[];
  explosions: Explosion[];
  souls: Soul[];
  mode: KanaMode;
  difficulty: Difficulty;
  level: number;
  stats: GameStats;
}
export interface GameHistoryItem {
  id: string;
  date: string;
  score: number;
  accuracy: number;
}
