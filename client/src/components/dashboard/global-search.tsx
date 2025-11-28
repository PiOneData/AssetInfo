import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Package, 
  User, 
  Building2, 
  MapPin, 
  FileText,
  Loader2,
  X,
  GripVertical
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authenticatedRequest } from '@/lib/auth';
import { useDebounce } from '@/hooks/use-debounce';
import { useLocation } from 'wouter';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SearchResult {
  id: string;
  name: string;
  resultType: 'asset' | 'user' | 'vendor' | 'location' | 'license';
  // Asset fields
  type?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  status?: string;
  location?: string;
  assignedUserName?: string;
  // User fields
  email?: string;
  role?: string;
  department?: string;
  // Vendor/Location fields
  assetCount?: number;
  // License fields
  vendor?: string;
  version?: string;
  totalLicenses?: number;
  usedLicenses?: number;
}

interface GlobalSearchProps {
  onResultSelect?: (result: SearchResult) => void;
  placeholder?: string;
  className?: string;
  isDraggable?: boolean;
}

function DraggableGlobalSearch({ position, ...props }: GlobalSearchProps & { position: { x: number; y: number } }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: 'global-search-draggable' });

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
      className="group"
      data-testid="draggable-global-search-container"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 -left-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-background/90 hover:bg-background border border-border/50 shadow-sm"
        data-testid="global-search-drag-handle"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      <GlobalSearchInternal {...props} className="rounded-xl border border-border bg-card shadow-sm p-3" />
    </div>
  );
}

function GlobalSearchInternal({ onResultSelect, placeholder = "Search assets, users, vendors...", className }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const searchRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        document.getElementById('global-search-input')?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = () => {
    const q = query.trim();
    if (q.length >= 2) {
      const params = new URLSearchParams({
        q: q,
        type: selectedType
      });
      navigate(`/search-results?${params.toString()}`);
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };


  return (
    <div
      ref={searchRef}
      className={`relative rounded-xl border border-border bg-card shadow-sm ${className || ''}`}
      data-testid="global-search"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[color:var(--icon-muted)]" />
        <Input
          id="global-search-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.length >= 2);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(query.length >= 2);
          }}
          onBlur={() => setIsFocused(false)}
          className="pl-10 pr-24 sm:pr-28 bg-input text-text-primary placeholder:text-placeholder-text border-input-border focus-visible:ring-ring focus-visible:border-ring"
          data-testid="input-search"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-16 sm:right-20 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSearch}
          className="absolute right-8 sm:right-12 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          data-testid="button-search"
        >
          <Search className="h-3 w-3" />
        </Button>
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-[color:var(--icon-muted)]">
          ⌘K
        </div>
      </div>

      {/* Search Type Filter */}
      {isOpen && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {['all', 'assets', 'users', 'vendors'].map((type) => (
            <Button
              key={type}
              variant={selectedType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedType(type)}
              className="h-6 text-xs capitalize"
              data-testid={`filter-${type}`}
            >
              {type}
            </Button>
          ))}
        </div>
      )}

      {/* Show hint when focused */}
      {isFocused && query.length < 2 && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 shadow-lg border" data-testid="search-hint">
          <CardContent className="p-4">
            <div className="text-center" data-testid="search-instructions">
              <span className="text-sm text-muted-foreground">
                Type at least 2 characters and press Enter or click <Search className="inline h-3 w-3 mx-1" /> to search
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Main export with draggable functionality
export function GlobalSearch(props: GlobalSearchProps) {
  // Check if draggable mode is requested
  if (props.isDraggable) {
    return <DraggableGlobalSearchWithContext {...props} />;
  }
  
  // Regular non-draggable version
  return <GlobalSearchInternal {...props} />;
}

// Draggable version with DndContext
function DraggableGlobalSearchWithContext(props: GlobalSearchProps) {
  const [position, setPosition] = useState(() => {
    const savedPosition = localStorage.getItem('globalSearchPosition');
    return savedPosition ? JSON.parse(savedPosition) : { x: 50, y: 100 };
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
    localStorage.setItem('globalSearchPosition', JSON.stringify(newPosition));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={['global-search-draggable']}>
        <DraggableGlobalSearch position={position} {...props} />
      </SortableContext>
    </DndContext>
  );
}
