
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
  stackedAt?: number; // Counter value when block landed (for SRS confidence calc)
  hintCount?: number; // Number of times user clicked for hint
}

export type WordMastery = Record<string, number>; // wordId -> count (legacy)

// SRS System Types
export type ConfidenceLevel = 'confident' | 'hesitant' | 'difficult';

export interface WordSRSData {
  level: number;              // 0-6 (SRS level)
  progress: number;           // 0.0 - 1.0 к следующему уровню
  nextReviewSession: number;  // № сессии для следующего показа
  confidentCount: number;     // угадал в воздухе
  hesitantCount: number;      // немного полежало
  difficultCount: number;     // долго лежало
  lastAttemptSession: number; // Для расчёта интервалов
}

export type WordSRS = Record<string, WordSRSData>;

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
  type?: 'normal' | 'confident'; // confident = golden star for air catches
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
  mnemonic?: string; // User-defined mnemonic rule
}

export type MnemonicRecord = Record<string, string>; // wordId -> mnemonic text

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
  frozenUntil?: number; // Timestamp until which physics/spawning is frozen
  streak: number; // Current series of early guesses
  isFreezeAbilityActive?: boolean; // If true, current freeze is from ability (longer, countdown shown)
}
export interface GameHistoryItem {
  id: string;
  date: string;
  score: number;
  accuracy: number;
}
