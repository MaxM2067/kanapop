import React, { useState, useMemo } from 'react';
import { WORDS, Word } from '../words';
import { WordSRS, MnemonicRecord } from '../types';
import MyVocabItem from './MyVocabItem';

interface MyVocabPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onToggle?: () => void; // Optional for backward compatibility if needed, but App provides it
    wordSRS: WordSRS;
    mnemonics: MnemonicRecord;
    currentSession: number;
    onEditMnemonic: (word: Word) => void;
}

type SortOption = 'recent' | 'oldest' | 'status_asc' | 'status_desc' | 'romaji';

const MyVocabPanel: React.FC<MyVocabPanelProps> = ({
    isOpen,
    onClose,
    onToggle,
    wordSRS,
    mnemonics,
    currentSession,
    onEditMnemonic
}) => {
    const [sortMode, setSortMode] = useState<SortOption>('recent');

    // Filter words that have SRS data (are learned/in-progress)
    const learningWords = useMemo(() => {
        return WORDS.filter(w => wordSRS[w.id]);
    }, [wordSRS]);

    const sortedWords = useMemo(() => {
        return [...learningWords].sort((a, b) => {
            const srsA = wordSRS[a.id];
            const srsB = wordSRS[b.id];

            switch (sortMode) {
                case 'recent':
                    // Higher session = more recent
                    return (srsB?.lastAttemptSession || 0) - (srsA?.lastAttemptSession || 0);
                case 'oldest':
                    return (srsA?.lastAttemptSession || 0) - (srsB?.lastAttemptSession || 0);
                case 'status_asc':
                    return (srsA?.level || 0) - (srsB?.level || 0);
                case 'status_desc':
                    return (srsB?.level || 0) - (srsA?.level || 0);
                case 'romaji':
                    return a.romaji.localeCompare(b.romaji);
                default:
                    return 0;
            }
        });
    }, [learningWords, wordSRS, sortMode]);

    // If not open, render collapsed header on Desktop (hidden on mobile)
    if (!isOpen) {
        return (
            <>
                {/* 
                  Wrapper:
                  - Desktop: w-96 (same width), h-[600px] (same height as open state) 
                    -> keeps layout consistent, header aligns top.
                  - pointer-events-none: wrapper itself doesn't block clicks in empty space.
                */}
                <div className="hidden lg:flex fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:w-96 lg:h-[600px] lg:ml-6 flex-col pointer-events-none transition-all duration-300">
                    {/* 
                      Header content:
                      - pointer-events-auto: visible card is interactive.
                    */}
                    <div
                        className="w-full bg-white/80 backdrop-blur-md shadow-md rounded-2xl border-2 border-pink-100 flex items-center justify-between p-4 cursor-pointer hover:bg-pink-50 transition-colors pointer-events-auto"
                        onClick={onToggle || onClose}
                    >
                        <div>
                            <h2 className="text-xl font-bold text-pink-600 flex items-center gap-2">
                                <span>📚</span> My Vocab
                            </h2>
                            <p className="text-xs text-pink-400 font-medium">{learningWords.length} words collected</p>
                        </div>
                        <button className="text-pink-400 hover:text-pink-600 font-bold text-sm uppercase px-2 py-1 rounded hover:bg-pink-100 transition-colors">
                            Show
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:w-96 lg:h-[600px] lg:ml-6 flex flex-col pointer-events-none lg:pointer-events-auto transition-all duration-300">

            {/* Mobile Overlay Background (clickable to close) */}
            <div
                className="absolute inset-0 bg-black/40 lg:hidden pointer-events-auto backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Panel Content */}
            <div className="absolute right-0 top-0 bottom-0 w-full sm:w-96 lg:static lg:w-full lg:h-full bg-white/95 lg:bg-white/80 backdrop-blur-md shadow-xl lg:shadow-xl flex flex-col pointer-events-auto lg:rounded-3xl lg:border-2 lg:border-pink-100 transition-transform duration-300">

                {/* Header */}
                <div className="p-4 border-b border-pink-100 flex items-center justify-between bg-pink-50/80">
                    <div>
                        <h2 className="text-xl font-bold text-pink-600 flex items-center gap-2">
                            <span>📚</span> My Vocab
                        </h2>
                        <p className="text-xs text-pink-400 font-medium">{learningWords.length} words collected</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Sort Dropdown */}
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as SortOption)}
                            className="text-xs border-pink-200 rounded-full px-2 py-1 bg-white text-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-300"
                        >
                            <option value="recent">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="status_asc">Hardest</option>
                            <option value="status_desc">Easiest</option>
                            <option value="romaji">A-Z</option>
                        </select>

                        {/* Desktop Hide Button / Mobile Close */}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 flex items-center gap-1"
                            title="Hide"
                        >
                            <span className="hidden lg:inline text-xs font-bold uppercase">Hide</span>
                            <span className="lg:hidden">✕</span>
                        </button>
                    </div>
                </div>

                {/* Scrollable List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-pink-200 scrollbar-track-transparent">
                    {sortedWords.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">
                            <div className="text-4xl mb-2">🍃</div>
                            No words yet.<br />Play "Words" mode to collect!
                        </div>
                    ) : (
                        sortedWords.map(word => (
                            <MyVocabItem
                                key={word.id}
                                word={word}
                                srsResults={wordSRS[word.id]}
                                mnemonic={mnemonics[word.id]}
                                currentSession={currentSession}
                                onEditMnemonic={onEditMnemonic}
                            />
                        ))
                    )}
                </div>

            </div>
        </div>
    );
};

export default MyVocabPanel;
