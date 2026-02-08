// SRS (Spaced Repetition System) Constants

export const SRS_INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // sessions between reviews
export const SRS_MAX_LEVEL = 6;
export const MASTERY_THRESHOLD = 6; // level to be considered "learned"

// Confidence thresholds (blocks processed after landing)
// Confidence thresholds (blocks processed after landing)
export const CONFIDENCE_THRESHOLD_DIFFICULT = 10; // Increased from 3
export const CONFIDENCE_THRESHOLD_HESITANT = 4;   // Increased from 1

// Progress gains per confidence level
export const PROGRESS_CONFIDENT = 0.5;   // ~2 confident answers to level up
export const PROGRESS_HESITANT = 0.25;   // ~4 hesitant answers to level up
export const PROGRESS_DIFFICULT = 0;     // no progress, but no penalty
