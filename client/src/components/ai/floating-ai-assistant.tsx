import { useState, useEffect, useRef } from "react";
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
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  if (!user) {
    return null;
  }

  const userDisplayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "You";

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages]);

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
    const trimmedPrompt = prompt.trim();
    setMessages((prev) => [...prev, { role: "user", content: trimmedPrompt }]);
    setPrompt("");

    try {
      const response = await authenticatedRequest("POST", "/api/ai/query", {
        prompt: trimmedPrompt
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantReply = (data.answer || data.summary || "").trim();
      if (assistantReply) {
        setMessages((prev) => [...prev, { role: "assistant", content: assistantReply }]);
      }

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
            setMessages([]);
            setErrorMessage("");
          }
        }}
      >
        <DialogTrigger asChild>
        <Button
          size="sm"
          style={{
            background: "var(--ai-button-bg)",
            borderColor: "var(--ai-button-border)",
          }}
          className="rounded-full w-11 h-11 text-white shadow-lg ring-2 ring-[color:var(--ai-button-border)]/40 hover:ring-[color:var(--ai-button-border)]/60 transition-all"
          data-testid="button-ai-assistant"
        >
          <Bot className="h-5 w-5 text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.25)]" />
        </Button>
        </DialogTrigger>
        
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <div className="flex flex-col h-[70vh]">
            <div className="border-b border-border px-6 py-4 bg-background">
              <DialogHeader className="space-y-2">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-full bg-primary text-primary-foreground">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  ITAM AI Assistant
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Ask questions about assets, licenses, users, tickets, or recommendations. Answers always reference live ITAM data.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-muted/10">
              {!messages.length && !errorMessage && !isLoading ? (
                <div className="flex flex-col items-center text-center space-y-4 mt-6">
                  <div className="p-4 rounded-2xl bg-card border border-border shadow-none">
                    <div className="flex items-center gap-3 text-lg font-semibold">
                      <Sparkles className="h-5 w-5 text-blue-500" />
                      AssetVault Assistant
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      I can summarize asset counts, highlight expiring warranties, or analyze deployment trends. Ask away!
                    </p>
                  </div>
                  <div className="w-full space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Try asking:</p>
                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-lg border border-border px-3 py-2 bg-card">
                        “How many laptops are currently deployed?”
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2 bg-card">
                        “Which software licenses expire next quarter?”
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2 bg-card">
                        “Show me assets in Bangalore with warranties ending soon.”
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2 bg-card">
                        “Summarize open tickets by priority.”
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="w-full max-w-2xl">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Conversation</div>
                    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                      {messages.map((message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          ref={index === messages.length - 1 ? lastMessageRef : undefined}
                          className={`p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line border ${
                            message.role === "user"
                              ? "bg-muted/25 border-border border-l-4 border-l-primary/40"
                              : "bg-card border-border border-l-4 border-l-blue-500/40"
                          }`}
                        >
                          <p className={`text-xs font-semibold tracking-wide mb-1 ${message.role === "user" ? "text-muted-foreground" : "text-blue-200"}`}>
                            {message.role === "user" ? userDisplayName : "ITAM Assistant"}
                          </p>
                          {message.content}
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          Thinking with your ITAM data...
                        </div>
                      )}
                      {errorMessage && (
                        <p className="text-sm text-destructive">
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border/60 bg-background px-6 py-4">
              <div className="space-y-3">
                <Textarea
                  placeholder="Ask about assets, licenses, users, reports, or any ITAM-related question..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[90px] resize-none"
                  disabled={isLoading}
                  data-testid="textarea-ai-prompt"
                />
                
                <div className="flex flex-wrap gap-3 items-center justify-between text-xs text-muted-foreground">
                  <div>
                    {prompt.length > 0 && (
                      <span className={prompt.length > 2000 ? "text-destructive" : ""}>
                        {prompt.length}/2000 chars •{" "}
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
    const defaultPosition = { x: 280, y: 120 };
    
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
