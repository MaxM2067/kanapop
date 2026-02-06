
import React, { useState, useEffect, useCallback, useRef } from 'react';

import { HIRAGANA, KATAKANA, COLUMNS, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, SPAWN_INTERVAL_BASE, FALL_SPEED_BASE, SPEED_MULTIPLIERS } from './constants';
import { KanaMode, KanaCharacter, GameState, GameStats, Difficulty, GameHistoryItem } from './types';
import StatsModal from './components/StatsModal';
import HistoryPanel from './components/HistoryPanel';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    isActive: false,
    isGameOver: false,
    activeKana: [],
    stackedKana: [],
    explosions: [],
    souls: [],
    mode: 'hiragana',
    difficulty: 'slow',
    level: 1,
    stats: { correct: 0, missed: 0, byCharacter: {} },
  });

  const [history, setHistory] = useState<GameHistoryItem[]>(() => {
    const saved = localStorage.getItem('kana_pop_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('kana_pop_history', JSON.stringify(history));
  }, [history]);

  const [inputValue, setInputValue] = useState('');
  const [showStats, setShowStats] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  const spawnTimerRef = useRef<number>(0);

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
      activeKana: [],
      stackedKana: [],
      explosions: [],
      souls: [],
      mode,
      difficulty,
      level: 1,
      stats: { correct: 0, missed: 0, byCharacter: {} },
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
    setGameState(prev => ({ ...prev, isActive: false }));
    setShowStats(true);
  };

  const spawnKana = useCallback(() => {
    const list = gameState.mode === 'hiragana'
      ? HIRAGANA
      : gameState.mode === 'katakana'
        ? KATAKANA
        : [...HIRAGANA, ...KATAKANA];

    const randomEntry = list[Math.floor(Math.random() * list.length)];
    const column = Math.floor(Math.random() * COLUMNS);

    const newKana: KanaCharacter = {
      id: Math.random().toString(36).substr(2, 9),
      char: randomEntry.char,
      romaji: randomEntry.romaji,
      type: HIRAGANA.some(h => h.char === randomEntry.char) ? 'hiragana' : 'katakana',
      x: column * CELL_SIZE,
      y: -CELL_SIZE,
      column,
      isDead: false,
    };

    setGameState(prev => ({
      ...prev,
      activeKana: [...prev.activeKana, newKana]
    }));
  }, [gameState.mode]);

  const update = useCallback((time: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    if (!gameState.isActive || gameState.isGameOver) return;

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
      // Aggressive Difficulty Ramp: Speed up significantly faster
      const currentSpeed = baseSpeed + (prev.score / 800);

      let nextSouls = [...prev.souls];

      prev.activeKana.forEach(kana => {
        const nextY = kana.y + currentSpeed;
        const columnStack = nextStackedKana.filter(s => s.column === kana.column);
        const topOfStack = columnStack.length > 0
          ? Math.min(...columnStack.map(s => s.y))
          : BOARD_HEIGHT;

        if (nextY + CELL_SIZE >= topOfStack) {
          const frozenY = topOfStack - CELL_SIZE;
          nextStackedKana.push({ ...kana, y: frozenY });

          // Score Penalty & Soul Creation
          prev.score = Math.max(0, prev.score - 5);
          nextSouls.push({
            id: Math.random().toString(),
            x: kana.x,
            y: frozenY,
            text: kana.romaji
          });

          const charStat = prev.stats.byCharacter[kana.char] || { correct: 0, missed: 0, char: kana.char, romaji: kana.romaji };
          charStat.missed += 1;
          prev.stats.byCharacter[kana.char] = charStat;

          if (frozenY <= 0) {
            triggeredGameOver = true;
            // Save history immediately on game over
            // We need to calculate stats here because the state update hasn't processed 'prev' into 'gameState' yet for external access
            // But we can use the 'prev' state which is accurate for this frame's determination
            // However, we can't call setHistory inside setGameState (bad practice/side effect).
            // We'll set a flag in state or use useEffect. 
            // Actually, cleanest is to handle it in an effect depending on isGameOver, OR call it here via a timeout ref hack,
            // OR just rely on the effect hook below.
          }
        } else {
          nextActiveKana.push({ ...kana, y: nextY });
        }
      });

      // Cleanup souls after they float up (simple time-based approximation by chance or just keep last N)
      // Ideally filtering by time created, but for simplicity we'll just keep the list short or clear in a separate effect if needed.
      // Better: remove souls that exceed a certain age or count to prevent memory leak.
      if (nextSouls.length > 20) nextSouls = nextSouls.slice(nextSouls.length - 20);

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
  }, [gameState.isActive, gameState.isGameOver, gameState.score, spawnKana]);

  useEffect(() => {
    if (gameState.isGameOver && !showStats) {
      // Game just ended, save stats
      saveHistory(gameState.score, gameState.stats);
      setShowStats(true);
    }
  }, [gameState.isGameOver, showStats, gameState.score, gameState.stats, saveHistory]);

  useEffect(() => {
    if (gameState.isActive && !gameState.isGameOver) {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState.isActive, gameState.isGameOver, update]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().trim();
    setInputValue(val);

    const allVisible = [...gameState.activeKana, ...gameState.stackedKana];
    const match = allVisible.find(k => k.romaji === val);

    if (match) {
      // Logic calculation outside setGameState to keep variables in scope
      let newExplosions = [{ id: Math.random().toString(), x: match.x, y: match.y }];
      let toRemoveIds = new Set<string>([match.id]);

      const isStacked = gameState.stackedKana.some(k => k.id === match.id);

      if (isStacked) {
        const neighbors = [
          { x: match.x, y: match.y - CELL_SIZE },       // Top
          { x: match.x - CELL_SIZE, y: match.y },       // Left
          { x: match.x + CELL_SIZE, y: match.y },       // Right
        ];

        const isNeighbor = (k: KanaCharacter, targetX: number, targetY: number) => {
          return Math.abs(k.x - targetX) < 5 && Math.abs(k.y - targetY) < 5;
        };

        gameState.stackedKana.forEach(k => {
          neighbors.forEach(n => {
            if (isNeighbor(k, n.x, n.y)) {
              toRemoveIds.add(k.id);
              newExplosions.push({ id: Math.random().toString(), x: k.x, y: k.y });
            }
          });
        });
      }

      setGameState(prev => {
        const filteredActive = prev.activeKana.filter(k => k.id !== match.id);
        const filteredStacked = prev.stackedKana.filter(k => !toRemoveIds.has(k.id));

        const charStat = prev.stats.byCharacter[match.char] || { correct: 0, missed: 0, char: match.char, romaji: match.romaji };
        charStat.correct += 1;

        return {
          ...prev,
          activeKana: filteredActive,
          stackedKana: filteredStacked,
          explosions: [...prev.explosions, ...newExplosions],
          score: prev.score + 10 + (newExplosions.length - 1) * 5,
          stats: {
            ...prev.stats,
            correct: prev.stats.correct + 1,
            byCharacter: { ...prev.stats.byCharacter, [match.char]: charStat }
          }
        };
      });
      setInputValue('');

      // Cleanup explosions after animation
      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          explosions: prev.explosions.filter(e => !newExplosions.some(ne => ne.id === e.id))
        }));
      }, 500);
    }
  };

  const getKanaColor = (type: string) => {
    return type === 'hiragana' ? 'bg-pink-300 text-pink-900 border-pink-400' : 'bg-blue-300 text-blue-900 border-blue-400';
  };

  return (
    <div className="min-h-screen flex flex-row items-center justify-center p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pink-100 via-pink-50 to-white overflow-hidden">

      <HistoryPanel history={history} />

      <div className="flex flex-col items-center">
        <div className="w-full max-w-[480px] mb-4 px-2">
          <div className="flex justify-between items-end mb-3">
            <div className="flex flex-col">
              <h1 className="text-4xl font-black text-pink-500 tracking-tight drop-shadow-sm select-none">
                KANA POP! <span className="text-2xl">✨</span>
              </h1>
              <div className="flex gap-2 mt-2 items-center">
                {(['hiragana', 'katakana', 'both'] as KanaMode[]).map(m => (
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
                  className={`absolute flex items-center justify-center text-3xl font-bold rounded-xl border-b-4 transition-transform ${getKanaColor(kana.type)} japanese-font`}
                  style={{
                    width: CELL_SIZE - 4,
                    height: CELL_SIZE - 4,
                    left: kana.x + 2,
                    top: kana.y + 2,
                  }}
                >
                  {kana.char}
                </div>
              ))}

              {gameState.stackedKana.map(kana => (
                <div
                  key={kana.id}
                  className={`absolute flex items-center justify-center text-3xl font-bold rounded-xl border-b-4 ${getKanaColor(kana.type)} japanese-font grayscale-[0.3]`}
                  style={{
                    width: CELL_SIZE - 4,
                    height: CELL_SIZE - 4,
                    left: kana.x + 2,
                    top: kana.y + 2,
                  }}
                >
                  {kana.char}
                </div>
              ))}

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
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">✨</span>
                    <span className="absolute top-0 left-1/4 text-xl">🌸</span>
                    <span className="absolute bottom-0 right-1/4 text-xl">🌸</span>
                  </div>
                </div>
              ))}

              {gameState.souls.map(soul => (
                <div
                  key={soul.id}
                  className="absolute flex items-center justify-center font-bold text-pink-300 opacity-0 pointer-events-none animate-float-up"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    left: soul.x + 2,
                    top: soul.y, // Starts at block position
                    fontSize: '1.5rem',
                  }}
                >
                  {soul.text}
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
            placeholder={gameState.isActive ? "Type romaji..." : "Press Start!"}
            disabled={!gameState.isActive}
            autoFocus
            className="flex-1 bg-white border-4 border-pink-200 rounded-2xl px-6 py-4 text-2xl font-bold text-pink-600 placeholder-pink-200 focus:outline-none focus:border-pink-400 transition-colors shadow-inner"
          />
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
        </div>
      </div>

      {(gameState.isGameOver || showStats) && (
        <StatsModal
          stats={gameState.stats}
          score={gameState.score}
          onClose={() => setShowStats(false)}
          onRestart={() => startGame(gameState.mode, gameState.difficulty)}
        />
      )}
    </div>
  );
};

export default App;
