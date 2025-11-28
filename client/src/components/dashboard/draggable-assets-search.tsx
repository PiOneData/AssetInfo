import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableAssetsSearchProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  isDraggable?: boolean;
}

function DraggableAssetsSearchInternal({ 
  searchTerm, 
  onSearchTermChange, 
  onSearch, 
  onClearSearch,
  onKeyDown,
  position 
}: DraggableAssetsSearchProps & { position: { x: number; y: number } }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: 'assets-search-draggable' });
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const style = {
    position: 'fixed' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: 45,
    width: '400px',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-xl border border-border bg-card shadow-sm p-3"
      data-testid="draggable-assets-search-container"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 -left-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-background/90 hover:bg-background border border-border/50 shadow-sm"
        data-testid="assets-search-drag-handle"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <button
          type="button"
          onClick={onSearch}
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
          data-testid="button-search-assets"
          title="Search assets"
          aria-label="Search assets"
        >
          <Search className="h-4 w-4" />
        </button>
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Search assets..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="pl-10"
          data-testid="input-search-assets-draggable"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-1 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
            data-testid="button-clear-search-draggable"
            title="Clear search"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// Draggable version with DndContext
function DraggableAssetsSearchWithContext(props: DraggableAssetsSearchProps) {
  const [position, setPosition] = useState(() => {
    const savedPosition = localStorage.getItem('assetsSearchPosition');
    return savedPosition ? JSON.parse(savedPosition) : { x: 100, y: 150 };
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
      x: Math.max(0, Math.min(window.innerWidth - 400, position.x + delta.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, position.y + delta.y))
    };
    setPosition(newPosition);
    localStorage.setItem('assetsSearchPosition', JSON.stringify(newPosition));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={['assets-search-draggable']}>
        <DraggableAssetsSearchInternal position={position} {...props} />
      </SortableContext>
    </DndContext>
  );
}

// Main export
export function DraggableAssetsSearch(props: DraggableAssetsSearchProps) {
  if (props.isDraggable) {
    return <DraggableAssetsSearchWithContext {...props} />;
  }
  
  return null; // Only show when draggable mode is enabled
}
