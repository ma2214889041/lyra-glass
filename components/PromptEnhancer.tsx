
import React, { useState } from 'react';
import { getPromptSuggestions } from '../services/geminiService';
import { AppMode } from '../types';

interface PromptEnhancerProps {
  value: string;
  onChange: (value: string) => void;
  mode: AppMode;
  imageBase64?: string; 
  className?: string;
}

export const PromptEnhancer: React.FC<PromptEnhancerProps> = ({ 
  value, 
  onChange, 
  mode, 
  imageBase64 = '', 
  className = '' 
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setError(null);
    try {
      const newSuggestions = await getPromptSuggestions(mode, imageBase64);
      setSuggestions(newSuggestions);
    } catch (e) {
      setError("暂无灵感");
    } finally {
      setIsSuggesting(false);
    }
  };

  const addSuggestion = (suggestion: string) => {
    onChange(suggestion);
    setSuggestions([]); 
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 当前选中的脚本展示 - 替代原有的输入框 */}
      {value && (
        <div className="animate-fade-in p-5 bg-zinc-900/30 border border-white/5 rounded-[1.5rem] flex justify-between items-center gap-4 group">
          <div className="space-y-1">
            <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block">已选拍摄脚本</span>
            <p className="text-[11px] text-zinc-300 leading-relaxed font-medium italic">“{value}”</p>
          </div>
          <button 
            onClick={() => onChange('')} 
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            title="清除"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={handleSuggest}
          disabled={isSuggesting}
          className="h-11 flex items-center gap-3 px-6 bg-zinc-900/50 text-zinc-400 border border-white/5 rounded-full hover:text-white hover:border-white/20 hover:bg-zinc-800 transition-all duration-300 disabled:opacity-30 active:scale-95"
        >
          {isSuggesting ? (
             <div className="w-3 h-3 border-t-2 border-white rounded-full animate-spin"></div>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
          )}
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">智能拍摄场景建议</span>
        </button>

        {error && <span className="text-[9px] text-red-900 font-black uppercase tracking-widest">{error}</span>}
      </div>

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 gap-2 pt-2 animate-fade-in">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => addSuggestion(s)}
              className="text-[10px] text-left font-bold text-zinc-500 bg-zinc-950/50 px-5 py-4 rounded-2xl hover:bg-white hover:text-black border border-white/5 transition-all active:scale-[0.98] group flex justify-between items-center"
            >
              <span className="flex-1 pr-4 truncate">“{s}”</span>
              <span className="text-[9px] font-black uppercase opacity-0 group-hover:opacity-40 transition-opacity">应用</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
