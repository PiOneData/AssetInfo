import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { authenticatedRequest } from "@/lib/auth";
import { Bot, Send, Sparkles, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useSortable, SortableContext } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function DraggableAIAssistant({ position }: { position: { x: number; y: number } }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: 'ai-assistant' });

  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [answer, setAnswer] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  if (!user) {
    return null;
  }

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty prompt",
        description: "Please enter a question about the ITAM portal.",
        variant: "destructive"
      });
      return;
    }

    if (prompt.length > 2000) {
      toast({
        title: "Prompt too long",
        description: "Please keep your question under 2000 characters.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setAnswer("");
    setSummary("");

    try {
      const response = await authenticatedRequest("POST", "/api/ai/query", {
        prompt: prompt.trim()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setAnswer((data.answer || "").trim());
      setSummary((data.summary || "").trim());
      setPrompt("");

    } catch (error: any) {
      console.error('AI query error:', error);
      setErrorMessage(error?.message || "There was an error processing your request. Please try again.");
      toast({
        title: "AI query failed",
        description: error?.message || "There was an error processing your request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const style = {
    position: 'fixed' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: 60,
  };
  

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center gap-2 group"
      data-testid="ai-assistant-container"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 -left-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-background/90 hover:bg-background border border-border/50 shadow-sm"
        data-testid="ai-assistant-drag-handle"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Main AI Assistant Button */}
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setPrompt("");
            setAnswer("");
            setSummary("");
            setErrorMessage("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="rounded-full w-10 h-10 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            data-testid="button-ai-assistant"
          >
            <Bot className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              ITAM AI Assistant
            </DialogTitle>
            <DialogDescription>
              Ask questions about your IT assets, software licenses, or get optimization recommendations for your ITAM portal.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
              Ask me anything about your IT Asset Management portal. I can help with assets, licenses, reports, recommendations, and more.
            </div>
            
            <div className="space-y-3">
              <Textarea
                placeholder="Ask about assets, licenses, users, reports, or any ITAM-related question..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[100px] resize-none"
                disabled={isLoading}
                data-testid="textarea-ai-prompt"
              />
              
              <div className="flex justify-between items-center">
                <div className="text-xs text-muted-foreground">
                  {prompt.length > 0 && (
                    <span className={prompt.length > 2000 ? "text-destructive" : ""}>
                      {prompt.length}/2000 chars • 
                    </span>
                  )}
                  Press Enter to send, Shift+Enter for new line
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsOpen(false);
                      setPrompt("");
                    }}
                    disabled={isLoading}
                    data-testid="button-ai-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isLoading || !prompt.trim() || prompt.length > 2000}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    data-testid="button-ai-submit"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Thinking...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Ask AI
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            {(answer || summary || errorMessage || isLoading) && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Assistant Response</div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 min-h-[90px]">
                  {isLoading && !answer && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Thinking with your ITAM data...
                    </div>
                  )}
                  {summary && (
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {summary}
                    </p>
                  )}
                  {answer && (
                    <p className="text-sm text-foreground whitespace-pre-line">
                      {answer}
                    </p>
                  )}
                  {errorMessage && (
                    <p className="text-sm text-destructive">
                      {errorMessage}
                    </p>
                  )}
                  {!answer && !errorMessage && !isLoading && (
                    <p className="text-sm text-muted-foreground">
                      Ask a question to see AI-powered insights here.
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Example questions:</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• "How many laptops are currently deployed?"</div>
                <div>• "Which software licenses are expiring soon?"</div>
                <div>• "Generate a report of all assets in Building A"</div>
                <div>• "What are the current IT recommendations?"</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FloatingAIAssistant() {
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('ai-assistant-position');
    const defaultPosition = { x: window.innerWidth - 140, y: 80 };
    
    if (saved) {
      try {
        const parsedPosition = JSON.parse(saved);
        // Safety check: ensure position is within reasonable bounds
        if (parsedPosition.x >= 0 && parsedPosition.x <= window.innerWidth && 
            parsedPosition.y >= 0 && parsedPosition.y <= window.innerHeight) {
          return parsedPosition;
        }
      } catch (error) {
        console.error('Failed to parse AI assistant position:', error);
      }
    }
    
    return defaultPosition;
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
      x: Math.max(0, Math.min(window.innerWidth - 100, position.x + delta.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, position.y + delta.y))
    };
    setPosition(newPosition);
    localStorage.setItem('ai-assistant-position', JSON.stringify(newPosition));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={['ai-assistant']}>
        <DraggableAIAssistant position={position} />
      </SortableContext>
    </DndContext>
  );
}
