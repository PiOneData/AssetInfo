import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, User, MessageSquare, AlertCircle, UserPlus, CheckCircle, MoreVertical, Edit, Trash2, XCircle, MessageCircle } from "lucide-react";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import type { Ticket } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface TicketCardProps {
  ticket: Ticket;
  onClick?: () => void;
  className?: string;
  onAssign?: (ticketId: string) => void;
  onUpdateStatus?: (ticketId: string) => void;
  onEdit?: (ticketId: string) => void;
  onDelete?: (ticketId: string) => void;
  onClose?: (ticketId: string) => void;
  onComment?: (ticketId: string) => void;
}

export function TicketCard({ ticket, onClick, className, onAssign, onUpdateStatus, onEdit, onDelete, onClose, onComment }: TicketCardProps) {
  const canComment = Boolean(onComment);
  const hasMenuActions = Boolean(
    (onComment) ||
    (onEdit && ticket.status !== "closed") ||
    (onClose && ticket.status !== "closed") ||
    onDelete
  );
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "hardware":
        return "🖥️";
      case "software":
        return "💻";
      case "network":
        return "🌐";
      case "access":
        return "🔐";
      case "general":
      default:
        return "📋";
    }
  };

  return (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-shadow ${className}`}
      onClick={onClick}
      data-testid={`card-ticket-${ticket.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getCategoryIcon(ticket.category)}</span>
            <div>
              <h3 
                className="font-semibold text-base line-clamp-1"
                data-testid={`text-ticket-title-${ticket.id}`}
              >
                {ticket.title}
              </h3>
              <p 
                className="text-xs text-muted-foreground"
                data-testid={`text-ticket-number-${ticket.id}`}
              >
                #{ticket.ticketNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <TicketPriorityBadge priority={ticket.priority as any} />
            <TicketStatusBadge status={ticket.status as any} />
            
            {/* Action Menu */}
            {hasMenuActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {onComment && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onComment(ticket.id);
                    }}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Comment
                    </DropdownMenuItem>
                  )}
                  
                  {onEdit && ticket.status !== 'closed' && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onEdit(ticket.id);
                    }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Ticket
                    </DropdownMenuItem>
                  )}
                  
                  {onClose && ticket.status !== 'closed' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onClose(ticket.id);
                      }}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Close Ticket
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(ticket.id);
                        }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Ticket
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p 
          className="text-sm text-muted-foreground line-clamp-2 mb-3"
          data-testid={`text-ticket-description-${ticket.id}`}
        >
          {ticket.description}
        </p>

        {ticket.assetName && (
          <div className="flex items-center text-xs text-muted-foreground mb-2">
            <AlertCircle className="h-3 w-3 mr-1" />
            <span data-testid={`text-ticket-asset-${ticket.id}`}>
              Related to: {ticket.assetName}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-3">
            <div className="flex items-center">
              <User className="h-3 w-3 mr-1" />
              <span data-testid={`text-ticket-requestor-${ticket.id}`}>
                {ticket.requestorName}
              </span>
            </div>
            {ticket.assignedToName && (
              <div className="flex items-center">
                <Avatar className="h-4 w-4 mr-1">
                  <AvatarFallback className="text-xs">
                    {getInitials(ticket.assignedToName)}
                  </AvatarFallback>
                </Avatar>
                <span data-testid={`text-ticket-assignee-${ticket.id}`}>
                  {ticket.assignedToName}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            <span data-testid={`text-ticket-created-${ticket.id}`}>
              {formatDistanceToNow(new Date(ticket.createdAt || new Date()), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-2">
            <Badge 
              variant="outline" 
              className="text-xs"
              data-testid={`badge-category-${ticket.id}`}
            >
              {ticket.category}
            </Badge>
            {canComment && onComment && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onComment(ticket.id);
                }}
                className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                <span data-testid={`text-ticket-comments-${ticket.id}`}>
                  Comments
                </span>
              </button>
            )}
            {!canComment && (
              <div className="flex items-center text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3 mr-1" />
                <span data-testid={`text-ticket-comments-${ticket.id}`}>
                  Comments
                </span>
              </div>
            )}
          </div>
          
          {/* Role-based action buttons */}
          <div className="flex items-center space-x-2">
            {/* Assignment button for roles with assign permission */}
            {onAssign && 
             !ticket.assignedToId && 
             ticket.status !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssign?.(ticket.id);
                }}
                data-testid={`button-assign-${ticket.id}`}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Assign
              </Button>
            )}
            
            {/* Status update button for roles with update permission */}
            {onUpdateStatus && 
             ticket.status !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStatus?.(ticket.id);
                }}
                data-testid={`button-update-status-${ticket.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Update
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
