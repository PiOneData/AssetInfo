import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Filter, Plus } from "lucide-react";
import { TicketCard } from "./ticket-card";
import { TicketCommentDialog } from "./ticket-comment-dialog";
import { TicketEditDialog } from "./ticket-edit-dialog";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { authenticatedRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Ticket } from "@shared/schema";

interface TicketListProps {
  onTicketClick?: (ticket: Ticket) => void;
  onCreateTicket?: () => void;
  showCreateButton?: boolean;
  title?: string;
}

export function TicketList({ 
  onTicketClick, 
  onCreateTicket, 
  showCreateButton = true,
  title = "Support Tickets" 
}: TicketListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const permissions = getRolePermissions(user?.role);

  const ensurePermission = (can: boolean, description: string) => {
    if (can) return true;
    toast({
      title: "Insufficient permissions",
      description,
      variant: "destructive",
    });
    return false;
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  
  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string>("");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  
  // Status update dialog state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [resolution, setResolution] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");

  // Delete and Close confirmation dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<string>("");
  const [ticketToClose, setTicketToClose] = useState<string>("");

  // Comment dialog state
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentTicketId, setCommentTicketId] = useState<string>("");
  const [commentTicketNumber, setCommentTicketNumber] = useState<string>("");

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [ticketToEdit, setTicketToEdit] = useState<Ticket | null>(null);

  // Backend handles role-based filtering automatically using JWT token
  const apiUrl = '/api/tickets';

  const { data: tickets = [], isLoading, error } = useQuery<Ticket[]>({
    queryKey: [apiUrl, user?.id, user?.role], // Role-aware cache to prevent cross-user data leakage
    queryFn: async () => {
      const response = await authenticatedRequest("GET", apiUrl);
      return response.json();
    },
    enabled: !!user, // Only fetch when user is authenticated
    refetchOnMount: "always", // Ensure fresh data on component mount
  });

  // Get technicians for assignment dropdown  
  const { data: technicians = [] } = useQuery({
    queryKey: ['/api/users/technicians'],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/users/technicians");
      return response.json();
    },
    enabled: !!user && permissions.canAssignTickets,
  });

  // Assignment mutation
  const assignTicketMutation = useMutation({
    mutationFn: async ({ ticketId, assigneeId, assigneeName }: { ticketId: string, assigneeId: string, assigneeName: string }) => {
      const response = await authenticatedRequest("PUT", `/api/tickets/${ticketId}/assign`, {
        assignedToId: assigneeId,
        assignedToName: assigneeName,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      toast({
        title: "Ticket assigned",
        description: "Ticket has been successfully assigned.",
      });
      setAssignDialogOpen(false);
      setSelectedTicketId("");
      setSelectedAssignee("");
    },
    onError: () => {
      toast({
        title: "Assignment failed",
        description: "Failed to assign ticket. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status, resolution, resolutionNotes }: { ticketId: string, status: string, resolution?: string, resolutionNotes?: string }) => {
      const response = await authenticatedRequest("PUT", `/api/tickets/${ticketId}/status`, {
        status,
        resolution,
        resolutionNotes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      toast({
        title: "Status updated",
        description: "Ticket status has been successfully updated.",
      });
      setStatusDialogOpen(false);
      setSelectedTicketId("");
      setSelectedStatus("");
      setResolution("");
      setResolutionNotes("");
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update ticket status. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleAssignTicket = (ticketId: string) => {
    if (!ensurePermission(permissions.canAssignTickets, "Only admins and IT managers can assign tickets.")) {
      return;
    }
    setSelectedTicketId(ticketId);
    setAssignDialogOpen(true);
  };

  const handleUpdateStatus = (ticketId: string) => {
    if (!ensurePermission(permissions.canUpdateTicketStatus, "You cannot update ticket status.")) {
      return;
    }
    setSelectedTicketId(ticketId);
    setStatusDialogOpen(true);
  };

  const handleAssignSubmit = () => {
    if (!ensurePermission(permissions.canAssignTickets, "Only admins and IT managers can assign tickets.")) {
      return;
    }
    if (!selectedAssignee || !selectedTicketId) return;
    
    const assignee = technicians.find((tech: any) => tech.id === selectedAssignee);
    if (!assignee) return;
    
    assignTicketMutation.mutate({
      ticketId: selectedTicketId,
      assigneeId: selectedAssignee,
      assigneeName: `${assignee.firstName} ${assignee.lastName}`,
    });
  };

  const handleStatusSubmit = () => {
    if (!ensurePermission(permissions.canUpdateTicketStatus, "You cannot update ticket status.")) {
      return;
    }
    if (!selectedStatus || !selectedTicketId) return;
    
    updateStatusMutation.mutate({
      ticketId: selectedTicketId,
      status: selectedStatus,
      resolution: resolution || undefined,
      resolutionNotes: resolutionNotes || undefined,
    });
  };

  // New action handlers
  const handleEditTicket = (ticketId: string) => {
    if (!ensurePermission(permissions.canEditTickets, "You cannot edit tickets.")) {
      return;
    }
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      setTicketToEdit(ticket);
      setEditDialogOpen(true);
    }
  };

  const handleDeleteTicket = (ticketId: string) => {
    if (!ensurePermission(permissions.canDeleteTickets, "Only admins can delete tickets.")) {
      return;
    }
    setTicketToDelete(ticketId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTicket = async () => {
    if (!ensurePermission(permissions.canDeleteTickets, "Only admins can delete tickets.")) {
      setDeleteDialogOpen(false);
      setTicketToDelete("");
      return;
    }
    if (!ticketToDelete) return;
    
    try {
      await authenticatedRequest("DELETE", `/api/tickets/${ticketToDelete}`);
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      toast({
        title: "Ticket deleted",
        description: "The ticket has been successfully deleted.",
      });
      setDeleteDialogOpen(false);
      setTicketToDelete("");
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete ticket. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCloseTicket = (ticketId: string) => {
    if (!ensurePermission(permissions.canUpdateTicketStatus, "You cannot close tickets.")) {
      return;
    }
    setTicketToClose(ticketId);
    setCloseDialogOpen(true);
  };

  const confirmCloseTicket = async () => {
    if (!ensurePermission(permissions.canUpdateTicketStatus, "You cannot close tickets.")) {
      setCloseDialogOpen(false);
      setTicketToClose("");
      return;
    }
    if (!ticketToClose) return;
    
    try {
      await authenticatedRequest("PUT", `/api/tickets/${ticketToClose}/status`, {
        status: 'closed',
      });
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      toast({
        title: "Ticket closed",
        description: "The ticket has been successfully closed.",
      });
      setCloseDialogOpen(false);
      setTicketToClose("");
    } catch (error) {
      toast({
        title: "Close failed",
        description: "Failed to close ticket. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCommentTicket = (ticketId: string) => {
    if (!ensurePermission(permissions.canCommentOnTickets, "You cannot comment on tickets.")) {
      return;
    }
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      setCommentTicketId(ticket.id);
      setCommentTicketNumber(ticket.ticketNumber);
      setCommentDialogOpen(true);
    }
  };

  // Filter tickets based on search and filter criteria
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = searchTerm === "" || 
      ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.requestorName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Failed to load tickets. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-ticket-list-title">
            {title}
          </h2>
          <p className="text-muted-foreground">
            {filteredTickets.length} of {tickets.length} tickets
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets by title, description, number, or requestor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-tickets"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="hardware">Hardware</SelectItem>
              <SelectItem value="software">Software</SelectItem>
              <SelectItem value="network">Network</SelectItem>
              <SelectItem value="access">Access</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-filter-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>

          {(statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setCategoryFilter("all");
                setPriorityFilter("all");
              }}
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Ticket List */}
      <div className="space-y-4">
        {filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No tickets found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all"
                ? "Try adjusting your search or filters."
                : "No support tickets have been created yet."}
            </p>
            {showCreateButton && onCreateTicket && (
              <Button onClick={onCreateTicket} data-testid="button-create-first-ticket">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Ticket
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick?.(ticket)}
                onAssign={permissions.canAssignTickets ? handleAssignTicket : undefined}
                onUpdateStatus={permissions.canUpdateTicketStatus ? handleUpdateStatus : undefined}
                onEdit={permissions.canEditTickets ? handleEditTicket : undefined}
                onDelete={permissions.canDeleteTickets ? handleDeleteTicket : undefined}
                onClose={permissions.canUpdateTicketStatus ? handleCloseTicket : undefined}
                onComment={permissions.canCommentOnTickets ? handleCommentTicket : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assignment Dialog */}
      {permissions.canAssignTickets && (
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="assignee">Assign to Technician</Label>
              <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                <SelectTrigger data-testid="select-assignee">
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech: any) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.firstName} {tech.lastName} ({tech.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAssignSubmit}
                disabled={!selectedAssignee || assignTicketMutation.isPending}
                data-testid="button-confirm-assign"
              >
                {assignTicketMutation.isPending ? "Assigning..." : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Status Update Dialog */}
      {permissions.canUpdateTicketStatus && (
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Ticket Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(selectedStatus === "resolved" || selectedStatus === "closed") && (
              <>
                <div>
                  <Label htmlFor="resolution">Resolution Summary</Label>
                  <Input
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Brief resolution summary"
                    data-testid="input-resolution"
                  />
                </div>
                <div>
                  <Label htmlFor="resolutionNotes">Resolution Notes</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Detailed resolution notes..."
                    data-testid="textarea-resolution-notes"
                  />
                </div>
              </>
            )}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleStatusSubmit}
                disabled={!selectedStatus || updateStatusMutation.isPending}
                data-testid="button-confirm-status"
              >
                {updateStatusMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {permissions.canDeleteTickets && (
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ticket? This action cannot be undone and all ticket data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTicketToDelete("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteTicket}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* Close Confirmation Dialog */}
      {permissions.canUpdateTicketStatus && (
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this ticket? The ticket will be marked as closed and no further updates can be made without reopening it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTicketToClose("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseTicket}>
              Close Ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* Comment Dialog */}
      {permissions.canCommentOnTickets && (
      <TicketCommentDialog
        ticketId={commentTicketId}
        ticketNumber={commentTicketNumber}
        open={commentDialogOpen}
        onOpenChange={setCommentDialogOpen}
      />
      )}

      {/* Edit Dialog */}
      {permissions.canEditTickets && (
      <TicketEditDialog
        ticket={ticketToEdit}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      )}
    </div>
  );
}
