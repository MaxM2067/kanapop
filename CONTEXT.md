# KANA POP! - Context & Developer Guide

## Project Overview
KANA POP! is an interactive, Tetris-style web game designed to help users master Japanese Kana (Hiragana and Katakana). Players type the Romaji equivalent of falling Kana characters to "pop" them before they stack up to the top of the screen. The application leverages Google's Gemini models for real-time Text-to-Speech (TTS) audio feedback, enhancing the learning experience.

## Tech Stack
- **Framework**: React 19 (via Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (implied by class names like `bg-pink-300`, `text-4xl`, etc. in `App.tsx`)
- **Audio**: Web Speech API (Browser-native TTS)
- **Build Tool**: Vite

## Key Features
1.  **Game Modes**:
    -   **Hiragana**: Practice Hiragana characters only.
    -   **Katakana**: Practice Katakana characters only.
    -   **Both**: Mixed mode.
    -   **Words**: Practice Japanese vocabulary words.
2.  **Difficulty Levels**: Slow, Normal, and Fast (adjusts drop speed).
    -   **Adaptive Pacing**: Speed and spawn rate increase dynamically as your score grows (disabled in Words mode).
3.  **Gameplay Mechanics**:
    -   **Explosive Clearing (Kana Mode)**: Clearing a stacked block also destroys neighbors (Top, Left, Right).
    -   **Chain Clearing (Words Mode)**: Clearing a word explodes ALL matching words (same `wordId`) on screen simultaneously.
    -   **Gravity**: Stacked blocks fall down when space below them is cleared.
    -   **Score Penalty**: Lose 5 points if a block hits the stack/ground.
    -   **Soul Hints**: Missed blocks release a floating "Soul" showing their Romaji reading.
    -   **Pause Mode**: Pause/Resume game with ⏸️ button. Overlay shows Resume and End Game options.
    -   **Game Over**: When the stack reaches the top of the board.
4.  **Visuals & Audio**:
    -   **Kawaii Aesthetic**: Pastel colors, "Sparkle/Flower" explosions, and bouncy animations.
    -   **Audio Feedback**: Browser-native TTS (`speechSynthesis`) pronounces characters on clear.
5.  **Statistics & History**:
    -   **Detailed Stats**: Tracks % Accuracy (Unique Correct / Unique Total) and "Hardest Kana".
    -   **History Panel**: Persistent sidebar (local storage) tracking date, score, and accuracy of past games.
6.  **"Words" Mode**:
    -   **Falling Words**: Words fall as horizontal blocks (grouped by `wordGroupId`).
    -   **Morae-based Progression**: Difficulty scales by number of Morae (e.g., 2 morae -> 3 morae).
    -   **Smart Rotation**: Words are introduced in batches of ~15.
    -   **SRS (Spaced Repetition System)**:
        -   **Confidence Levels**: Confident (⭐ air catch), Hesitant (short floor time), Difficult (long floor time/hints used).
        -   **Progress System**: Confidence determines SRS level progress (0.5 for confident, 0.25 for hesitant, 0 for difficult).
        -   **6 SRS Levels**: With increasing review intervals (0, 1, 3, 7, 14, 30, 60 sessions).
        -   **Mastery**: Reaching SRS level 6 marks word as "Learned".
        -   **Review**: Mastered words are scheduled for review based on SRS intervals.
    -   **Click-to-Hint System**:
        -   **No Auto-Hints**: Words don’t show hints automatically when landing.
        -   **Click/Tap**: Click stacked word blocks to see hint (漢字 + romaji + English). **(Autofocuses input after click)**.
        -   **Bright Popups**: Yellow hints visible for 3 seconds.
        -   **SRS Penalty**: 1-2 hints → hesitant max, 3+ hints → difficult.
    -   **Visual Feedback**:
        -   **Color-coded Blocks**: Stacked blocks fade to gray based on time on floor (~10 blocks for gray).
        -   **Golden Explosions**: ⭐ star explosion when word caught in air (confident).
        -   **Strike System**: Visual "Strike X!" popups for consecutive air catches.
        -   **Score Highlight**: Score glows yellow/gold and scales up on early guesses.
    -   **Enhanced Stats**:
        -   Tracks stats by Word ID (Kanji, Romaji, English).
    -   **Bonuses & Controls**:
        -   **Early Guess Bonus**: x1.5 score multiplier for catching falling words.
        -   **Falling Delay**: 2.5s pause in falling/spawning after correct guess (thinking time).
        -   **Streak System**: Consecutive air catches increase streak; streak adds bonus points (`Streak * 5`). Resets on floor touch.
        -   **Spacebar Pause**: Press Space to Pause/Resume (autofocuses input).
        -   **Freeze Ability**: Active ability (Button ❄️). Costs 150 points. Freezes time for 20 seconds.
        -   **Persistent Mode**: Remembers last played mode (e.g. Words) on reload.
        -   **Learned Words List**: Displays all SRS level 6 words in Game Over screen.

## Project Structure
```
/
├── App.tsx               # Main Game Logic (State, Loop, Rendering, Input Handling)
├── components/
│   ├── StatsModal.tsx    # Post-game statistics display
│   ├── HistoryPanel.tsx  # Sidebar showing past game history
│   └── VirtualKeyboard.tsx # Mobile virtual keyboard
├── constants.ts          # Game constants (Speed, Kana data, Board dimensions)
├── types.ts              # TypeScript interfaces (GameState, KanaCharacter, WordSRS, etc.)
├── srs.ts                # SRS constants (intervals, thresholds, progress values)
├── words.ts              # Vocabulary database (~430 unique words by romaji)
├── vite.config.ts        # Vite configuration
└── package.json          # Dependencies and scripts
```

## Core Logic (`App.tsx`)
-   **Game Loop**: Uses `requestAnimationFrame` for smooth animation updates.
-   **State Management**: React `useState` tracks active falling kana, stacked kana, score, history, pause state, and game status.
-   **Input Handling**: Listens to user typing; matches input against active/stacked kana Romaji.
-   **Gravity System**: Stacked blocks automatically fall when space below is cleared.
-   **Persistence**: Saves game history and SRS data to `localStorage` (auto-migrates from old mastery format).

## Setup & Development
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Locally**:
    ```bash
    npm run dev
    ```
3.  **Deploy**:
    -   Push to GitHub: `git push`
    -   Connect to Vercel for automatic deployments.

## Future Development Notes
-   **Mobile Support**: Optimize controls for touch devices (virtual keyboard or buttons).
-   **Leaderboards**: Global backend-based leaderboards.

## Utility Scripts
-   **reorder_words_v2.py**: A Python script to reorder and format `words.ts`.
    -   Automatically calculates morae count (including small kana handling).
    -   Groups words by mora count.
    -   Preserves comments like `// excluded`.
    -   **Usage**: Run `python3 reorder_words_v2.py` to update `words.ts`.
-   **remove_duplicates.py**: Removes duplicate words by `romaji` value.
    -   Keeps only the first occurrence of each romaji.
    -   **Usage**: Run `python3 remove_duplicates.py` to clean `words.ts`.

