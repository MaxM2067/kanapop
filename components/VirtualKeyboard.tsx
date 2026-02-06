import React from 'react';

interface VirtualKeyboardProps {
    onKeyPress: (key: string) => void;
    onBackspace: () => void;
}

const KEYS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ onKeyPress, onBackspace }) => {
    return (
        <div className="w-full bg-slate-100 p-2 pb-6 border-t-2 border-slate-200 select-none">
            <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                {KEYS.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex justify-center gap-1.5 touch-manipulation">
                        {row.map((key) => (
                            <button
                                key={key}
                                onClick={() => onKeyPress(key)}
                                className="flex-1 min-w-[32px] max-w-[48px] h-12 bg-white rounded-lg shadow-sm border-b-2 border-slate-300 active:border-b-0 active:translate-y-[2px] active:bg-slate-50 text-slate-700 font-bold text-xl uppercase transition-all"
                            >
                                {key}
                            </button>
                        ))}
                        {rowIndex === 2 && (
                            <button
                                onClick={onBackspace}
                                className="flex-[1.5] min-w-[48px] max-w-[72px] h-12 bg-pink-100 rounded-lg shadow-sm border-b-2 border-pink-300 active:border-b-0 active:translate-y-[2px] active:bg-pink-200 text-pink-600 font-bold flex items-center justify-center transition-all"
                            >
                                ⌫
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VirtualKeyboard;
