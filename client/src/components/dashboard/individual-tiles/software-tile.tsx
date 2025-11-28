import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardTitle } from "@/components/ui-custom";
import { GradientButton } from "@/components/ui-custom";
import { Code } from "lucide-react";

interface SoftwareTileProps {
  metrics: any;
  onNavigateToAssets: (type: string, category?: string) => void;
}

export function SoftwareTile({ metrics, onNavigateToAssets }: SoftwareTileProps) {
  const count = metrics?.software?.overview?.total || 0;

  return (
    <GlassCard className="h-36" glow hover gradient>
      <GlassCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-5 pt-4 border-b-0">
        <div className="space-y-0 min-w-0 flex-1">
          <GlassCardTitle className="text-sm truncate">Software</GlassCardTitle>
          <p className="text-xs text-text-secondary">Applications</p>
        </div>
        <div className="flex-shrink-0 p-2 rounded-lg bg-accent shadow-sm">
          <Code className="h-5 w-5 text-white" />
        </div>
      </GlassCardHeader>
      <GlassCardContent className="pt-0 pb-4 px-5">
        <div className="text-3xl font-display font-bold mb-3 text-text-primary" data-testid="text-Software-total">
          {count}
        </div>
        <GradientButton 
          variant="ghost" 
          size="sm" 
          onClick={() => onNavigateToAssets('Software')}
          data-testid="button-view-all-Software"
          className="w-full text-xs h-7 rounded-lg"
        >
          View All
        </GradientButton>
      </GlassCardContent>
    </GlassCard>
  );
}
