
import React from 'react';
import { GameStats } from '../types';

interface StatsModalProps {
  stats: GameStats;
  score: number;
  onClose: () => void;
  onRestart: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ stats, score, onClose, onRestart }) => {
  // Calculate Accuracy: (Unique Kana Correctly Guessed / Total Unique Kana Encountered) * 100
  const uniqueChars = Object.values(stats.byCharacter) as Array<{ correct: number; missed: number; char: string; romaji: string }>;
  const uniqueCorrect = uniqueChars.filter(s => s.correct > 0).length;
  const totalUnique = uniqueChars.length;
  const accuracy = totalUnique > 0 ? Math.round((uniqueCorrect / totalUnique) * 100) : 0;

  const sortedHard = uniqueChars
    .filter(s => s.missed > 0)
    .sort((a, b) => b.missed - a.missed)
    .slice(0, 5);

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
            <span className="block text-xs text-purple-400 mt-1">{uniqueCorrect} of {totalUnique} kana mastered</span>
          </div>

          {sortedHard.length > 0 && (
            <div className="mb-8">
              <h3 className="text-pink-600 font-bold mb-3 flex items-center gap-2">
                <span>🔥</span> Hardest Kana for you:
              </h3>
              <div className="flex gap-2 flex-wrap justify-center">
                {sortedHard.map((s, idx) => (
                  <div key={idx} className="bg-pink-100 px-3 py-2 rounded-xl flex flex-col items-center border border-pink-200 shadow-sm min-w-[60px]">
                    <span className="text-2xl font-bold text-pink-700">{s.char}</span>
                    <span className="text-sm font-bold text-pink-500">{s.romaji}</span>
                    <span className="text-[10px] text-pink-400 mt-1">{s.missed}x miss</span>
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
