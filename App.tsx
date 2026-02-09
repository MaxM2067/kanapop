
import React, { useState, useEffect, useCallback, useRef } from 'react';

import { HIRAGANA, KATAKANA, COLUMNS, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, SPAWN_INTERVAL_BASE, FALL_SPEED_BASE, SPEED_MULTIPLIERS } from './constants';
import { WORDS } from './words';
import { KanaMode, KanaCharacter, GameState, GameStats, Difficulty, GameHistoryItem, WordPopup, WordMastery, WordSRS, WordSRSData, ConfidenceLevel, Explosion, MnemonicRecord } from './types';
import { SRS_INTERVALS, SRS_MAX_LEVEL, MASTERY_THRESHOLD, CONFIDENCE_THRESHOLD_DIFFICULT, CONFIDENCE_THRESHOLD_HESITANT, PROGRESS_CONFIDENT, PROGRESS_HESITANT, PROGRESS_DIFFICULT } from './srs';
import StatsModal from './components/StatsModal';
import HistoryPanel from './components/HistoryPanel';
import MyVocabPanel from './components/MyVocabPanel';
import VirtualKeyboard from './components/VirtualKeyboard';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    isActive: false,
    isGameOver: false,
    isPaused: false,
    activeKana: [],
    stackedKana: [],
    explosions: [],
    souls: [],
    wordPopups: [],
    mode: (localStorage.getItem('kana_pop_mode') as KanaMode) || 'hiragana',
    difficulty: 'slow',
    level: 1, // Represents max morae now
    stats: { correct: 0, missed: 0, byCharacter: {}, byWord: {} },
    frozenUntil: 0,
    streak: 0,
  });

  const [history, setHistory] = useState<GameHistoryItem[]>(() => {
    const saved = localStorage.getItem('kana_pop_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('kana_pop_history', JSON.stringify(history));
  }, [history]);

  // SRS State with migration from old mastery format
  const [wordSRS, setWordSRS] = useState<WordSRS>(() => {
    const saved = localStorage.getItem('kana_pop_srs');
    if (saved) return JSON.parse(saved);

    // Migrate from old mastery format if exists
    const oldMastery = localStorage.getItem('kana_pop_mastery');
    if (oldMastery) {
      const old = JSON.parse(oldMastery) as WordMastery;
      const migrated: WordSRS = {};
      Object.entries(old).forEach(([wordId, count]) => {
        migrated[wordId] = {
          level: Math.min(SRS_MAX_LEVEL, Math.floor(count / 2)),
          progress: 0,
          nextReviewSession: 0,
          confidentCount: count,
          hesitantCount: 0,
          difficultCount: 0,
          lastAttemptSession: 0
        };
      });
      return migrated;
    }
    return {};
  });

  // Session counter for SRS intervals
  const [sessionNumber] = useState(() => {
    const saved = parseInt(localStorage.getItem('kana_pop_session') || '0');
    const newSession = saved + 1;
    localStorage.setItem('kana_pop_session', String(newSession));
    return newSession;
  });

  useEffect(() => {
    localStorage.setItem('kana_pop_srs', JSON.stringify(wordSRS));
  }, [wordSRS]);

  // Persist Game Mode
  useEffect(() => {
    localStorage.setItem('kana_pop_mode', gameState.mode);
  }, [gameState.mode]);

  // Track blocks processed for confidence calculation
  const blocksProcessedRef = useRef<number>(0);

  const [inputValue, setInputValue] = useState('');
  const [showStats, setShowStats] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  const spawnTimerRef = useRef<number>(0);

  // Streak Popup State
  const [streakPopups, setStreakPopups] = useState<{ id: string; text: string; x: number; y: number }[]>([]);

  // Mnemonic State
  const [mnemonics, setMnemonics] = useState<MnemonicRecord>(() => {
    const saved = localStorage.getItem('kana_pop_mnemonics');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('kana_pop_mnemonics', JSON.stringify(mnemonics));
  }, [mnemonics]);

  const [editingWord, setEditingWord] = useState<{ wordId: string; x: number; y: number } | null>(null);
  const [hoveredWordGroupId, setHoveredWordGroupId] = useState<string | null>(null);

  // Mobile & Scaling State
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [extraPadding, setExtraPadding] = useState(0); // Extra vertical padding for mobile
  const [isVocabOpen, setIsVocabOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Base dimensions required for the game board + minimal UI
      // Board Width: ~480px + padding ~40px = 520px
      // Board Height: 600px + Title/Header (~100px) + Footer/Controls (~80px) + Padding (~40px) = ~820px
      const SAFE_WIDTH = BOARD_WIDTH + 40;
      const SAFE_HEIGHT = BOARD_HEIGHT + 220; // Adjusted for comfortable UI space

      // On mobile, account for virtual keyboard (~160px)
      const mobile = width < 768;
      const VIRTUAL_KEYBOARD_HEIGHT = mobile ? 180 : 0;

      // Calculate width scale (allow scaling up on mobile to fill width)
      const widthScale = (width - 16) / SAFE_WIDTH;

      // Calculate height scale (subtract keyboard height on mobile)
      const availableHeight = height - VIRTUAL_KEYBOARD_HEIGHT;
      const heightScale = (availableHeight - 16) / SAFE_HEIGHT;

      // Use the smaller of the two scales to ensure everything fits
      // On mobile: allow scaling up to fill space (max 1.5 to use available area)
      // On desktop: cap at 1.0 for normal appearance
      const maxScale = mobile ? 1.5 : 1.0;
      const newScale = Math.min(widthScale, heightScale, maxScale);

      setIsMobile(mobile);
      setScale(newScale);

      // Calculate extra vertical padding on mobile when width-constrained
      if (mobile && widthScale < heightScale) {
        // How much vertical space is used by scaled content
        const scaledContentHeight = SAFE_HEIGHT * newScale;
        // How much space is left
        const remainingSpace = availableHeight - scaledContentHeight - 32; // 32px for margins
        setExtraPadding(Math.max(0, remainingSpace / 2)); // Distribute evenly
      } else {
        setExtraPadding(0);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Web Speech API for TTS
  const [audioEnabled, setAudioEnabled] = useState(true);

  const speakKana = (kana: string) => {
    if (!audioEnabled) return;
    if (!('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(kana);
    // Relaxed voice matching
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP'));

    if (jaVoice) {
      utterance.voice = jaVoice;
      utterance.lang = jaVoice.lang;
    } else {
      utterance.lang = 'ja-JP';
    }

    utterance.rate = 1.0;

    // Cancel any currently playing speech to avoid overlap/queueing
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // Keyboard Event Listener for Spacebar Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      // Spacebar to toggle pause
      if (e.code === 'Space') {
        // Prevent scrolling
        e.preventDefault();

        setGameState(prev => {
          // Only toggle if game is started and not over
          if (!prev.isActive && !prev.isPaused) return prev; // Do nothing if game hasn't started
          if (prev.isGameOver) return prev;

          const nowPaused = !prev.isPaused;
          // Reset lastTimeRef when resuming to prevent time jump
          if (!nowPaused) {
            lastTimeRef.current = undefined;
            // Also refocus input on resume
            setTimeout(() => inputRef.current?.focus(), 0);
          }
          return { ...prev, isPaused: nowPaused };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Score Highlight State

  // Score Highlight State
  const [scoreHighlight, setScoreHighlight] = useState(false);

  useEffect(() => {
    if (scoreHighlight) {
      const timer = setTimeout(() => setScoreHighlight(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [scoreHighlight]);

  // Pre-load voices (often needed for Chrome/Safari)
  useEffect(() => {
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const startGame = (mode: KanaMode, difficulty: Difficulty) => {
    setGameState({
      score: 0,
      isActive: true,
      isGameOver: false,
      isPaused: false,
      activeKana: [],
      stackedKana: [],
      explosions: [],
      souls: [],
      wordPopups: [],
      mode,
      difficulty,
      level: 1,
      stats: { correct: 0, missed: 0, byCharacter: {}, byWord: {} },
      frozenUntil: 0,
      streak: 0,
      isFreezeAbilityActive: false,
    });
    setInputValue('');
    setShowStats(false);
    lastTimeRef.current = undefined;
    spawnTimerRef.current = 0;

    // Auto-focus input on start
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const saveHistory = useCallback((currentScore: number, currentStats: GameStats) => {
    // Avoid saving 0 score games if desired, but user might want to track failures too. 
    // Let's save if there was at least some interaction or it's a valid game over.

    const uniqueChars = Object.values(currentStats.byCharacter) as Array<{ correct: number; missed: number; char: string; romaji: string }>;
    const uniqueCorrect = uniqueChars.filter(s => s.correct > 0).length;
    const totalUnique = uniqueChars.length;
    const accuracy = totalUnique > 0 ? Math.round((uniqueCorrect / totalUnique) * 100) : 0;

    const newItem: GameHistoryItem = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      score: currentScore,
      accuracy: accuracy
    };

    setHistory(prev => [...prev, newItem]);
  }, []);

  const stopGame = () => {
    if (gameState.isActive) {
      saveHistory(gameState.score, gameState.stats);
    }
    setGameState(prev => ({ ...prev, isActive: false, isPaused: false }));
    setShowStats(true);
  };

  const togglePause = () => {
    if (!gameState.isActive || gameState.isGameOver) return;
    setGameState(prev => {
      const nowPaused = !prev.isPaused;
      // Reset lastTimeRef when resuming to prevent time jump
      if (!nowPaused) {
        lastTimeRef.current = undefined;
        // Also refocus input on resume
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return { ...prev, isPaused: nowPaused };
    });
  };

  const spawnKana = useCallback(() => {
    let list: any[] = [];
    if (gameState.mode === 'words') {
      // 1. Determine Difficulty (Max Morae)
      // Start with score-based base level
      let maxMorae = gameState.score < 500 ? 2 : gameState.score < 1000 ? 3 : 4;

      // Progression Check: If all words of current maxMorae are mastered, unlock next level
      // We check levels 2, 3, 4 sequentially.
      // If we are at level 2, check if all 2-mora words are mastered.
      // If so, bump to 3. Then check 3. etc.
      // Cap at 6 (max available in DB).

      for (let m = 2; m <= 6; m++) {
        if (m < maxMorae) continue; // Already authorized
        const wordsAtLevel = WORDS.filter(w => w.morae === m);
        if (wordsAtLevel.length === 0) continue;

        // Unlock next level if all words at this level are at least "seen" (level > 0)
        // OR if they are mastered. This prevents being stuck if you have seen everything but simple SRS didn't qualify mastery yet.
        const unseeenWords = wordsAtLevel.filter(w => (!wordSRS[w.id] || wordSRS[w.id].level === 0));

        if (unseeenWords.length === 0) {
          // All words seen (or mastered), unlock next level
          maxMorae = Math.max(maxMorae, m + 1);
        } else {
          break; // Still have new words to see at this level
        }
      }

      // Review Mechanism: Dynamic chance based on backlog size
      // Get all words due for review (Mastered + Next Session reached)
      const dueWords = WORDS.filter(w => {
        const data = wordSRS[w.id];
        if (!data) return false;
        return data.level >= MASTERY_THRESHOLD && data.nextReviewSession <= sessionNumber;
      });

      let reviewChance = 0;
      if (dueWords.length > 0) {
        // Base chance 30%, +5% for each extra word due, capped at 50%
        reviewChance = Math.min(0.5, 0.3 + (dueWords.length * 0.05));
      }

      // Roll for review spawn
      const doReview = Math.random() < reviewChance;
      let candidates: typeof WORDS = [];

      if (doReview) {
        candidates = dueWords;
      }

      // If no review or no mastered words due, build Learning Pool
      if (candidates.length === 0) {
        // Candidates: Words with morae <= maxMorae AND Not Mastered
        const eligible = WORDS.filter(w => w.morae <= maxMorae && (wordSRS[w.id]?.level || 0) < MASTERY_THRESHOLD);

        // Smart Rotation:
        // 1. In Progress (level > 0)
        // 2. New (level == 0)
        const inProgress = eligible.filter(w => (wordSRS[w.id]?.level || 0) > 0);
        const fresh = eligible.filter(w => !wordSRS[w.id] || wordSRS[w.id].level === 0);

        // Pool Limit = 15
        // If we have fresh words (e.g. just unlocked level), ensure we mix them in!
        // Don't let inProgress fill the whole pool.
        let poolInProgress = inProgress;
        const MAX_POOL = 15;

        if (fresh.length > 0 && inProgress.length > 10) {
          // Reserve 5 slots for fresh words
          poolInProgress = inProgress.slice(0, 10);
        }

        candidates = [...poolInProgress, ...fresh].slice(0, MAX_POOL);

        // Fallback: If no eligible words (all mastered?), pick any from current maxMorae
        if (candidates.length === 0) {
          candidates = WORDS.filter(w => w.morae <= maxMorae);
        }
      }

      list = candidates;
    } else {
      list = gameState.mode === 'hiragana'
        ? HIRAGANA
        : gameState.mode === 'katakana'
          ? KATAKANA
          : [...HIRAGANA, ...KATAKANA];
    }

    const randomEntry = list[Math.floor(Math.random() * list.length)];
    const column = Math.floor(Math.random() * COLUMNS);

    const isWord = gameState.mode === 'words';
    // Show kanji after level 2 (more familiar with the word)
    const srsLevel = (isWord && randomEntry.id) ? (wordSRS[randomEntry.id]?.level || 0) : 0;
    const showKanji = isWord && srsLevel >= 2 && randomEntry.kanji;

    // Determine text to display
    const textToDisplay = showKanji ? randomEntry.kanji : (isWord ? randomEntry.kana : randomEntry.char);

    // Calculate width in cells
    // For now, assume 1 char = 1 cell.
    // If text is "ねこ", length is 2. "猫", length is 1.
    const chars = textToDisplay.split('');
    const width = chars.length;

    // Find valid column
    // Must be between 0 and COLUMNS - width
    const maxColumn = COLUMNS - width;
    if (maxColumn < 0) return; // Should not happen if words are short enough

    const startColumn = Math.floor(Math.random() * (maxColumn + 1));

    // Check for collision with existing falling blocks in these columns
    // Don't spawn if any block is still in the upper portion of the screen
    const collisionThreshold = CELL_SIZE * 3; // Don't spawn if block is above this Y
    const columnsNeeded = Array.from({ length: width }, (_, i) => startColumn + i);

    const hasCollision = gameState.activeKana.some(k => {
      const blockColumn = Math.floor(k.x / CELL_SIZE);
      return columnsNeeded.includes(blockColumn) && k.y < collisionThreshold;
    });

    if (hasCollision) return; // Skip spawning this tick

    const wordGroupId = Math.random().toString(36).substr(2, 9);
    const startY = -CELL_SIZE;

    const newKanaList: KanaCharacter[] = chars.map((char: string, index: number) => ({
      id: Math.random().toString(36).substr(2, 9),
      char: char,
      romaji: randomEntry.romaji, // All parts share the full word romaji for input matching
      type: isWord ? 'word' : (HIRAGANA.some(h => h.char === randomEntry.char) ? 'hiragana' : 'katakana'),
      x: (startColumn + index) * CELL_SIZE,
      y: startY,
      column: startColumn + index,
      isDead: false,
      kanji: isWord ? randomEntry.kanji : undefined,
      en: isWord ? randomEntry.en : undefined,
      wordId: isWord ? randomEntry.id : undefined,
      wordGroupId: isWord ? wordGroupId : undefined,
      wordRomaji: isWord ? randomEntry.romaji : undefined,
      wordIndex: isWord ? index : undefined,
      wordLength: isWord ? width : undefined,
      pos: isWord ? randomEntry.pos : undefined,
    }));

    setGameState(prev => ({
      ...prev,
      activeKana: [...prev.activeKana, ...newKanaList]
    }));
  }, [gameState.mode, gameState.activeKana, wordSRS, sessionNumber]);

  const update = useCallback((time: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    if (!gameState.isActive || gameState.isGameOver || gameState.isPaused) return;

    // Freeze Check: If currently frozen, skip physics and spawning
    if (gameState.frozenUntil && Date.now() < gameState.frozenUntil) {
      // Just keep requesting frames to keep UI responsive/animated (e.g. explosives)
      requestRef.current = requestAnimationFrame(update);
      return;
    } else if (gameState.isFreezeAbilityActive) {
      // Freeze expired, reset the flag so other pauses can happen cleanly if needed (though not strictly necessary as flag is mainly for UI)
      setGameState(prev => ({ ...prev, isFreezeAbilityActive: false }));
    }

    spawnTimerRef.current += deltaTime;
    // Adaptive Difficulty: Slow down if board is getting full
    const crowdingFactor = Math.max(0, (gameState.activeKana.length + gameState.stackedKana.length) - 5) * 200;
    // Aggressive Spawn Ramp: Spawn faster as score increases
    const currentSpawnInterval = Math.max(600, SPAWN_INTERVAL_BASE + crowdingFactor - (gameState.score * 5));

    if (spawnTimerRef.current > currentSpawnInterval) {
      spawnKana();
      spawnTimerRef.current = 0;
    }

    setGameState(prev => {
      let nextActiveKana: KanaCharacter[] = [];
      let nextStackedKana = [...prev.stackedKana];
      let triggeredGameOver = false;
      let streakReset = false; // Lifted scope

      // Adjusted speed by difficulty multiplier
      const baseSpeed = FALL_SPEED_BASE * SPEED_MULTIPLIERS[prev.difficulty];
      // Score-based speed acceleration (disabled for words mode - already challenging enough)
      const currentSpeed = prev.mode === 'words' ? baseSpeed : baseSpeed + (prev.score / 800);

      let nextSouls = [...prev.souls];

      // Group active kana by wordGroupId (or individual if not part of a group)
      const groups: Record<string, KanaCharacter[]> = {};
      prev.activeKana.forEach(k => {
        const key = k.wordGroupId || k.id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(k);
      });

      Object.values(groups).forEach(group => {
        // Calculate next position for the group
        // If ANY member of the group hits something, the WHOLE group stops.

        let collision = false;
        let freezeYOffset = 0; // Relative to current Y. 

        // Check collisions for all members
        for (const kana of group) {
          const nextY = kana.y + currentSpeed;
          const columnStack = nextStackedKana.filter(s => s.column === kana.column);
          const topOfStack = columnStack.length > 0
            ? Math.min(...columnStack.map(s => s.y))
            : BOARD_HEIGHT;

          if (nextY + CELL_SIZE >= topOfStack) {
            collision = true;
            // We need to stop such that this kana is exactly at topOfStack - CELL_SIZE
            // The freeze position for this kana is topOfStack - CELL_SIZE.
            // But we need to keep relative positions of the group (though currently they are all at same Y).
            // Assuming horizontal group, they share Y.
            // We align the whole group to the highest collision point implies the group stops 
            // as soon as the *lowest* clearance is met. 
            // Actually, if one hits, they all stop at that Y level (aligned).

            // Let's take the Y that causes the collision.
            // If multiple hit, the one that hit "highest" (smallest Y boundary) dictates the stop?
            // No, the one that hits FIRST (highest stack) determines the stop Y.
            // Since they fall together, the one encountering the highest stack will stop the group.

            const targetY = topOfStack - CELL_SIZE;
            // If this is the first collision detected or this collision forces a higher stop (smaller Y)
            // wait, smaller Y means higher on screen.
            // We want to stop at the MINIMUM targetY encountered.
            // Since we haven't tracked minTargetY, let's do it outside loop if complex,
            // but basic logic: collision = true.
            break;
          }
        }

        if (collision) {
          // Re-calculate the exact freeze Y for the group.
          // It must be the minimum (topOfStack - CELL_SIZE) across all columns occupied by the group.
          let minTargetY = BOARD_HEIGHT * 2; // High number

          group.forEach(kana => {
            const columnStack = nextStackedKana.filter(s => s.column === kana.column);
            const topOfStack = columnStack.length > 0
              ? Math.min(...columnStack.map(s => s.y))
              : BOARD_HEIGHT;
            minTargetY = Math.min(minTargetY, topOfStack - CELL_SIZE);
          });

          // Freeze group with stackedAt for SRS confidence tracking
          // STREAK RESET: Block touched the floor/stack

          group.forEach(kana => {
            nextStackedKana.push({ ...kana, y: minTargetY, stackedAt: blocksProcessedRef.current });
            streakReset = true; // Reset streak if any block lands

            // Penalty & Soul (only show auto-hint for kana, not words - words use click-to-hint)
            prev.score = Math.max(0, prev.score - 5);

            // Auto-hint souls for kana only (words use click-to-hint system)
            if (kana.type !== 'word') {
              let soulText = kana.char;
              nextSouls.push({
                id: Math.random().toString(),
                x: kana.x,
                y: minTargetY,
                text: soulText
              });
            }

            if (kana.type === 'word' && kana.wordId) {
              // Update Word Stats (only once per group ideally, but here for every char)
              // Optimization: check if we already processed this wordGroupId in this tick?
              // Actually simplest is just update stat.
              const wWord = WORDS.find(w => w.id === kana.wordId);
              if (wWord) {
                const wordStat = prev.stats.byWord[kana.wordId] || {
                  correct: 0, missed: 0, id: wWord.id, kanji: wWord.kanji, romaji: wWord.romaji, en: wWord.en
                };
                // We only want to increment ONCE per word group.
                // But here we are iterating per character.
                // Hack: Only increment if this is the first char of the word? Or simple check via separate Set.
                // Since we are inside `group.forEach`, we can just do it once outside loop?
                // No, we need access to `prev` state cleanly.
                // Let's rely on wordIndex === 0 to update stats for the whole word.
                if (kana.wordIndex === 0) {
                  wordStat.missed += 1;
                  prev.stats.byWord[kana.wordId] = wordStat;
                }
              }
            } else {
              const charStat = prev.stats.byCharacter[kana.char] || { correct: 0, missed: 0, char: kana.char, romaji: kana.romaji };
              charStat.missed += 1;
              prev.stats.byCharacter[kana.char] = charStat;
            }
          });

          if (minTargetY <= 0) {
            triggeredGameOver = true;
          }
        } else {
          // Move all
          group.forEach(kana => {
            nextActiveKana.push({ ...kana, y: kana.y + currentSpeed });
          });
        }
      });

      // Cleanup souls after they float up (simple time-based approximation by chance or just keep last N)
      // Ideally filtering by time created, but for simplicity we'll just keep the list short or clear in a separate effect if needed.
      // Better: remove souls that exceed a certain age or count to prevent memory leak.
      if (nextSouls.length > 20) nextSouls = nextSouls.slice(nextSouls.length - 20);

      // === GRAVITY for Stacked Blocks ===
      // Apply gravity to stacked blocks that have empty space below them
      // Process column by column, from bottom to top

      // Group stacked kana by wordGroupId for group gravity
      const stackedGroups: Record<string, KanaCharacter[]> = {};
      nextStackedKana.forEach(k => {
        const key = k.wordGroupId || k.id;
        if (!stackedGroups[key]) stackedGroups[key] = [];
        stackedGroups[key].push(k);
      });

      // Calculate target Y for each group (they fall together)
      const updatedStackedKana: KanaCharacter[] = [];
      const processedGroupIds = new Set<string>();

      // Sort groups by Y position (process from bottom to top)
      const sortedGroups = Object.entries(stackedGroups).sort((a, b) => {
        const aMinY = Math.max(...a[1].map(k => k.y));
        const bMinY = Math.max(...b[1].map(k => k.y));
        return bMinY - aMinY; // Bottom first (higher Y first)
      });

      sortedGroups.forEach(([groupId, group]) => {
        if (processedGroupIds.has(groupId)) return;
        processedGroupIds.add(groupId);

        // For each column occupied by this group, find the floor/top of already processed blocks
        let minFallDistance = Infinity;

        group.forEach(kana => {
          // Find blocks already processed in same column (these are "floor" for this block)
          const blocksBelow = updatedStackedKana.filter(s =>
            s.column === kana.column && s.y > kana.y
          );

          // The floor is either BOARD_HEIGHT or the top of existing blocks
          const floorY = blocksBelow.length > 0
            ? Math.min(...blocksBelow.map(s => s.y))
            : BOARD_HEIGHT;

          // How much can this kana fall?
          const targetY = floorY - CELL_SIZE;
          const fallDistance = targetY - kana.y;

          minFallDistance = Math.min(minFallDistance, fallDistance);
        });

        // Apply fall distance to entire group (move by same amount to stay together)
        // Use gravity speed (same as falling speed for smoothness)
        const gravityStep = Math.min(minFallDistance, currentSpeed);

        group.forEach(kana => {
          updatedStackedKana.push({
            ...kana,
            y: kana.y + Math.max(0, gravityStep)
          });
        });
      });

      nextStackedKana = updatedStackedKana;

      return {
        ...prev,
        activeKana: nextActiveKana,
        stackedKana: nextStackedKana,
        souls: nextSouls,
        isGameOver: triggeredGameOver,
        isActive: !triggeredGameOver,
        score: Math.max(0, prev.score), // Ensure non-negative
        streak: streakReset ? 0 : prev.streak, // Reset streak if block landed
      };
    });

    requestRef.current = requestAnimationFrame(update);
  }, [gameState.isActive, gameState.isGameOver, gameState.isPaused, gameState.score, spawnKana]);

  useEffect(() => {
    if (gameState.isGameOver && !showStats) {
      // Game just ended, save stats
      saveHistory(gameState.score, gameState.stats);
      setShowStats(true);
    }
  }, [gameState.isGameOver, showStats, gameState.score, gameState.stats, saveHistory]);

  useEffect(() => {
    if (gameState.isActive && !gameState.isGameOver && !gameState.isPaused) {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState.isActive, gameState.isGameOver, gameState.isPaused, update]);

  // Abstract input processing to reuse for both keyboard and virtual keyboard
  const processInput = useCallback((val: string) => {
    setInputValue(val);

    const allVisible = [...gameState.activeKana, ...gameState.stackedKana];
    // Find generic match (simple char) OR word match
    // STRICT CHECK: Ensure type matches logic.
    let match = allVisible.find(k => k.type !== 'word' && k.romaji === val);

    // If no simple match, check for word match (using wordRomaji)
    // IMPORTANT: Check that val matches the FULL word romaji
    if (!match) {
      match = allVisible.find(k => k.type === 'word' && k.wordRomaji === val);
    }

    if (match) {
      // Check if it's an early guess (active falling items only, not stacked)
      // "Active" means it's in activeKana list. Stacked items are in stackedKana.
      // However, duplicate IDs might exist if we aren't careful, but game logic separates them.
      // A match is found in `allVisible`. We need to verify if this specific match instance is in activeKana.
      const isEarlyGuess = gameState.activeKana.some(k => k.id === match!.id);

      // Logic calculation outside setGameState to keep variables in scope
      let newExplosions = [{ id: Math.random().toString(), x: match.x, y: match.y }];
      let newWordPopups: WordPopup[] = [];

      if (match.type === 'word' && match.kanji && match.en) {
        newWordPopups.push({
          id: Math.random().toString(),
          x: match.x,
          y: match.y,
          kanji: match.kanji,
          en: match.en,
          romaji: match.romaji,
          mnemonic: match.wordId ? mnemonics[match.wordId] : undefined,
          pos: match.pos
        });

        // Update SRS with confidence calculation
        if (match.wordId) {
          const isStacked = gameState.stackedKana.some(k => k.id === match.id);

          // Calculate confidence based on stacked status, blocks processed, AND hint usage
          let confidence: ConfidenceLevel = 'confident';

          // Get hint count from the block (could be from activeKana or stackedKana)
          const hintCount = match.hintCount || 0;

          // Hint usage downgrades confidence: 1-2 hints → hesitant max, 3+ hints → difficult
          if (hintCount >= 3) {
            confidence = 'difficult';
          } else if (hintCount >= 1) {
            confidence = 'hesitant';
          } else if (isStacked) {
            // Original logic for no hints used
            const blocksAfter = blocksProcessedRef.current - (match.stackedAt || 0);
            if (blocksAfter >= CONFIDENCE_THRESHOLD_DIFFICULT) {
              confidence = 'difficult';
            } else if (blocksAfter >= CONFIDENCE_THRESHOLD_HESITANT) {
              confidence = 'hesitant';
            }
          }

          // Increment blocks processed counter
          blocksProcessedRef.current += 1;

          setWordSRS(prev => {
            const current = prev[match.wordId!] || {
              level: 0,
              progress: 0,
              nextReviewSession: 0,
              confidentCount: 0,
              hesitantCount: 0,
              difficultCount: 0,
              lastAttemptSession: sessionNumber
            };

            // Progress increments based on confidence
            const progressGain =
              confidence === 'confident' ? PROGRESS_CONFIDENT :
                confidence === 'hesitant' ? PROGRESS_HESITANT : PROGRESS_DIFFICULT;

            let newProgress = current.progress + progressGain;
            let newLevel = current.level;

            // Level up when progress >= 1.0
            if (newProgress >= 1.0 && newLevel < SRS_MAX_LEVEL) {
              newLevel += 1;
              newProgress = 0;
            }

            // Calculate next review session based on level
            const nextReview = sessionNumber + SRS_INTERVALS[newLevel];

            return {
              ...prev,
              [match.wordId!]: {
                level: newLevel,
                progress: Math.min(1, newProgress),
                nextReviewSession: nextReview,
                confidentCount: current.confidentCount + (confidence === 'confident' ? 1 : 0),
                hesitantCount: current.hesitantCount + (confidence === 'hesitant' ? 1 : 0),
                difficultCount: current.difficultCount + (confidence === 'difficult' ? 1 : 0),
                lastAttemptSession: sessionNumber
              }
            };
          });
        }
      }

      let toRemoveIds = new Set<string>();
      let groupExplosions: Explosion[] = [];

      if (match.wordGroupId) {
        // If part of a group, explode ALL matching group members
        const groupMembers = allVisible.filter(k => k.wordGroupId === match!.wordGroupId);
        // Determine if this is an air catch (confident) or floor catch
        const anyStacked = groupMembers.some(k => gameState.stackedKana.some(s => s.id === k.id));
        const explosionType = anyStacked ? 'normal' : 'confident';
        groupMembers.forEach(k => {
          toRemoveIds.add(k.id);
          groupExplosions.push({ id: Math.random().toString(), x: k.x, y: k.y, type: explosionType });
        });
        newExplosions = groupExplosions; // Replace the single explosion with group
      } else {
        toRemoveIds.add(match.id);
      }

      const isStacked = gameState.stackedKana.some(k => k.id === match.id);

      // WORDS MODE: Explode ALL matching words with same wordId (regardless of stacked status)
      if (match.type === 'word' && match.wordId) {
        const allMatchingWords = [...gameState.activeKana, ...gameState.stackedKana].filter(
          k => k.wordId === match.wordId
        );

        // Group by wordGroupId to process each word instance
        const matchingGroups = new Set<string>();
        allMatchingWords.forEach(k => {
          if (k.wordGroupId) matchingGroups.add(k.wordGroupId);
        });

        matchingGroups.forEach(groupId => {
          // Skip the already-matched group
          if (groupId === match.wordGroupId) return;

          const groupMembers = [...gameState.activeKana, ...gameState.stackedKana].filter(
            k => k.wordGroupId === groupId
          );
          groupMembers.forEach(k => {
            toRemoveIds.add(k.id);
            newExplosions.push({ id: Math.random().toString(), x: k.x, y: k.y });
          });
        });
      } else if (isStacked) {
        // KANA MODE: Explode neighbors (only for stacked blocks)
        const neighbors = [
          { x: match.x, y: match.y - CELL_SIZE },       // Top
          { x: match.x - CELL_SIZE, y: match.y },       // Left
          { x: match.x + CELL_SIZE, y: match.y },       // Right
        ];

        const isNeighbor = (k: KanaCharacter, targetX: number, targetY: number) => {
          return Math.abs(k.x - targetX) < 5 && Math.abs(k.y - targetY) < 5;
        };

        // Track which wordGroupIds we've already processed to avoid duplicates
        const processedWordGroups = new Set<string>();

        gameState.stackedKana.forEach(k => {
          neighbors.forEach(n => {
            if (isNeighbor(k, n.x, n.y)) {
              // If neighbor is part of a word group, remove the ENTIRE group
              if (k.wordGroupId && !processedWordGroups.has(k.wordGroupId)) {
                processedWordGroups.add(k.wordGroupId);
                const groupMembers = gameState.stackedKana.filter(
                  m => m.wordGroupId === k.wordGroupId
                );
                groupMembers.forEach(m => {
                  toRemoveIds.add(m.id);
                  newExplosions.push({ id: Math.random().toString(), x: m.x, y: m.y });
                });
              } else if (!k.wordGroupId) {
                // Single character (not part of a word)
                toRemoveIds.add(k.id);
                newExplosions.push({ id: Math.random().toString(), x: k.x, y: k.y });
              }
            }
          });
        });
      }

      setGameState(prev => {
        const filteredActive = prev.activeKana.filter(k => !toRemoveIds.has(k.id));
        const filteredStacked = prev.stackedKana.filter(k => !toRemoveIds.has(k.id));

        // Update Stats
        let newStats = { ...prev.stats };

        if (match.type === 'word' && match.wordId) {
          const wWord = WORDS.find(w => w.id === match.wordId);
          if (wWord) {
            const wordStat = newStats.byWord[match.wordId] || {
              correct: 0, missed: 0, id: wWord.id, kanji: wWord.kanji, romaji: wWord.romaji, en: wWord.en
            };
            wordStat.correct += 1;
            newStats.byWord[match.wordId] = wordStat;
          }
        } else {
          const charStat = newStats.byCharacter[match.char] || { correct: 0, missed: 0, char: match.char, romaji: match.romaji };
          charStat.correct += 1;
          newStats.byCharacter[match.char] = charStat;
        }

        // Play sound
        if (match.type === 'word' && match.wordId) {
          const wordDef = WORDS.find(w => w.id === match.wordId);
          if (wordDef) {
            speakKana(wordDef.kana);
          } else {
            speakKana(match.char);
          }
        } else {
          speakKana(match.char);
        }

        let newStreak = prev.streak;
        if (isEarlyGuess) {
          setScoreHighlight(true);
          newStreak += 1;

          // Streak Popup Logic
          // Milestones: 5, 10, 20, 30, 40...
          if (newStreak === 5 || newStreak === 10 || (newStreak >= 20 && newStreak % 10 === 0)) {
            setStreakPopups(sp => [...sp, {
              id: Math.random().toString(),
              text: `Strike ${newStreak}!`,
              x: match!.x, // Show near the explosion
              y: match!.y - 50
            }]);

            // Remove popup after animation
            setTimeout(() => {
              setStreakPopups(sp => sp.slice(1)); // Simple queue removal or use ID filter
            }, 1500);
          }
        }

        // Bonus Calculation: x1.5 for early guess + (Streak * 2) flat bonus?
        // User: "The bigger the series, the bigger the bonus".
        // Words Mode Nerf: Reduce all constants by approx 3x
        const isWordType = match.type === 'word';
        const streakMultiplier = isWordType ? 2 : 5;
        const basePointValue = isWordType ? 3 : 10;
        const explosionValue = isWordType ? 1 : 5;

        const streakBonus = isEarlyGuess ? (newStreak * streakMultiplier) : 0;
        const multiplier = isEarlyGuess ? 1.5 : 1;

        // Base points + (Extra Explosions * Value)
        const basePoints = basePointValue + (newExplosions.length - 1) * explosionValue;
        const totalPoints = Math.floor(basePoints * multiplier) + streakBonus;

        return {
          ...prev,
          activeKana: filteredActive,
          stackedKana: filteredStacked,
          explosions: [...prev.explosions, ...newExplosions],
          wordPopups: [...prev.wordPopups, ...newWordPopups],
          score: prev.score + totalPoints,
          streak: newStreak,
          stats: {
            ...prev.stats,
            correct: prev.stats.correct + 1,
            byCharacter: newStats.byCharacter,
            byWord: newStats.byWord
          },
          // Freeze the falling/spawning for 2.5 seconds (2500ms)
          frozenUntil: Date.now() + 750
        };
      });
      setInputValue(''); // Reset input after match

      // Cleanup explosions after animation
      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          explosions: prev.explosions.filter(e => !newExplosions.some(ne => ne.id === e.id))
        }));
      }, 500);

      if (newWordPopups.length > 0) {
        setTimeout(() => {
          setGameState(prev => ({
            ...prev,
            wordPopups: prev.wordPopups.filter(wp => !newWordPopups.some(nwp => nwp.id === wp.id))
          }));
        }, 2000); // 2 seconds for word popups
      }
    }
  }, [gameState.activeKana, gameState.stackedKana, gameState.stats]); // Added dependencies

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().trim();
    processInput(val);
  };

  const handleVirtualKeyPress = (key: string) => {
    const newVal = inputValue + key;
    processInput(newVal);
  };

  const handleVirtualBackspace = () => {
    setInputValue(prev => prev.slice(0, -1));
  };

  // Click handler for stacked word blocks (Edit Mnemonic)
  const handleWordClick = (kana: KanaCharacter) => {
    if (kana.type !== 'word' || !kana.wordId) return;
    setEditingWord({ wordId: kana.wordId, x: kana.x, y: kana.y });
    setGameState(prev => ({ ...prev, isPaused: true }));
  };

  const getKanaColor = (type: string, pos?: 'Verb' | 'Noun' | 'Adverb' | 'Adjective' | 'Other') => {
    if (type === 'word') {
      // Part of speech color coding for words
      switch (pos) {
        case 'Verb': return 'bg-orange-400 text-orange-900 border-orange-500 font-bold';
        case 'Noun': return 'bg-blue-300 text-blue-900 border-blue-400 font-bold';
        case 'Adverb': return 'bg-violet-300 text-violet-900 border-violet-400 font-bold';
        case 'Adjective': return 'bg-pink-300 text-pink-900 border-pink-400 font-bold';
        case 'Other': return 'bg-cyan-300 text-cyan-900 border-cyan-400 font-bold';
        default: return 'bg-purple-300 text-purple-900 border-purple-400 font-bold';
      }
    }
    return type === 'hiragana' ? 'bg-pink-300 text-pink-900 border-pink-400 text-3xl' : 'bg-blue-300 text-blue-900 border-blue-400 text-3xl';
  };

  // Confidence-based color for stacked blocks
  const getStackedBlockColor = (kana: KanaCharacter) => {
    // Only apply to words with stackedAt tracking
    if (kana.type !== 'word' || kana.stackedAt === undefined) {
      return getKanaColor(kana.type, kana.pos) + ' grayscale-[0.3]';
    }

    const blocksAfter = blocksProcessedRef.current - kana.stackedAt;

    // Get faded colors based on part of speech
    const getFadedColors = (pos?: 'Verb' | 'Noun' | 'Adverb' | 'Adjective' | 'Other') => {
      switch (pos) {
        case 'Verb': return { light: 'bg-orange-200 text-orange-700 border-orange-300', faded: 'bg-orange-200 text-orange-600 border-orange-300' };
        case 'Noun': return { light: 'bg-blue-200 text-blue-700 border-blue-300', faded: 'bg-blue-200 text-blue-600 border-blue-300' };
        case 'Adverb': return { light: 'bg-violet-200 text-violet-700 border-violet-300', faded: 'bg-violet-200 text-violet-600 border-violet-300' };
        case 'Adjective': return { light: 'bg-pink-200 text-pink-700 border-pink-300', faded: 'bg-pink-200 text-pink-600 border-pink-300' };
        case 'Other': return { light: 'bg-cyan-200 text-cyan-700 border-cyan-300', faded: 'bg-cyan-200 text-cyan-600 border-cyan-300' };
        default: return { light: 'bg-purple-200 text-purple-700 border-purple-300', faded: 'bg-purple-200 text-purple-600 border-purple-300' };
      }
    };
    const colors = getFadedColors(kana.pos);

    if (blocksAfter >= CONFIDENCE_THRESHOLD_DIFFICULT) {
      // Difficult - gray
      return 'bg-gray-400 text-gray-700 border-gray-500 font-bold';
    } else if (blocksAfter >= 2) {
      // Fading - faded version of pos color
      return colors.faded + ' font-bold opacity-70';
    } else if (blocksAfter >= CONFIDENCE_THRESHOLD_HESITANT) {
      // Hesitant start - lighter version of pos color
      return colors.light + ' font-bold';
    }
    // Just landed - use full part-of-speech color
    return getKanaColor('word', kana.pos);
  };

  const getWordHighlightStyle = (kana: KanaCharacter, hoveredId: string | null) => {
    if (kana.type !== 'word' || !kana.wordGroupId || kana.wordGroupId !== hoveredId) {
      return { className: '', style: {} };
    }

    const isSingle = (kana.wordLength || 1) === 1;
    const isFirst = kana.wordIndex === 0;
    const isLast = kana.wordIndex === (kana.wordLength! - 1);

    // Base highlight classes
    let classes = 'z-10 scale-105 ';
    let shadow = '';
    const color = '#facc15'; // yellow-400
    const width = '4px';

    if (isSingle) {
      classes += 'ring-4 ring-yellow-400';
    } else {
      // Connect neighbors by removing rounded corners
      if (isFirst) classes += 'rounded-r-none rounded-l-xl';
      else if (isLast) classes += 'rounded-l-none rounded-r-xl';
      else classes += 'rounded-none';

      // Build Box Shadow for outer borders only
      const sTop = `0 -${width} 0 0 ${color}`;
      const sBottom = `0 ${width} 0 0 ${color}`;
      const sLeft = `-${width} 0 0 0 ${color}`;
      const sRight = `${width} 0 0 0 ${color}`;

      const shadows = [];
      shadows.push(sTop, sBottom); // Top/Bottom always
      if (isFirst) shadows.push(sLeft);
      if (isLast) shadows.push(sRight);

      shadow = shadows.join(', ');
    }

    return { className: classes, style: shadow ? { boxShadow: shadow } : {} };
  };

  const getKanaStyle = (kana: KanaCharacter) => {
    const baseStyle: React.CSSProperties = {
      width: CELL_SIZE - 4,
      height: CELL_SIZE - 4,
      left: kana.x + 2,
      top: kana.y + 2,
      fontSize: kana.type === 'word' ? (kana.char.length > 4 ? '0.6rem' : '2rem') : undefined,
    };

    if (kana.type === 'word' && kana.wordLength && kana.wordLength > 1) {
      // Visual merging logic
      const idx = kana.wordIndex!;
      const len = kana.wordLength;

      // Styles to pull characters closer together visually
      let alignmentStyle: React.CSSProperties = {};

      if (idx === 0) {
        // First char: remove right border, square right corners
        // Pull right (end)
        alignmentStyle = {
          borderRightWidth: 0,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          width: CELL_SIZE - 2,
          paddingRight: 0,
          justifyContent: 'flex-end',
          paddingLeft: '10%' // Push away from left edge slightly
        };
      } else if (idx === len - 1) {
        // Last char: remove left border, square left corners
        // Pull left (start)
        alignmentStyle = {
          borderLeftWidth: 0,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          width: CELL_SIZE - 2,
          left: kana.x,
          paddingLeft: 0,
          justifyContent: 'flex-start',
          paddingRight: '10%' // Push away from right edge slightly
        };
      } else {
        // Middle char: remove both borders, square all corners
        alignmentStyle = {
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderRadius: 0,
          width: CELL_SIZE,
          left: kana.x
        };
      }
      return { ...baseStyle, ...alignmentStyle };
    }

    return baseStyle;
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row ${isMobile ? 'items-center justify-start pt-2' : 'items-center justify-center'} p-2 md:p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pink-100 via-pink-50 to-white overflow-hidden fixed inset-0`}>

      <HistoryPanel history={history} />

      <div className={`flex flex-col items-center transition-transform duration-300 ${isMobile ? 'origin-top' : 'origin-center'}`} style={{ transform: `scale(${scale})`, paddingTop: isMobile ? extraPadding : 0 }}>
        {/* Header Container - matches board width on mobile to ensure alignment, wider on desktop */}
        <div
          className="mb-2 px-2"
          style={{ width: isMobile ? BOARD_WIDTH + 12 : 480 }}
        >
          <div className="flex justify-between items-end mb-1">
            <div className="flex flex-col">
              <h1 className="text-3xl md:text-4xl font-black text-pink-500 tracking-tight drop-shadow-sm select-none flex items-center gap-2">
                KANA POP! <span className="text-xl md:text-2xl">✨</span>

              </h1>
              <div className="flex gap-1 md:gap-2 mt-1 items-center">



                {/* Hiragana Toggle */}
                <button
                  onClick={() => {
                    if (gameState.isActive) return;
                    setGameState(prev => {
                      let newMode: KanaMode = prev.mode;
                      if (prev.mode === 'words') {
                        newMode = 'hiragana';
                      } else if (prev.mode === 'katakana') {
                        newMode = 'both';
                      } else if (prev.mode === 'both') {
                        newMode = 'katakana';
                      } else if (prev.mode === 'hiragana') {
                        // Prevent deselecting the last one? Or just keep it as is.
                        // User said "Start" is disabled if nothing selected, but let's just enforce at least one.
                        // Actually, let's allow toggling off if we want, but better to keep one active.
                        // Let's implement: Click H when H is active -> Do nothing (must have one).
                        // Unless we allow "None" which disables start. Simple approach: Enforce 1.
                        newMode = 'hiragana';
                      }
                      return { ...prev, mode: newMode };
                    });
                  }}
                  disabled={gameState.isActive}
                  className={`px-4 py-2 text-lg md:text-sm font-black rounded-full border-2 transition-all capitalize ${gameState.mode === 'hiragana' || gameState.mode === 'both'
                    ? 'bg-pink-400 text-white border-pink-400'
                    : 'bg-white text-pink-300 border-pink-100 hover:border-pink-200'
                    } ${gameState.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Hiragana
                </button>

                {/* Katakana Toggle */}
                <button
                  onClick={() => {
                    if (gameState.isActive) return;
                    setGameState(prev => {
                      let newMode: KanaMode = prev.mode;
                      if (prev.mode === 'words') {
                        newMode = 'katakana';
                      } else if (prev.mode === 'hiragana') {
                        newMode = 'both';
                      } else if (prev.mode === 'both') {
                        newMode = 'hiragana';
                      } else if (prev.mode === 'katakana') {
                        newMode = 'katakana';
                      }
                      return { ...prev, mode: newMode };
                    });
                  }}
                  disabled={gameState.isActive}
                  className={`px-4 py-2 text-lg md:text-sm font-black rounded-full border-2 transition-all capitalize ${gameState.mode === 'katakana' || gameState.mode === 'both'
                    ? 'bg-blue-400 text-white border-blue-400'
                    : 'bg-white text-blue-300 border-blue-100 hover:border-blue-200'
                    } ${gameState.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      ${gameState.mode === 'katakana' || gameState.mode === 'both' ? '!bg-blue-400 !border-blue-400 !text-white' : ''}
                      `}
                // Note: Tailwind config might not support ! prefix without JIT, but usually fine in Vite. 
                // Safest to just conditional string.
                >
                  Katakana
                </button>

                {/* Words Toggle */}
                <button
                  onClick={() => !gameState.isActive && setGameState(prev => ({ ...prev, mode: 'words' }))}
                  disabled={gameState.isActive}
                  className={`px-4 py-2 text-lg md:text-sm font-black rounded-full border-2 transition-all capitalize ${gameState.mode === 'words'
                    ? 'bg-purple-400 text-white border-purple-400'
                    : 'bg-white text-purple-300 border-purple-100 hover:border-purple-200'
                    } ${gameState.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Words
                </button>
                <button
                  onClick={() => setAudioEnabled(prev => !prev)}
                  className={`ml-2 w-10 h-10 md:w-8 md:h-8 text-xl md:text-lg rounded-full ${audioEnabled ? 'bg-pink-100 hover:bg-pink-200 text-pink-500' : 'bg-gray-200 hover:bg-gray-300 text-gray-400'} flex items-center justify-center transition-colors`}
                  title={audioEnabled ? 'Sound ON' : 'Sound OFF'}
                >
                  {audioEnabled ? '🔊' : '🔇'}
                </button>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              {/* Mobile My Vocab Button (Top Right) */}
              <button
                onClick={() => setIsVocabOpen(!isVocabOpen)}
                className="md:hidden bg-pink-100 ring-2 ring-pink-200 hover:bg-pink-200 text-pink-500 px-4 py-1.5 rounded-full text-lg font-black flex items-center gap-2 transition-all shadow-sm mb-1 whitespace-nowrap"
              >
                <span>📚</span> My Vocab
              </button>

              <div className="text-pink-600 text-xs md:text-sm font-bold uppercase tracking-wider mb-[-2px] md:mb-[-4px]">Score</div>
              <div className={`text-4xl md:text-5xl font-black tabular-nums transition-all duration-300 ${scoreHighlight ? 'text-yellow-400 scale-125 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]' : 'text-pink-500'}`}>
                {gameState.score}
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative bg-white border-[6px] border-pink-200 rounded-[32px] overflow-hidden shadow-2xl flex items-center justify-center"
          style={{ width: BOARD_WIDTH + 12, height: BOARD_HEIGHT + 12 }}
        >
          {!gameState.isActive && !gameState.isGameOver ? (
            <div className="text-center p-8 flex flex-col items-center">
              <div className="text-8xl mb-6 animate-bounce-slow">🍮</div>
              <h2 className="text-2xl font-bold text-pink-500 mb-4">Master your Kana!</h2>
              <button
                onClick={() => startGame(gameState.mode, gameState.difficulty)}
                className="bg-pink-400 hover:bg-pink-500 text-white font-black px-12 py-4 rounded-2xl text-xl shadow-lg transition-transform active:scale-95"
              >
                START GAME
              </button>
              <p className="mt-4 text-pink-300 font-medium text-sm">Type romaji. Hear the sound. Pop them!</p>
            </div>
          ) : (
            <>
              <div className="absolute inset-0 grid grid-cols-8 pointer-events-none opacity-[0.03]">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="border-r border-slate-900" />
                ))}
              </div>

              {gameState.activeKana.map(kana => {
                const hl = getWordHighlightStyle(kana, hoveredWordGroupId);
                const srsProgress = kana.type === 'word' && kana.wordId ? wordSRS[kana.wordId]?.progress || 0 : 0;
                const getProgressBarColor = (pos?: 'Verb' | 'Noun' | 'Adverb' | 'Adjective' | 'Other') => {
                  switch (pos) {
                    case 'Verb': return 'bg-orange-600';
                    case 'Noun': return 'bg-blue-500';
                    case 'Adverb': return 'bg-violet-500';
                    case 'Adjective': return 'bg-pink-500';
                    case 'Other': return 'bg-cyan-500';
                    default: return 'bg-purple-500';
                  }
                };
                return (
                  <div
                    key={kana.id}
                    className={`absolute flex items-center justify-center font-bold rounded-xl border-b-4 transition-transform ${getKanaColor(kana.type, kana.pos)} japanese-font ${kana.type === 'word' ? 'cursor-pointer' : ''} ${hl.className}`}
                    style={{ ...getKanaStyle(kana), ...hl.style }}
                    onClick={() => kana.type === 'word' && handleWordClick(kana)}
                    onMouseEnter={() => kana.type === 'word' && kana.wordGroupId && setHoveredWordGroupId(kana.wordGroupId)}
                    onMouseLeave={() => setHoveredWordGroupId(null)}
                  >
                    {kana.char}
                    {/* SRS Progress Bar - in the bottom border */}
                    {kana.type === 'word' && kana.wordIndex === 0 && (
                      <div
                        className="absolute -bottom-[3px] left-[2px] right-[2px] h-[3px] overflow-hidden rounded-b-lg z-10"
                      >
                        <div
                          className={`h-full ${getProgressBarColor(kana.pos)} transition-all duration-300`}
                          style={{ width: `${srsProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {gameState.stackedKana.map(kana => {
                const hl = getWordHighlightStyle(kana, hoveredWordGroupId);
                const srsProgress = kana.type === 'word' && kana.wordId ? wordSRS[kana.wordId]?.progress || 0 : 0;
                const getProgressBarColor = (pos?: 'Verb' | 'Noun' | 'Adverb' | 'Adjective' | 'Other') => {
                  switch (pos) {
                    case 'Verb': return 'bg-orange-600';
                    case 'Noun': return 'bg-blue-500';
                    case 'Adverb': return 'bg-violet-500';
                    case 'Adjective': return 'bg-pink-500';
                    case 'Other': return 'bg-cyan-500';
                    default: return 'bg-purple-500';
                  }
                };
                return (
                  <div
                    key={kana.id}
                    className={`absolute flex items-center justify-center rounded-xl border-b-4 ${getStackedBlockColor(kana)} japanese-font ${kana.type === 'word' ? 'cursor-pointer' : ''} ${hl.className}`}
                    style={{ ...getKanaStyle(kana), ...hl.style }}
                    onClick={() => kana.type === 'word' && handleWordClick(kana)}
                    onMouseEnter={() => kana.type === 'word' && kana.wordGroupId && setHoveredWordGroupId(kana.wordGroupId)}
                    onMouseLeave={() => setHoveredWordGroupId(null)}
                  >
                    {kana.char}
                    {/* SRS Progress Bar - in the bottom border */}
                    {kana.type === 'word' && kana.wordIndex === 0 && (
                      <div
                        className="absolute -bottom-[3px] left-[2px] right-[2px] h-[3px] overflow-hidden rounded-b-lg z-10"
                      >
                        <div
                          className={`h-full ${getProgressBarColor(kana.pos)} transition-all duration-300`}
                          style={{ width: `${srsProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pause Overlay */}
              {gameState.isPaused && !editingWord && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
                  <div className="text-6xl mb-4">⏸️</div>
                  <h2 className="text-2xl font-bold text-pink-500 mb-6">PAUSED</h2>
                  <div className="flex gap-4">
                    <button
                      onClick={togglePause}
                      className="bg-pink-400 hover:bg-pink-500 text-white font-bold px-8 py-3 rounded-xl text-lg shadow-lg transition-transform active:scale-95"
                    >
                      ▶️ RESUME
                    </button>
                    <button
                      onClick={stopGame}
                      className="bg-white border-4 border-pink-200 text-pink-400 hover:text-pink-500 hover:border-pink-300 font-bold px-8 py-3 rounded-xl text-lg transition-all active:scale-95"
                    >
                      🛑 END GAME
                    </button>
                  </div>
                </div>
              )}

              {gameState.isGameOver && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-sm z-10" />
              )}

              {gameState.explosions.map(exp => (
                <div
                  key={exp.id}
                  className="absolute flex items-center justify-center pointer-events-none"
                  style={{
                    width: CELL_SIZE * 2,
                    height: CELL_SIZE * 2,
                    left: exp.x - CELL_SIZE / 2,
                    top: exp.y - CELL_SIZE / 2,
                    zIndex: 20
                  }}
                >
                  <div className="relative w-full h-full animate-ping">
                    {exp.type === 'confident' ? (
                      <>
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl">⭐</span>
                        <span className="absolute top-0 left-1/4 text-xl">✨</span>
                        <span className="absolute bottom-0 right-1/4 text-xl">✨</span>
                      </>
                    ) : (
                      <>
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">✨</span>
                        <span className="absolute top-0 left-1/4 text-xl">🌸</span>
                        <span className="absolute bottom-0 right-1/4 text-xl">🌸</span>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {gameState.souls.map(soul => (
                <div
                  key={soul.id}
                  className="absolute flex items-center justify-center font-bold text-pink-300 opacity-0 pointer-events-none animate-float-up whitespace-nowrap"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    left: soul.x + 2,
                    top: soul.y, // Starts at block position
                    fontSize: '1rem',
                  }}
                >
                  <span className="bg-white/80 px-2 rounded-md shadow-sm">{soul.text}</span>
                </div>
              ))}

              {/* Click-to-hint popups (Removed in favor of Mnemonic Modal) */}

              {gameState.wordPopups.map(popup => {
                const popupWidth = 220;
                const popupHeight = 140;

                let left = popup.x + (CELL_SIZE / 2) - (popupWidth / 2);
                let top = popup.y - popupHeight + 20;

                // Clamp Horizontal
                if (left < 5) left = 5;
                if (left + popupWidth > BOARD_WIDTH - 5) left = BOARD_WIDTH - popupWidth - 5;

                // Vertical Flip
                if (top < 5) {
                  top = popup.y + CELL_SIZE + 10;
                }

                const getPopupColors = (pos?: string) => {
                  switch (pos) {
                    case 'Verb': return { border: 'border-orange-500', textStrong: 'text-orange-700', text: 'text-orange-600' };
                    case 'Noun': return { border: 'border-blue-400', textStrong: 'text-blue-700', text: 'text-blue-500' };
                    case 'Adverb': return { border: 'border-violet-400', textStrong: 'text-violet-700', text: 'text-violet-500' };
                    case 'Adjective': return { border: 'border-pink-400', textStrong: 'text-pink-700', text: 'text-pink-500' };
                    case 'Other': return { border: 'border-cyan-400', textStrong: 'text-cyan-700', text: 'text-cyan-500' };
                    default: return { border: 'border-purple-300', textStrong: 'text-purple-600', text: 'text-purple-400' };
                  }
                };
                const colors = getPopupColors(popup.pos);

                return (
                  <div
                    key={popup.id}
                    className={`absolute flex flex-col items-center justify-center p-3 rounded-xl bg-white/90 shadow-xl border-2 ${colors.border} z-30 animate-float-up-slow pointer-events-none`}
                    style={{
                      left: left,
                      top: top,
                      width: popupWidth,
                      minWidth: 'unset'
                    }}
                  >
                    <div className={`text-4xl font-black ${colors.textStrong} mb-1`}>{popup.kanji}</div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">{popup.romaji}</div>
                    <div className={`text-base font-bold ${colors.text} text-center leading-tight`}>{popup.en}</div>
                    {popup.mnemonic && (
                      <div className="mt-2 text-xs font-medium text-pink-600 bg-pink-50 px-2 py-1 rounded-lg text-center border border-pink-100 max-w-full break-words">
                        {popup.mnemonic}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streak Popups */}
              {streakPopups.map(popup => {
                const width = 120;
                let left = popup.x + (CELL_SIZE / 2) - (width / 2);

                if (left < 5) left = 5;
                if (left + width > BOARD_WIDTH - 5) left = BOARD_WIDTH - width - 5;

                return (
                  <div
                    key={popup.id}
                    className="absolute flex items-center justify-center font-black text-yellow-500 text-2xl z-40 animate-float-up pointer-events-none drop-shadow-md"
                    style={{
                      left: left,
                      top: popup.y,
                      width: width,
                      textShadow: '0 2px 0 #fff, 0 -2px 0 #fff, 2px 0 0 #fff, -2px 0 0 #fff'
                    }}
                  >
                    {popup.text}
                  </div>
                );
              })}

            </>
          )}
        </div>

        <div className="mt-2 w-full max-w-[480px] flex gap-1 md:gap-2 px-2">
          {/* Freeze Ability Button */}
          {gameState.isActive && !gameState.isGameOver && (
            <button
              onClick={() => {
                if (gameState.score >= 150 && !gameState.isPaused) {
                  setGameState(prev => ({
                    ...prev,
                    score: prev.score - 150, // Cost 150
                    frozenUntil: Date.now() + 10000, // 10 seconds
                    isFreezeAbilityActive: true
                  }));
                  setTimeout(() => inputRef.current?.focus(), 0); // Keep focus
                }
              }}
              disabled={gameState.score < 150 || gameState.isPaused || (!!gameState.frozenUntil && gameState.frozenUntil > Date.now() && gameState.isFreezeAbilityActive)}
              className={`relative border-4 font-bold rounded-2xl p-2 md:p-4 flex flex-col items-center justify-center transition-all active:scale-95 min-w-[60px] md:min-w-[80px] ${gameState.score >= 150
                ? 'bg-cyan-100 border-cyan-300 text-cyan-600 hover:bg-cyan-200 hover:border-cyan-400'
                : 'bg-gray-100 border-gray-200 text-gray-400 opacity-70 cursor-not-allowed'
                }`}
            >
              <div className="text-3xl mb-1">❄️</div>
              {gameState.isFreezeAbilityActive && gameState.frozenUntil && gameState.frozenUntil > Date.now() ? (
                <div className="absolute inset-0 flex items-center justify-center bg-cyan-100/90 rounded-xl">
                  <span className="text-xl font-black text-cyan-600 animate-pulse">
                    {Math.ceil((gameState.frozenUntil - Date.now()) / 1000)}s
                  </span>
                </div>
              ) : (
                <div className="text-[10px] font-black opacity-80">-150</div>
              )}
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={gameState.isPaused ? "PAUSED" : (gameState.isActive ? "Type romaji..." : "Press Start!")}
            disabled={!gameState.isActive || gameState.isPaused}
            readOnly={isMobile} // Custom Mobile keyboard logic
            autoFocus={!isMobile}
            className="flex-1 min-w-0 bg-white border-4 border-pink-200 rounded-2xl px-2 py-2 md:px-4 md:py-4 text-xl md:text-2xl font-bold text-pink-600 placeholder-pink-200 focus:outline-none focus:border-pink-400 transition-colors shadow-inner"
          />

          {gameState.isActive && (
            <button
              onClick={togglePause}
              className={`border-4 font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center
                ${isMobile ? 'w-[60px] p-2' : 'px-4 py-4'} 
                ${gameState.isPaused
                  ? 'bg-pink-400 border-pink-400' // Resume State (Active/Highlight)
                  : 'bg-white border-pink-200 hover:border-pink-300' // Pause State (Normal)
                }`}
              title={gameState.isPaused ? 'Resume' : 'Pause'}
            // On Mobile: Wider. On Desktop: Normal padding.
            >
              {gameState.isPaused ? (
                // Play Icon (Triangle) - White if bg is pink, Pink if bg is white
                <svg viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 md:w-6 md:h-6 ${gameState.isPaused ? 'text-white' : 'text-pink-400'}`}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                // Pause Icon (Double Rect)
                <svg viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 md:w-6 md:h-6 ${gameState.isPaused ? 'text-white' : 'text-pink-400'}`}>
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={stopGame}
            className={`bg-white border-4 border-pink-200 text-pink-400 hover:text-pink-500 hover:border-pink-300 font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center
              ${isMobile ? 'w-[60px] p-2' : 'px-6 py-4'}`}
            title="Stop Game"
          >
            {/* Stop Icon (Square) */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 md:w-6 md:h-6">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>

        <div className="mt-2 text-pink-300 text-[10px] font-bold uppercase tracking-widest hidden md:flex gap-4">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-300" /> Hiragana</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-300" /> Katakana</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-300" /> Words</span>
        </div>
      </div>

      {isMobile && (
        <div className="fixed bottom-0 left-0 w-full z-50">
          <VirtualKeyboard onKeyPress={handleVirtualKeyPress} onBackspace={handleVirtualBackspace} />
        </div>
      )}

      {(gameState.isGameOver || showStats) && (
        <StatsModal
          stats={gameState.stats}
          score={gameState.score}
          wordSRS={wordSRS}
          onClose={() => setShowStats(false)}
          onRestart={() => startGame(gameState.mode, gameState.difficulty)}
        />
      )}
      <MyVocabPanel
        isOpen={isVocabOpen}
        onClose={() => setIsVocabOpen(false)}
        onToggle={() => setIsVocabOpen(prev => !prev)}
        wordSRS={wordSRS}
        mnemonics={mnemonics}
        currentSession={sessionNumber}
        onEditMnemonic={(word) => {
          setEditingWord({ wordId: word.id, x: window.innerWidth / 2, y: window.innerHeight / 2 });
          setGameState(prev => ({ ...prev, isPaused: true }));
        }}
      />

      {editingWord && (
        <MnemonicModal
          wordId={editingWord.wordId}
          initialMnemonic={mnemonics[editingWord.wordId] || ''}
          x={editingWord.x}
          y={editingWord.y}
          onSave={(id, text) => {
            setMnemonics(prev => ({ ...prev, [id]: text }));
            setEditingWord(null);
            setGameState(prev => ({ ...prev, isPaused: false }));
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onClose={() => {
            setEditingWord(null);
            setGameState(prev => ({ ...prev, isPaused: false }));
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      )}
    </div>
  );
};

export default App;

const MnemonicModal: React.FC<{
  wordId: string;
  initialMnemonic: string;
  x: number;
  y: number;
  onSave: (id: string, text: string) => void;
  onClose: () => void;
}> = ({ wordId, initialMnemonic, x, y, onSave, onClose }) => {
  const word = WORDS.find(w => w.id === wordId);
  const [text, setText] = useState(initialMnemonic);

  if (!word) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-[320px] max-w-full mx-4 transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div className="text-5xl font-black text-purple-600 mb-2">{word.kanji || word.kana}</div>
          <div className="text-xl font-bold text-gray-400 tracking-wider uppercase">{word.romaji}</div>
          <div className="text-xl font-bold text-purple-400 mt-1">{word.en}</div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Mnemonic Rule (MP)
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full h-24 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-xl text-gray-700 placeholder-yellow-300 focus:outline-none focus:border-yellow-400 resize-none font-medium"
            placeholder="e.g. 'NEKO' sounds like 'Neck', cats have necks..."
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(wordId, text)}
            className="flex-1 px-4 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 shadow-lg transition-transform active:scale-95"
          >
            Save MP
          </button>
        </div>
      </div>
    </div>
  );
};
