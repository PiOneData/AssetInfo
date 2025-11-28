import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  gradient?: boolean;
}

export function GlassCard({ 
  children, 
  className, 
  hover = true, 
  glow = false,
  gradient = false 
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card text-card-foreground shadow-sm transition-none',
        hover && 'hover:shadow',
        className
      )}
    >
      {children}
    </div>
  );
}

interface GlassCardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCardHeader({ children, className }: GlassCardHeaderProps) {
  return (
    <div className={cn('p-6 border-b border-border', className)}>
      {children}
    </div>
  );
}

interface GlassCardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCardContent({ children, className }: GlassCardContentProps) {
  return (
    <div className={cn('p-6', className)}>
      {children}
    </div>
  );
}

interface GlassCardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCardTitle({ children, className }: GlassCardTitleProps) {
  return (
    <h3 className={cn('text-xl font-display font-semibold text-text-primary', className)}>
      {children}
    </h3>
  );
}

interface GlassCardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCardDescription({ children, className }: GlassCardDescriptionProps) {
  return (
    <p className={cn('text-sm text-text-secondary mt-1', className)}>
      {children}
    </p>
  );
}
