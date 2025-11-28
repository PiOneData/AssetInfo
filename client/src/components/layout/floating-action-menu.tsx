import { useState } from "react";
import { Plus, Ticket, Package, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export function FloatingActionMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // Don't show for technicians (they can't create tickets or assets)
  if (!user || user.role === "technician") {
    return null;
  }

  const actions = [
    {
      icon: Ticket,
      label: "Raise Ticket",
      onClick: () => {
        setIsOpen(false);
        navigate("/tickets?action=create");
      },
      bgClass: "bg-blue-500 hover:bg-blue-600",
      show: user.role !== "technician", // Employees, managers, admins
    },
    {
      icon: Package,
      label: "Add Asset",
      onClick: () => {
        setIsOpen(false);
        navigate("/assets?action=create");
      },
      bgClass: "bg-purple-500 hover:bg-purple-600",
      show: true,
    },
  ];

  const visibleActions = actions.filter(action => action.show);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      {/* Action Items */}
      {isOpen && visibleActions.map((action, index) => (
        <div 
          key={index}
          className="flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <span className="bg-card text-foreground text-xs px-3 py-1.5 rounded-lg border border-border shadow-sm whitespace-nowrap">
            {action.label}
          </span>
          <Button
            size="sm"
            onClick={action.onClick}
            className={`rounded-full w-12 h-12 shadow-sm ${action.bgClass} text-white`}
          >
            <action.icon className="h-5 w-5" />
          </Button>
        </div>
      ))}

      {/* Main Toggle Button */}
      <Button
        size="lg"
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full w-14 h-14 shadow-sm transition-colors duration-200 ${
          isOpen 
            ? "bg-red-500 hover:bg-red-600 rotate-45" 
            : "bg-primary hover:bg-primary/90"
        }`}
      >
        {isOpen ? (
          <X className="h-6 w-6 -rotate-45" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
