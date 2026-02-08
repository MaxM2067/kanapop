
export type KanaMode = 'hiragana' | 'katakana' | 'both' | 'words';
export type Difficulty = 'slow' | 'normal' | 'fast';

export interface KanaCharacter {
  id: string;
  char: string;
  romaji: string;
  type: 'hiragana' | 'katakana' | 'word';
  x: number;
  y: number;
  column: number;
  isDead: boolean;
  // Word specific properties
  kanji?: string;
  en?: string;
  wordId?: string; // The ID of the word (e.g. 'neko')
  wordGroupId?: string; // Unique ID for this specific instance of the word on board
  wordRomaji?: string; // Full romaji for input matching
  wordIndex?: number; // Index of character in the word (e.g. 0 for ね, 1 for こ)
  wordLength?: number; // Total length of the word (e.g. 2 for ねこ)
}

export type WordMastery = Record<string, number>; // wordId -> count

export interface GameStats {
  correct: number;
  missed: number;
  byCharacter: Record<string, { correct: number; missed: number; char: string; romaji: string }>;
  byWord: Record<string, {
    correct: number;
    missed: number;
    id: string;
    kanji: string;
    romaji: string;
    en: string;
  }>;
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

export interface WordPopup {
  id: string;
  x: number;
  y: number;
  kanji: string;
  en: string;
  romaji: string;
}

export interface GameState {
  score: number;
  isActive: boolean;
  isGameOver: boolean;
  isPaused: boolean;
  activeKana: KanaCharacter[];
  stackedKana: KanaCharacter[];
  explosions: Explosion[];
  souls: Soul[];
  wordPopups: WordPopup[];
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
