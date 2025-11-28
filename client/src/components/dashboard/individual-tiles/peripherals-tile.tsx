import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardTitle } from "@/components/ui-custom";
import { GradientButton } from "@/components/ui-custom";
import { Printer } from "lucide-react";

interface PeripheralsTileProps {
  metrics: any;
  onNavigateToAssets: (type: string, category?: string) => void;
}

export function PeripheralsTile({ metrics, onNavigateToAssets }: PeripheralsTileProps) {
  const count = metrics?.peripherals?.overview?.total || 0;

  return (
    <GlassCard className="h-36" glow hover gradient>
      <GlassCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-5 pt-4 border-b-0">
        <div className="space-y-0 min-w-0 flex-1">
          <GlassCardTitle className="text-sm truncate">Peripherals</GlassCardTitle>
          <p className="text-xs text-text-secondary">Accessories</p>
        </div>
        <div className="flex-shrink-0 p-2 rounded-lg bg-[color:var(--color-success)] shadow-sm">
          <Printer className="h-5 w-5 text-white" />
        </div>
      </GlassCardHeader>
      <GlassCardContent className="pt-0 pb-4 px-5">
        <div className="text-3xl font-display font-bold mb-3 text-text-primary" data-testid="text-Peripherals-total">
          {count}
        </div>
        <GradientButton 
          variant="ghost" 
          size="sm" 
          onClick={() => onNavigateToAssets('Peripherals')}
          data-testid="button-view-all-Peripherals"
          className="w-full text-xs h-7 rounded-lg"
        >
          View All
        </GradientButton>
      </GlassCardContent>
    </GlassCard>
  );
}
