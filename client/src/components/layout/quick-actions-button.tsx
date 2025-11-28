import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  Package, 
  Users, 
  Building2,
  Ticket,
  GripVertical
} from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";

function DraggableQuickActions({ position }: { position: { x: number; y: number } }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: 'quick-actions' });

  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const hasAnyAction =
    permissions.canCreateTickets ||
    permissions.canManageAssets ||
    permissions.canManageTeam ||
    permissions.canEditVendors;

  if (!permissions.canUseQuickActions || !hasAnyAction) {
    return null;
  }

  const handleNavigateToAddAsset = () => {
    setLocation("/assets/new");
  };

  const handleNavigateToAddUser = () => {
    setLocation("/users/new");
  };

  const handleNavigateToAddVendor = () => {
    setLocation("/vendors/new");
  };

  const handleNavigateToRaiseTicket = () => {
    setLocation("/tickets?action=create");
  };

  const style = {
    position: 'fixed' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: 40,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center gap-2 group"
      data-testid="quick-actions-container"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 -left-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-background/90 hover:bg-background border border-border/50 shadow-sm"
        data-testid="quick-actions-drag-handle"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
        <Button 
          size="sm"
          style={{
            background: "var(--quick-action-button-bg)",
            borderColor: "var(--quick-action-button-border)",
          }}
          className="rounded-full w-11 h-11 text-[color:var(--quick-action-icon-color)] shadow-lg ring-2 ring-[color:var(--quick-action-button-border)]/40 hover:ring-[color:var(--quick-action-button-border)]/60 transition-all"
          data-testid="button-quick-actions"
        >
          <Plus className="h-5 w-5 text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.25)]" />
        </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-48 border border-border bg-card shadow-sm" data-testid="menu-quick-actions">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Quick Actions
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* Show Raise Ticket for permitted roles */}
          {permissions.canCreateTickets && (
            <DropdownMenuItem 
              onClick={handleNavigateToRaiseTicket}
              className="flex items-center gap-3 cursor-pointer"
              data-testid="menu-item-raise-ticket"
            >
              <Ticket className="h-4 w-4 text-green-500" />
              <div className="flex flex-col">
                <span className="font-medium">Raise Ticket</span>
                <span className="text-xs text-muted-foreground">Support Request</span>
              </div>
            </DropdownMenuItem>
          )}
          
          {permissions.canManageAssets && (
            <DropdownMenuItem 
              onClick={handleNavigateToAddAsset}
              className="flex items-center gap-3 cursor-pointer"
              data-testid="menu-item-add-asset"
            >
              <Package className="h-4 w-4 text-blue-500" />
              <div className="flex flex-col">
                <span className="font-medium">Add Asset</span>
                <span className="text-xs text-muted-foreground">Hardware or Software</span>
              </div>
            </DropdownMenuItem>
          )}
          
          {permissions.canManageTeam && (
            <DropdownMenuItem 
              onClick={handleNavigateToAddUser}
              className="flex items-center gap-3 cursor-pointer"
              data-testid="menu-item-add-user"
            >
              <Users className="h-4 w-4 text-purple-500" />
              <div className="flex flex-col">
                <span className="font-medium">Add User</span>
                <span className="text-xs text-muted-foreground">Team Member</span>
              </div>
            </DropdownMenuItem>
          )}
          
          {permissions.canEditVendors && (
            <DropdownMenuItem 
              onClick={handleNavigateToAddVendor}
              className="flex items-center gap-3 cursor-pointer"
              data-testid="menu-item-add-vendor"
            >
              <Building2 className="h-4 w-4 text-orange-500" />
              <div className="flex flex-col">
                <span className="font-medium">Add Vendor</span>
                <span className="text-xs text-muted-foreground">Supplier Information</span>
              </div>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function QuickActionsButton() {
  const { isAuthenticated } = useAuth();
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('quick-actions-position');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fall through to default
      }
    }
    return { x: 210, y: 120 };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { delta } = event;
    const newPosition = {
      x: Math.max(0, Math.min(window.innerWidth - 80, position.x + delta.x)),
      y: Math.max(0, Math.min(window.innerHeight - 80, position.y + delta.y))
    };
    setPosition(newPosition);
    localStorage.setItem('quick-actions-position', JSON.stringify(newPosition));
  };

  // Don't render if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={['quick-actions']}>
        <DraggableQuickActions position={position} />
      </SortableContext>
    </DndContext>
  );
}
