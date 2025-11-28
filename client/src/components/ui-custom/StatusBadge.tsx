import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  variant = 'default',
  size = 'md',
  glow = false,
  className,
}: StatusBadgeProps) {
  const variants = {
    success: 'bg-[rgba(88,213,196,0.18)] text-[var(--color-success)]',
    warning: 'bg-[rgba(255,179,71,0.18)] text-[var(--color-warning)]',
    danger: 'bg-[rgba(243,139,160,0.18)] text-[var(--color-danger)]',
    info: 'bg-[rgba(143,200,255,0.18)] text-[var(--color-info)]',
    default: 'bg-surface-lighter text-text-primary border border-border',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const glowVariants = {
    success: 'shadow-[0_0_16px_rgba(88,213,196,0.4)]',
    warning: 'shadow-[0_0_16px_rgba(255,179,71,0.4)]',
    danger: 'shadow-[0_0_16px_rgba(243,139,160,0.4)]',
    info: 'shadow-[0_0_16px_rgba(143,200,255,0.35)]',
    default: '',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium transition-all duration-300',
        variants[variant],
        sizes[size],
        glow && glowVariants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

interface StatusDotProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  pulse?: boolean;
  className?: string;
}

export function StatusDot({
  variant = 'default',
  pulse = false,
  className,
}: StatusDotProps) {
  const variants = {
    success: 'bg-status-success',
    warning: 'bg-status-warning',
    danger: 'bg-status-danger',
    info: 'bg-status-info',
    default: 'bg-text-muted',
  };

  return (
    <span className="relative inline-flex h-3 w-3">
      {pulse && (
        <span
          className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            variants[variant]
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full h-3 w-3',
          variants[variant],
          className
        )}
      />
    </span>
  );
}
