import React from 'react';
import { cn } from '@/lib/utils';

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'accent' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
  loading?: boolean;
}

export function GradientButton({
  children,
  variant = 'primary',
  size = 'md',
  glow = false,
  loading = false,
  className,
  disabled,
  ...props
}: GradientButtonProps) {
  const variants = {
    primary: 'bg-gradient-primary text-white hover:opacity-90',
    accent: 'bg-gradient-accent text-white hover:opacity-90',
    success: 'bg-gradient-success text-white hover:opacity-90',
    danger: 'bg-gradient-danger text-white hover:opacity-90',
    ghost: 'bg-transparent border border-border text-text-primary hover:bg-surface-light/60',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={cn(
        // Base styles
        'relative rounded-lg font-medium transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Variant styles
        variants[variant],
        // Size styles
        sizes[size],
        // Glow effect
        glow && 'shadow-sm',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
