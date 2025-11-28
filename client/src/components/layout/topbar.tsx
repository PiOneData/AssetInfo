import { Button } from "@/components/ui/button";
import { Plus, Upload, Move, RotateCcw, Sun, Moon } from "lucide-react";
import { RoleNotifications } from "@/components/notifications/role-notifications";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  description: string;
  onAddClick?: () => void;
  showAddButton?: boolean;
  addButtonText?: string;
  onBulkUploadClick?: () => void;
  showDragToggle?: boolean;
  isDragMode?: boolean;
  onToggleDragMode?: () => void;
  onResetAll?: () => void;
  addButtonClassName?: string;
}

export function TopBar({ 
  title, 
  description, 
  onAddClick, 
  showAddButton = true,
  addButtonText = "Add Asset",
  onBulkUploadClick,
  showDragToggle = false,
  isDragMode = false,
  onToggleDragMode,
  onResetAll,
  addButtonClassName
}: TopBarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-[color:var(--topbar-background)] border-b border-border shadow-[var(--topbar-shadow)] px-4 sm:px-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between">
        {/* Left Side: Title and Description */}
        <div className="flex items-center space-x-6 min-w-0 flex-1">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-display font-semibold text-text-primary truncate">{title}</h2>
            <p className="text-text-secondary text-xs sm:text-sm truncate">{description}</p>
          </div>
        </div>
        
        {/* Right Side: Global Search and Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-end">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              aria-pressed={theme === "light"}
              className={cn(
                "theme-toggle group flex-1 sm:flex-none rounded-lg border-border bg-card text-foreground transition-colors duration-200",
                theme === "light"
                  ? "hover:bg-[rgba(0,0,0,0.06)] hover:text-[#1A1A1A]"
                  : "hover:bg-[rgba(255,255,255,0.12)] hover:text-white"
              )}
            >
              {theme === "dark" ? (
                <Sun className="mr-1 sm:mr-2 h-4 w-4 transition-colors duration-200 group-hover:text-[#1A1A1A]" />
              ) : (
                <Moon className="mr-1 sm:mr-2 h-4 w-4 transition-colors duration-200 group-hover:text-white" />
              )}
              <span className="hidden sm:inline">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
              <span className="sm:hidden">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>
            <RoleNotifications />
            {onBulkUploadClick && (
              <Button 
                variant="outline" 
                onClick={onBulkUploadClick} 
                data-testid="button-bulk-upload"
                size="sm"
                className="flex-1 sm:flex-none rounded-lg border-border bg-card text-foreground hover:bg-surface-light"
              >
                <Upload className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Bulk Upload</span>
                <span className="sm:hidden">Upload</span>
              </Button>
            )}
            {showAddButton && onAddClick && (
              <Button 
                onClick={onAddClick} 
                data-testid="button-add-asset" 
                size="sm"
                className={cn(
                  "flex-1 sm:flex-none rounded-full px-6 transition-all",
                  theme === "light"
                    ? "bg-[linear-gradient(145deg,#4f5bd6,#3a48b5)] border border-[#a8b1ff] shadow-[0_18px_32px_rgba(57,70,140,0.45)] !text-white text-white"
                    : "bg-[linear-gradient(145deg,rgba(118,133,208,0.3),rgba(37,45,89,0.9))] border border-white/10 shadow-[0_12px_25px_rgba(18,24,38,0.45)] text-white",
                  addButtonClassName
                )}
              >
                <Plus className="mr-1 sm:mr-2 h-4 w-4 text-white" />
                <span className="hidden sm:inline text-white">{addButtonText}</span>
                <span className="sm:hidden text-white">Add</span>
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Drag Toggle and Reset - positioned in top right edge below main header */}
      {showDragToggle && onToggleDragMode && (
        <div className="flex justify-end pt-2 gap-2">
          {/* Reset All Button - always takes up space to maintain consistent drag toggle position */}
          <Button
            variant="outline"
            size="sm"
            onClick={onResetAll}
            data-testid="reset-all-tiles"
            className={`text-xs h-6 px-3 text-muted-foreground hover:text-foreground ${
              isDragMode && onResetAll ? 'visible' : 'invisible'
            }`}
            title="Reset all dashboard tiles to default positions"
            disabled={!isDragMode || !onResetAll}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset All
          </Button>
          <Button
            variant={isDragMode ? "default" : "outline"}
            size="sm"
            onClick={onToggleDragMode}
            data-testid="toggle-drag-mode"
            className="text-xs h-6 px-3"
          >
            <Move className="h-3 w-3 mr-1" />
            Drag
          </Button>
        </div>
      )}
    </header>
  );
}
