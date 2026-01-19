
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled, 
  ...props 
}) => {
  const baseStyles = "px-8 py-4 font-black transition-all duration-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 uppercase tracking-widest text-[10px]";
  
  const variants = {
    primary: "bg-white text-black hover:bg-zinc-100 hover:shadow-[0_20px_40px_rgba(255,255,255,0.1)]",
    secondary: "glass text-white hover:bg-zinc-800 border border-white/10",
    outline: "border border-white/20 text-white/60 hover:border-white hover:text-white",
    danger: "bg-red-950/20 text-red-500 border border-red-900/30 hover:bg-red-950/40"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-3">
          <div className="animate-spin h-4 w-4 border border-zinc-500 border-t-transparent rounded-full" />
          Processing
        </span>
      ) : children}
    </button>
  );
};
