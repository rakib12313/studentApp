import React from 'react';
import { X, Loader2 } from 'lucide-react';

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; subtitle?: string; action?: React.ReactNode }> = ({ children, className = '', title, subtitle, action }) => (
    <div className={`glass-card rounded-2xl p-6 ${className}`}>
        {(title || action) && (
            <div className="flex justify-between items-start mb-6">
                <div>
                    {title && <h3 className="text-xl font-heading font-bold text-white tracking-tight">{title}</h3>}
                    {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
                </div>
                {action && <div>{action}</div>}
            </div>
        )}
        {children}
    </div>
);

// --- Buttons ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'danger' | 'success' | 'ghost' | 'glass';
    isLoading?: boolean;
    size?: 'sm' | 'md' | 'lg';
}
export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', size = 'md', className = '', isLoading, ...props }) => {
    const base = "font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide rounded-xl relative overflow-hidden group";
    
    const sizes = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-5 py-2.5 text-sm",
        lg: "px-8 py-3.5 text-base font-semibold"
    };

    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] border border-blue-500/50",
        danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30",
        success: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-500/50",
        ghost: "hover:bg-white/10 text-gray-300 hover:text-white",
        glass: "bg-white/5 hover:bg-white/10 text-white border border-white/10 backdrop-blur-md"
    };

    return (
        <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            <span className="relative z-10 flex items-center gap-2">{children}</span>
        </button>
    );
};

// --- Inputs ---
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input className="glass-input w-full px-4 py-3.5 rounded-xl mb-3 placeholder-gray-500 text-sm focus:ring-2 focus:ring-blue-500/50 transition-all" {...props} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <div className="relative mb-3">
        <select className="glass-input w-full px-4 py-3.5 rounded-xl text-sm appearance-none cursor-pointer" {...props}>
            {props.children}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
    </div>
);

// --- Modal ---
export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-lg rounded-2xl p-0 shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden border border-white/10">
                <div className="flex justify-between items-center p-6 border-b border-white/5 bg-white/5">
                    <h2 className="text-lg font-heading font-bold text-white tracking-tight">{title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- Badge ---
export const Badge: React.FC<{ children: React.ReactNode; variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = ({ children, variant = 'info' }) => {
    const colors = {
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20"
    };
    return (
        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${colors[variant]}`}>
            {children}
        </span>
    );
};

// --- Skeleton Loader ---
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`animate-pulse bg-white/5 rounded-lg ${className}`}></div>
);

// --- Progress Bar ---
export const ProgressBar: React.FC<{ value: number; max: number; color?: string; className?: string }> = ({ value, max, color = "bg-blue-500", className }) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className={`h-2 w-full bg-white/5 rounded-full overflow-hidden ${className}`}>
            <div style={{ width: `${percentage}%` }} className={`h-full ${color} transition-all duration-1000 ease-out shadow-[0_0_10px_currentColor]`}></div>
        </div>
    );
}