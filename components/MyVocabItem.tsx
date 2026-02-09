import React from 'react';
import { Word } from '../words';
import { WordSRSData } from '../types';
import { MASTERY_THRESHOLD } from '../srs';

interface MyVocabItemProps {
    word: Word;
    srsResults?: WordSRSData;
    mnemonic?: string;
    currentSession: number;
    onEditMnemonic: (word: Word) => void;
}

const MyVocabItem: React.FC<MyVocabItemProps> = ({ word, srsResults, mnemonic, currentSession, onEditMnemonic }) => {
    // Determine status
    const level = srsResults?.level || 0;
    let status: 'Hard' | 'Medium' | 'Easy' = 'Hard';
    let statusColor = 'bg-red-100 text-red-800';

    if (level >= 4) {
        status = 'Easy';
        statusColor = 'bg-green-100 text-green-800';
    } else if (level >= 2) {
        status = 'Medium';
        statusColor = 'bg-yellow-100 text-yellow-800';
    }

    // Next Review
    const nextReview = srsResults?.nextReviewSession || 0;
    const sessionsUntil = nextReview - currentSession;
    let nextReviewText = 'Now';
    if (sessionsUntil > 0) {
        nextReviewText = `in ${sessionsUntil} session${sessionsUntil === 1 ? '' : 's'}`;
    } else if (level >= 6) {
        // fully mastered
    }

    // Progress Bar (0 to 6)
    const progressPercent = Math.min(100, (level / 6) * 100);

    // POS Color mapping for chips (lighter backgrounds)
    const posChipColors = {
        Verb: 'bg-red-200 text-red-900',
        Noun: 'bg-blue-200 text-blue-900',
        Adverb: 'bg-purple-200 text-purple-900',
        Adjective: 'bg-pink-200 text-pink-900',
        Other: 'bg-cyan-200 text-cyan-900',
    };

    // POS Color mapping for progress bar (softer/pastel colors)
    const posProgressColors: Record<string, string> = {
        Verb: 'bg-red-300',
        Noun: 'bg-blue-300',
        Adverb: 'bg-purple-300',
        Adjective: 'bg-pink-300',
        Other: 'bg-cyan-300',
    };

    const progressColor = posProgressColors[word.pos] || 'bg-pink-300';

    return (
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-lg shadow-sm hover:shadow-md transition-all p-2 mb-2">

            {/* Top Row: Word & Chips */}
            <div className="flex justify-between items-start">
                <div className="flex items-baseline gap-2 min-w-0 pr-2">
                    <span className="text-2xl font-bold text-gray-800 whitespace-nowrap">{word.kanji || word.kana}</span>
                    <span className="text-base text-gray-500 font-medium">[{word.romaji}]</span>
                </div>

                <div className="flex gap-1 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${posChipColors[word.pos] || 'bg-gray-200'}`}>
                        {word.pos}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${statusColor}`}>
                        {status}
                    </span>
                </div>
            </div>

            {/* Second Row: Meaning & Actions */}
            <div className="flex justify-between items-center mt-1">
                {/* Meaning */}
                <div className="flex-1 min-w-0 mr-2">
                    <div className="text-sm text-gray-600 truncate" title={word.en}>{word.en}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {nextReviewText}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEditMnemonic(word); }}
                        className={`w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors ${mnemonic ? 'text-pink-500 bg-pink-50' : 'text-gray-300'}`}
                        title={mnemonic || "Add Mnemonic"}
                    >
                        {mnemonic ? '📝' : '➕'}
                    </button>
                </div>
            </div>

            {/* Progress Bar (Bottom Border) - Colored by POS */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
                <div
                    className={`h-full transition-all duration-500 ${progressColor}`}
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
        </div>
    );
};

export default MyVocabItem;
