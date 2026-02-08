
import React from 'react';
import { GameStats, WordSRS } from '../types';
import { MASTERY_THRESHOLD } from '../srs';
import { WORDS } from '../words';

interface StatsModalProps {
  stats: GameStats;
  score: number;
  wordSRS?: WordSRS;
  onClose: () => void;
  onRestart: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ stats, score, wordSRS, onClose, onRestart }) => {
  // Calculate Accuracy: (Unique Kana/Words Correctly Guessed / Total Unique Encountered) * 100
  const charStats = Object.values(stats.byCharacter).map((s: any) => ({
    ...s,
    type: 'char',
    display: s.char,
    sub: s.romaji,
    missed: s.missed,
    correct: s.correct
  }));

  const wordStats = stats.byWord ? Object.values(stats.byWord).map((s: any) => ({
    ...s,
    type: 'word',
    display: s.kanji,
    sub: `${s.romaji} (${s.en})`,
    missed: s.missed,
    correct: s.correct
  })) : [];

  const allStats = [...charStats, ...wordStats];

  const uniqueCorrect = allStats.filter(s => s.correct > 0).length;
  const totalUnique = allStats.length;
  const accuracy = totalUnique > 0 ? Math.round((uniqueCorrect / totalUnique) * 100) : 0;

  const sortedHard = allStats
    .filter(s => s.missed > 0)
    .sort((a, b) => b.missed - a.missed)
    .slice(0, 5);

  const masteredWords = wordSRS
    ? Object.entries(wordSRS)
      .filter(([_, data]) => (data as { level: number }).level >= MASTERY_THRESHOLD)
      .map(([id]) => WORDS.find(w => w.id === id))
      .filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border-4 border-pink-200">
        <div className="bg-pink-400 p-6 text-white text-center">
          <h2 className="text-3xl font-bold mb-1">Game Over! ✨</h2>
          <p className="opacity-90">You did great!</p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-2xl text-center">
              <span className="block text-blue-500 text-sm font-semibold uppercase tracking-wider">Score</span>
              <span className="text-4xl font-bold text-blue-800">{score}</span>
            </div>
            <div className="bg-green-50 p-4 rounded-2xl text-center">
              <span className="block text-green-500 text-sm font-semibold uppercase tracking-wider">Correct</span>
              <span className="text-4xl font-bold text-green-800">{stats.correct}</span>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-2xl text-center mb-8 border border-purple-100">
            <span className="block text-purple-500 text-sm font-semibold uppercase tracking-wider">Accuracy (Unique)</span>
            <span className="text-4xl font-bold text-purple-800">{accuracy}%</span>
            <span className="block text-xs text-purple-400 mt-1">{uniqueCorrect} of {totalUnique} items mastered</span>
          </div>

          {sortedHard.length > 0 && (
            <div className="mb-8">
              <h3 className="text-pink-600 font-bold mb-3 flex items-center gap-2">
                <span>🔥</span> Hardest Items for you:
              </h3>
              <div className="flex gap-2 flex-wrap justify-center">
                {sortedHard.map((s, idx) => (
                  <div key={idx} className="bg-pink-100 px-3 py-2 rounded-xl flex flex-col items-center border border-pink-200 shadow-sm min-w-[80px]">
                    <span className="text-xl font-bold text-pink-700">{s.display}</span>
                    <span className="text-xs font-bold text-pink-500">{s.sub}</span>
                    <span className="text-[10px] text-pink-400 mt-1">{s.missed}x miss</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {masteredWords.length > 0 && (
            <div className="mb-6">
              <h3 className="text-green-600 font-bold mb-3 flex items-center gap-2">
                <span>🎓</span> Learned Words:
              </h3>
              <div className="max-h-[120px] overflow-y-auto grid grid-cols-2 gap-2 pr-2">
                {masteredWords.map((w, idx) => (
                  <div key={idx} className="bg-green-50 p-2 rounded-lg border border-green-200 flex flex-col items-center">
                    <span className="font-bold text-green-800">{w!.kanji}</span>
                    <span className="text-xs text-green-600">{w!.romaji}</span>
                    <span className="text-[10px] text-green-500">{w!.en}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={onRestart}
              className="w-full bg-pink-400 hover:bg-pink-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95"
            >
              Play Again 🎮
            </button>
            <button
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl transition-all"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsModal;
