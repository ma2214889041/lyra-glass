
import React from 'react';

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, icon, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group cursor-pointer ios-card p-6 lg:p-8 hover:bg-zinc-900/40 hover:scale-[0.99] transition-all duration-500 flex items-center gap-6 lg:gap-8 relative overflow-hidden"
    >
      <div className="w-12 h-12 lg:w-14 lg:h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition-all duration-500 shadow-xl border border-white/5">
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-lg lg:text-xl font-bold tracking-tight text-white">{title}</h3>
        <p className="text-zinc-500 text-xs lg:text-sm leading-relaxed font-light">{description}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-4 transition-all duration-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </div>
    </div>
  );
};