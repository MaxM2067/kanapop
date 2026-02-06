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
2.  **Difficulty Levels**: Slow, Normal, and Fast (adjusts drop speed).
    -   **Adaptive Pacing**: Speed and spawn rate increase dynamically as your score grows.
3.  **Gameplay Mechanics**:
    -   **Explosive Clearing**: Clearing a stacked block also destroys neighbors (Top, Left, Right).
    -   **Score Penalty**: Lose 5 points if a block hits the stack/ground.
    -   **Soul Hints**: Missed blocks release a floating "Soul" showing their Romaji reading.
    -   **Game Over**: When the stack reaches the top of the board.
4.  **Visuals & Audio**:
    -   **Kawaii Aesthetic**: Pastel colors, "Sparkle/Flower" explosions, and bouncy animations.
    -   **Audio Feedback**: Browser-native TTS (`speechSynthesis`) pronounces characters on clear.
5.  **Statistics & History**:
    -   **Detailed Stats**: Tracks % Accuracy (Unique Correct / Unique Total) and "Hardest Kana".
    -   **History Panel**: Persistent sidebar (local storage) tracking date, score, and accuracy of past games.

## Project Structure
```
/
├── App.tsx               # Main Game Logic (State, Loop, Rendering, Input Handling)
├── components/
│   ├── StatsModal.tsx    # Post-game statistics display
│   └── HistoryPanel.tsx  # Sidebar showing past game history
├── constants.ts          # Game constants (Speed, Kana data, Board dimensions)
├── types.ts              # TypeScript interfaces (GameState, KanaCharacter, etc.)
├── vite.config.ts        # Vite configuration
└── package.json          # Dependencies and scripts
```

## Core Logic (`App.tsx`)
-   **Game Loop**: Uses `requestAnimationFrame` for smooth animation updates.
-   **State Management**: React `useState` tracks active falling kana, stacked kana, score, history, and game status.
-   **Input Handling**: Listens to user typing; matches input against active/stacked kana Romaji.
-   **Persistence**: Saves game history to `localStorage`.

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
