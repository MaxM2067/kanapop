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
3.  **Gameplay Mechanics**:
    -   Characters fall from the top of the board.
    -   Characters stack upon reaching the bottom or other characters.
    -   Typing the correct Romaji clears the character.
    -   **Game Over**: When the stack reaches the top of the board.
4.  **Audio Feedback**:
    -   Uses the browser's native Web Speech API (`speechSynthesis`) to pronounce Japanese characters.
    -   Automatically selects a Japanese voice (like `ja-JP`) if available on the system.
5.  **Statistics**: Tracks correct/missed answers by character to identify weak points.

## Project Structure
```
/
├── App.tsx             # Main Game Logic (State, Loop, Rendering, Input Handling)
├── components/
│   └── StatsModal.tsx  # Post-game statistics display
├── constants.ts        # Game constants (Speed, Kana data, Board dimensions)
├── types.ts            # TypeScript interfaces (GameState, KanaCharacter, etc.)
├── vite.config.ts      # Vite configuration
└── package.json        # Dependencies and scripts
```

## Core Logic (`App.tsx`)
-   **Game Loop**: Uses `requestAnimationFrame` for smooth animation updates.
-   **State Management**: React `useState` tracks active falling kana, stacked kana, score, and game status.
-   **Input Handling**: Listens to user typing; matches input against active/stacked kana Romaji.
-   **Audio**: Uses `window.speechSynthesis` to speak kana characters.

## Setup & Development
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Locally**:
    ```bash
    npm run dev
    ```

## Future Development Notes
-   **Audio Caching**: Currently, TTS might generate requests frequently. Caching audio blobs for repeated characters could improve performance and reduce API limits.
-   **High Scores**: Persisting high scores to local storage or a backend.
-   **Mobile Support**: Optimize controls for touch devices (virtual keyboard or buttons).
