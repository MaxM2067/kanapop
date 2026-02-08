
import React, { useState, useEffect, useCallback, useRef } from 'react';

import { HIRAGANA, KATAKANA, COLUMNS, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, SPAWN_INTERVAL_BASE, FALL_SPEED_BASE, SPEED_MULTIPLIERS } from './constants';
import { WORDS } from './words';
import { KanaMode, KanaCharacter, GameState, GameStats, Difficulty, GameHistoryItem, WordPopup, WordMastery, WordSRS, WordSRSData, ConfidenceLevel, Explosion } from './types';
import { SRS_INTERVALS, SRS_MAX_LEVEL, MASTERY_THRESHOLD, CONFIDENCE_THRESHOLD_DIFFICULT, CONFIDENCE_THRESHOLD_HESITANT, PROGRESS_CONFIDENT, PROGRESS_HESITANT, PROGRESS_DIFFICULT } from './srs';
import StatsModal from './components/StatsModal';
import HistoryPanel from './components/HistoryPanel';
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
    mode: 'hiragana',
    difficulty: 'slow',
    level: 1, // Represents max morae now
    stats: { correct: 0, missed: 0, byCharacter: {}, byWord: {} },
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

  // Track blocks processed for confidence calculation
  const blocksProcessedRef = useRef<number>(0);

  const [inputValue, setInputValue] = useState('');
  const [showStats, setShowStats] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  const spawnTimerRef = useRef<number>(0);

  // Hints state for click-to-hint (longer lasting than souls)
  const [hints, setHints] = useState<{ id: string; x: number; y: number; text: string; createdAt: number }[]>([]);

  // Clean up old hints (after 3 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHints(prev => prev.filter(h => now - h.createdAt < 3000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Mobile & Scaling State
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;

      // Determine if mobile based on width
      const mobile = width < 768;
      setIsMobile(mobile);

      // Calculate scale for board
      // Board width is ~480px + padding + borders. Let's say safe width is 520px.
      // If screen is smaller than safe width, scale down.
      if (width < 520) {
        // Leave some margin
        const newScale = (width - 32) / (BOARD_WIDTH + 12);
        setScale(Math.min(1, newScale));
      } else {
        setScale(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Web Speech API for TTS
  const speakKana = (kana: string) => {
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

  const testAudio = () => {
    speakKana('あ');
  };

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
    });
    setInputValue('');
    setShowStats(false);
    lastTimeRef.current = undefined;
    spawnTimerRef.current = 0;
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

        const allMastered = wordsAtLevel.every(w => (wordSRS[w.id]?.level || 0) >= MASTERY_THRESHOLD);
        if (allMastered) {
          maxMorae = Math.max(maxMorae, m + 1);
        } else {
          break; // Not mastered this level yet, so don't advance further
        }
      }

      // Review Mechanism: 10% chance to pick a Mastered word
      const doReview = Math.random() < 0.1;
      let candidates: typeof WORDS = [];

      if (doReview) {
        // Pick words due for review OR fully mastered
        candidates = WORDS.filter(w => {
          const data = wordSRS[w.id];
          if (!data) return false;
          return data.level >= MASTERY_THRESHOLD && data.nextReviewSession <= sessionNumber;
        });
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
        // Fill with In Progress first, then Fresh
        candidates = [...inProgress, ...fresh].slice(0, 15);

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
          group.forEach(kana => {
            nextStackedKana.push({ ...kana, y: minTargetY, stackedAt: blocksProcessedRef.current });

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
          romaji: match.romaji
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

        return {
          ...prev,
          activeKana: filteredActive,
          stackedKana: filteredStacked,
          explosions: [...prev.explosions, ...newExplosions],
          wordPopups: [...prev.wordPopups, ...newWordPopups],
          score: prev.score + 10 + (newExplosions.length - 1) * 5,
          stats: {
            ...prev.stats,
            correct: prev.stats.correct + 1,
            byCharacter: newStats.byCharacter,
            byWord: newStats.byWord
          }
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

  // Click-to-hint handler for stacked word blocks
  const showHint = (kana: KanaCharacter) => {
    if (kana.type !== 'word' || !kana.wordId) return;

    const word = WORDS.find(w => w.id === kana.wordId);
    if (!word) return;

    // Increment hint count on all blocks of this word group
    setGameState(prev => ({
      ...prev,
      stackedKana: prev.stackedKana.map(k =>
        k.wordGroupId === kana.wordGroupId
          ? { ...k, hintCount: (k.hintCount || 0) + 1 }
          : k
      ),
      activeKana: prev.activeKana.map(k =>
        k.wordGroupId === kana.wordGroupId
          ? { ...k, hintCount: (k.hintCount || 0) + 1 }
          : k
      )
    }));

    // Show hint popup
    setHints(prev => [...prev, {
      id: Math.random().toString(),
      x: kana.x,
      y: kana.y,
      text: `${word.kanji} (${word.romaji}) - ${word.en}`,
      createdAt: Date.now()
    }]);
  };

  const getKanaColor = (type: string) => {
    if (type === 'word') return 'bg-purple-300 text-purple-900 border-purple-400 font-bold';
    return type === 'hiragana' ? 'bg-pink-300 text-pink-900 border-pink-400 text-3xl' : 'bg-blue-300 text-blue-900 border-blue-400 text-3xl';
  };

  // Confidence-based color for stacked blocks
  const getStackedBlockColor = (kana: KanaCharacter) => {
    // Only apply to words with stackedAt tracking
    if (kana.type !== 'word' || kana.stackedAt === undefined) {
      return getKanaColor(kana.type) + ' grayscale-[0.3]';
    }

    const blocksAfter = blocksProcessedRef.current - kana.stackedAt;

    if (blocksAfter >= CONFIDENCE_THRESHOLD_DIFFICULT) {
      // Difficult - gray
      return 'bg-gray-400 text-gray-700 border-gray-500 font-bold';
    } else if (blocksAfter >= 2) {
      // Fading - faded purple
      return 'bg-purple-200 text-purple-600 border-purple-300 font-bold opacity-70';
    } else if (blocksAfter >= CONFIDENCE_THRESHOLD_HESITANT) {
      // Hesitant start - lighter purple
      return 'bg-purple-200 text-purple-700 border-purple-300 font-bold';
    }
    // Just landed - normal
    return 'bg-purple-300 text-purple-900 border-purple-400 font-bold';
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
    <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pink-100 via-pink-50 to-white overflow-hidden fixed inset-0">

      <HistoryPanel history={history} />

      <div className={`flex flex-col items-center transition-transform duration-300 origin-top`} style={{ transform: `scale(${scale})` }}>
        <div className="w-full max-w-[480px] mb-4 px-2">
          <div className="flex justify-between items-end mb-3">
            <div className="flex flex-col">
              <h1 className="text-4xl font-black text-pink-500 tracking-tight drop-shadow-sm select-none">
                KANA POP! <span className="text-2xl">✨</span>
              </h1>
              <div className="flex gap-2 mt-2 items-center">
                {(['hiragana', 'katakana', 'both', 'words'] as KanaMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => !gameState.isActive && setGameState(prev => ({ ...prev, mode: m }))}
                    disabled={gameState.isActive}
                    className={`px-3 py-1 text-[10px] font-black rounded-full border-2 transition-all capitalize ${gameState.mode === m
                      ? 'bg-pink-400 text-white border-pink-400'
                      : 'bg-white text-pink-300 border-pink-100 hover:border-pink-200'
                      } ${gameState.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {m}
                  </button>
                ))}
                <button
                  onClick={testAudio}
                  className="ml-2 w-6 h-6 rounded-full bg-pink-100 hover:bg-pink-200 text-pink-500 flex items-center justify-center transition-colors"
                  title="Test Audio"
                >
                  🔊
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-[-4px]">Score</div>
              <div className="text-4xl font-black text-pink-500 tabular-nums">{gameState.score}</div>
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="flex items-center gap-3 bg-white/60 p-2 rounded-2xl border-2 border-pink-100">
            <span className="text-[10px] font-bold text-pink-400 uppercase ml-1">Speed:</span>
            <div className="flex gap-1 flex-1">
              {(['slow', 'normal', 'fast'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => !gameState.isActive && setGameState(prev => ({ ...prev, difficulty: d }))}
                  disabled={gameState.isActive}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all capitalize ${gameState.difficulty === d
                    ? 'bg-blue-400 text-white border-blue-400'
                    : 'bg-white text-blue-300 border-blue-50 hover:border-blue-100'
                    } ${gameState.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {d === 'slow' ? '🐢 Slow' : d === 'normal' ? '🐰 Normal' : '⚡ Fast'}
                </button>
              ))}
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

              {gameState.activeKana.map(kana => (
                <div
                  key={kana.id}
                  className={`absolute flex items-center justify-center font-bold rounded-xl border-b-4 transition-transform ${getKanaColor(kana.type)} japanese-font`}
                  style={getKanaStyle(kana)}
                >
                  {kana.char}
                </div>
              ))}

              {gameState.stackedKana.map(kana => (
                <div
                  key={kana.id}
                  className={`absolute flex items-center justify-center rounded-xl border-b-4 ${getStackedBlockColor(kana)} japanese-font ${kana.type === 'word' ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400' : ''}`}
                  style={getKanaStyle(kana)}
                  onClick={() => kana.type === 'word' && showHint(kana)}
                >
                  {kana.char}
                </div>
              ))}

              {/* Pause Overlay */}
              {gameState.isPaused && (
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

              {/* Click-to-hint popups - brighter and longer lasting */}
              {hints.map(hint => (
                <div
                  key={hint.id}
                  className="absolute flex items-center justify-center font-bold text-purple-900 pointer-events-none animate-pulse whitespace-nowrap z-30"
                  style={{
                    left: hint.x - 40,
                    top: hint.y - 50,
                  }}
                >
                  <span className="bg-yellow-200 px-4 py-2 rounded-xl shadow-lg border-2 border-yellow-400 text-sm">
                    {hint.text}
                  </span>
                </div>
              ))}

              {gameState.wordPopups.map(popup => (
                <div
                  key={popup.id}
                  className="absolute flex flex-col items-center justify-center p-3 rounded-xl bg-white/90 shadow-xl border-2 border-purple-300 z-30 animate-float-up-slow pointer-events-none"
                  style={{
                    left: popup.x - 50, // Center roughly
                    top: popup.y - 50,
                    minWidth: '180px'
                  }}
                >
                  <div className="text-4xl font-black text-purple-600 mb-1">{popup.kanji}</div>
                  <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">{popup.romaji}</div>
                  <div className="text-base font-bold text-purple-400">{popup.en}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="mt-6 w-full max-w-[480px] flex gap-3 px-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={gameState.isPaused ? "PAUSED" : (gameState.isActive ? "Type romaji..." : "Press Start!")}
            disabled={!gameState.isActive || gameState.isPaused}
            readOnly={isMobile} // Custom Mobile keyboard logic
            autoFocus={!isMobile}
            className="flex-1 bg-white border-4 border-pink-200 rounded-2xl px-6 py-4 text-2xl font-bold text-pink-600 placeholder-pink-200 focus:outline-none focus:border-pink-400 transition-colors shadow-inner"
          />
          {gameState.isActive && (
            <button
              onClick={togglePause}
              className={`border-4 font-bold px-4 py-4 rounded-2xl transition-all active:scale-95 ${gameState.isPaused
                ? 'bg-pink-400 text-white border-pink-400 hover:bg-pink-500'
                : 'bg-white text-pink-400 border-pink-200 hover:text-pink-500 hover:border-pink-300'
                }`}
              title={gameState.isPaused ? 'Resume' : 'Pause'}
            >
              {gameState.isPaused ? '▶️' : '⏸️'}
            </button>
          )}
          <button
            onClick={stopGame}
            className="bg-white border-4 border-pink-200 text-pink-400 hover:text-pink-500 hover:border-pink-300 font-bold px-6 py-4 rounded-2xl transition-all active:scale-95"
          >
            STOP
          </button>
        </div>

        <div className="mt-4 text-pink-300 text-[10px] font-bold uppercase tracking-widest flex gap-4">
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
    </div>
  );
};

export default App;
