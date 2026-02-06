import React from 'react';
import { GameHistoryItem } from '../types';

interface HistoryPanelProps {
    history: GameHistoryItem[];
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history }) => {
    if (history.length === 0) return null;

    return (
        <div className="hidden lg:flex flex-col w-64 h-[600px] mr-6 bg-white/80 rounded-3xl p-4 border-2 border-pink-100 shadow-xl overflow-hidden backdrop-blur-sm">
            <h3 className="text-pink-500 font-black text-lg mb-4 flex items-center gap-2">
                <span>📜</span> History
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-pink-200">
                {history.slice().reverse().map((item) => (
                    <div key={item.id} className="bg-white p-3 rounded-xl border border-pink-50 shadow-sm hover:border-pink-200 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-pink-400 font-bold uppercase">
                                {new Date(item.date).toLocaleDateString()}
                            </span>
                            <span className="text-[10px] text-pink-300">
                                {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Score</div>
                                <div className="text-xl font-black text-slate-600 leading-none">{item.score}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-purple-400 font-bold uppercase tracking-wider">Acc</div>
                                <div className="text-lg font-bold text-purple-600 leading-none">{item.accuracy}%</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HistoryPanel;
