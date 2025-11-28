import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
}

export function StatCard({ title, value, icon, trend, className }: StatCardProps) {
  const isPositive = trend ? trend.value > 0 : null;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-6 shadow-sm",
        className
      )}
    >
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-text-secondary">{title}</p>
            <p className="text-3xl font-display font-bold text-text-primary mt-2">
              {value}
            </p>
          </div>
          {icon && (
            <div className="flex-shrink-0 p-3 rounded-lg bg-primary text-primary-foreground shadow-sm">
              {icon}
            </div>
          )}
        </div>

        {trend && (
          <div className="flex items-center gap-1 mt-4">
            <span
              className={cn(
                'text-sm font-medium',
                isPositive ? 'text-status-success' : 'text-status-danger'
              )}
            >
              {isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
            <span className="text-sm text-text-muted">{trend.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
