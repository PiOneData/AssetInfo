import { useState, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { authenticatedRequest } from "@/lib/auth";
import {
  Users as UsersIcon, 
  UserPlus, 
  Search, 
  Shield, 
  UserCheck, 
  UserX, 
  Crown,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Edit,
  Trash2,
  X,
  Download,
  FileSpreadsheet
} from "lucide-react";
import { inviteUserSchema, updateUserRoleSchema, type InviteUser, type UpdateUserRole } from "@shared/schema";

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  jobTitle?: string;
  isActive: boolean;
  lastLoginAt?: string;
  invitedBy?: string;
  createdAt: string;
}

interface UserActionsProps {
  member: TeamMember;
  currentUser?: { id: string; role: string } | null;
  onEditRole: (user: TeamMember) => void;
  onToggleStatus: (user: TeamMember) => void;
}

export default function Users() {
  const [location] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);

  // Detect if we're in "new" mode and auto-open the form
  useEffect(() => {
    if (location === '/users/new') {
      setIsInviteDialogOpen(true);
    }
  }, [location]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Fetch team members
  const { data: teamMembers = [], isLoading: teamLoading, error: teamError } = useQuery<TeamMember[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/users");
      return response.json();
    },
  });

  // Invite user form
  const inviteForm = useForm<InviteUser>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "technician",
    },
  });

  // Role update form
  const roleForm = useForm<UpdateUserRole>({
    resolver: zodResolver(updateUserRoleSchema),
    defaultValues: {
      role: "technician",
    },
  });

  // Create user mutation (previously invite user)
  const inviteUserMutation = useMutation({
    mutationFn: async (inviteData: InviteUser) => {
      const response = await authenticatedRequest("POST", "/api/users/invite", inviteData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      const displayName = data.firstName || inviteForm.getValues("firstName") || data.email;
      setIsInviteDialogOpen(false);
      inviteForm.reset();
      toast({
        title: `Account created successfully for ${displayName}. Login credentials will be provided separately.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, roleData }: { userId: string; roleData: UpdateUserRole }) => {
      const response = await authenticatedRequest("PATCH", `/api/users/${userId}/role`, roleData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsRoleDialogOpen(false);
      setEditingUser(null);
      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update role",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Deactivate user mutation
  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authenticatedRequest("PATCH", `/api/users/${userId}/deactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User deactivated",
        description: "User account has been deactivated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to deactivate user",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Activate user mutation
  const activateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authenticatedRequest("PATCH", `/api/users/${userId}/activate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User activated",
        description: "User account has been activated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to activate user",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk upload mutations
  const validateBulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authenticatedRequest("POST", "/api/users/bulk/validate", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setUploadResults(data);
      setIsValidating(false);
    },
    onError: (error: any) => {
      toast({
        title: "Validation failed",
        description: error.message || "Failed to validate CSV file",
        variant: "destructive",
      });
      setIsValidating(false);
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async ({ file, onlyValid }: { file: File; onlyValid: boolean }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('onlyValid', onlyValid.toString());
      const response = await authenticatedRequest("POST", "/api/users/bulk/import", formData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsBulkUploadOpen(false);
      setUploadFile(null);
      setUploadResults(null);
      toast({
        title: "Users imported successfully",
        description: `${data.imported} user(s) have been created successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import users",
        variant: "destructive",
      });
    },
  });

  const handleInviteSubmit = (data: InviteUser) => {
    inviteUserMutation.mutate(data);
  };

  const handleRoleUpdate = (data: UpdateUserRole) => {
    if (editingUser) {
      updateRoleMutation.mutate({ userId: editingUser.id, roleData: data });
    }
  };

  const handleEditRole = (user: TeamMember) => {
    setEditingUser(user);
    roleForm.setValue("role", user.role as any);
    setIsRoleDialogOpen(true);
  };

  const handleToggleStatus = (user: TeamMember) => {
    if (user.isActive) {
      deactivateUserMutation.mutate(user.id);
    } else {
      activateUserMutation.mutate(user.id);
    }
  };

  // Bulk upload helper functions
  const downloadTemplate = async () => {
    try {
      const response = await authenticatedRequest("GET", "/api/users/bulk/template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'users_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Template downloaded",
        description: "Users template has been downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message || "Failed to download template",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "File too large",
          description: "Please select a file smaller than 5MB",
          variant: "destructive",
        });
        return;
      }
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast({
          title: "Invalid file type",
          description: "Please select a CSV file",
          variant: "destructive",
        });
        return;
      }
      setUploadFile(file);
      setUploadResults(null);
    }
  };

  const handleValidateFile = () => {
    if (uploadFile) {
      setIsValidating(true);
      validateBulkUploadMutation.mutate(uploadFile);
    }
  };

  const handleBulkImport = (onlyValid: boolean) => {
    if (uploadFile) {
      bulkImportMutation.mutate({ file: uploadFile, onlyValid });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super-admin": return "destructive";
      case "admin": return "destructive";
      case "it-manager": return "default";
      case "technician": return "secondary";
      default: return "outline";
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending": return "secondary";
      case "accepted": return "default";
      case "expired": return "destructive";
      default: return "outline";
    }
  };

  // Filter team members
  const filteredTeamMembers = teamMembers.filter(member => {
    const matchesSearch = `${member.firstName} ${member.lastName} ${member.email}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && member.isActive) ||
      (statusFilter === "inactive" && !member.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <TopBar title="Team Management" description="Manage your organization's team members and roles" />
        <main className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
                  Team Management
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage your organization's team members and roles
                </p>
              </div>
              
              <div className="flex gap-2">
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-invite-user">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Team Member
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Team Member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={inviteForm.handleSubmit(handleInviteSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          data-testid="input-first-name"
                          {...inviteForm.register("firstName")}
                          placeholder="Enter first name"
                        />
                        {inviteForm.formState.errors.firstName && (
                          <p className="text-sm text-destructive mt-1">
                            {inviteForm.formState.errors.firstName.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          data-testid="input-last-name"
                          {...inviteForm.register("lastName")}
                          placeholder="Enter last name"
                        />
                        {inviteForm.formState.errors.lastName && (
                          <p className="text-sm text-destructive mt-1">
                            {inviteForm.formState.errors.lastName.message}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        data-testid="input-email"
                        {...inviteForm.register("email")}
                        placeholder="Enter email address"
                      />
                      {inviteForm.formState.errors.email && (
                        <p className="text-sm text-destructive mt-1">
                          {inviteForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={inviteForm.watch("role")}
                        onValueChange={(value) => inviteForm.setValue("role", value as any)}
                      >
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {currentUser?.role === 'super-admin' && (
                            <SelectItem value="admin">Admin</SelectItem>
                          )}
                          <SelectItem value="it-manager">IT Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                        </SelectContent>
                      </Select>
                      {inviteForm.formState.errors.role && (
                        <p className="text-sm text-destructive mt-1">
                          {inviteForm.formState.errors.role.message}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/40 border border-dashed border-muted rounded-md p-3">
                      Default password for all newly created users is <span className="font-semibold">admin123</span>. Share it securely and have the user update it after the first login.
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInviteDialogOpen(false)}
                        data-testid="button-cancel-invite"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={inviteUserMutation.isPending}
                        data-testid="button-send-invite"
                      >
                        {inviteUserMutation.isPending ? "Creating..." : "Create Team Member"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search team members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-users"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-full sm:w-32" data-testid="select-role-filter">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="super-admin">Super Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="it-manager">IT Manager</SelectItem>
                      <SelectItem value="technician">Technician</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-32" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Error Handling */}
            {teamError && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Failed to load team members</h3>
                    <p className="text-muted-foreground">
                      {teamError instanceof Error ? teamError.message : "Unable to load team data. Please try again."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Team Members */}
            {!teamError && (
              <div className="space-y-4">
                {teamLoading ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        <p className="text-muted-foreground mt-2">Loading team members...</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : filteredTeamMembers.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <UsersIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No team members found</h3>
                        <p className="text-muted-foreground mb-4">
                          {searchTerm || roleFilter !== "all" || statusFilter !== "all"
                            ? "Try adjusting your filters to see more results."
                            : "Use the “Create Team Member” button to add your first teammate."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {filteredTeamMembers.map((member) => (
                      <Card key={member.id} data-testid={`card-user-${member.id}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                  {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h3 className="font-medium text-foreground" data-testid={`text-user-name-${member.id}`}>
                                  {member.firstName} {member.lastName}
                                  {member.id === currentUser?.id && (
                                    <span className="text-muted-foreground text-sm ml-2">(You)</span>
                                  )}
                                </h3>
                                <p className="text-sm text-muted-foreground" data-testid={`text-user-email-${member.id}`}>
                                  {member.email}
                                </p>
                                {member.jobTitle && (
                                  <p className="text-xs text-muted-foreground">
                                    {member.jobTitle}
                                    {member.department && ` • ${member.department}`}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={getRoleBadgeVariant(member.role)} data-testid={`badge-role-${member.id}`}>
                                {member.role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                                {member.role === "it-manager" && <Shield className="h-3 w-3 mr-1" />}
                                {member.role === "read-only" && <UserCheck className="h-3 w-3 mr-1" />}
                                {member.role.replace("-", " " ).replace(/\b\w/g, l => l.toUpperCase())}
                              </Badge>
                              <Badge variant={member.isActive ? "default" : "secondary"} data-testid={`badge-status-${member.id}`}>
                                {member.isActive ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 mr-1" /> Active
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3 mr-1" /> Inactive
                                  </>
                                )}
                              </Badge>
                              <UserActions
                                member={member}
                                currentUser={currentUser}
                                onEditRole={handleEditRole}
                                onToggleStatus={handleToggleStatus}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Role Update Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update User Role</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)} className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {editingUser.firstName.charAt(0)}{editingUser.lastName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{editingUser.firstName} {editingUser.lastName}</p>
                  <p className="text-sm text-muted-foreground">{editingUser.email}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="newRole">New Role</Label>
                <Select
                  value={roleForm.watch("role")}
                  onValueChange={(value) => roleForm.setValue("role", value as any)}
                >
                  <SelectTrigger data-testid="select-new-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === 'super-admin' && (
                      <SelectItem value="admin">Admin</SelectItem>
                    )}
                    <SelectItem value="it-manager">IT Manager</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                  </SelectContent>
                </Select>
                {roleForm.formState.errors.role && (
                  <p className="text-sm text-destructive mt-1">
                    {roleForm.formState.errors.role.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRoleDialogOpen(false)}
                  data-testid="button-cancel-role-update"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateRoleMutation.isPending}
                  data-testid="button-update-role"
                >
                  {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Bulk Upload Modal */}
      <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Users</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="download" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="download">Download Template</TabsTrigger>
              <TabsTrigger value="upload">Upload CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="download" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Step 1: Download Template</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download a comprehensive CSV template with sample data showing different user roles and types.
                  </p>
                  
                  <Button 
                    variant="outline" 
                    onClick={downloadTemplate}
                    data-testid="button-download-template"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Template with Samples
                  </Button>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Step 2: Customize Your Data</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Template includes sample data for:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• <strong>Admin users:</strong> Full system access and management</li>
                      <li>• <strong>IT Managers:</strong> Manage assets and generate reports</li>
                      <li>• <strong>Technicians:</strong> Handle maintenance and support</li>
                      <li>• <strong>Employees:</strong> View assigned assets and basic access</li>
                    </ul>
                    
                    <h4 className="font-medium mb-2 mt-4">Key Guidelines:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Replace sample data with your actual user information</li>
                      <li>• Keep the same column headers (do not modify)</li>
                      <li>• Required fields: <strong>first_name, last_name, email, role</strong></li>
                      <li>• All users will be created with default password "admin123"</li>
                      <li>• Users must change password on first login</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Important Security Note</h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        All users will be created with the default password "admin123" and will be required to change it upon first login.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Step 1: Select CSV File</h3>
                  <div className="border-2 border-dashed border-muted rounded-lg p-6">
                    <div className="text-center">
                      <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
                      <div className="mt-4">
                        <label htmlFor="file-upload" className="cursor-pointer">
                          <span className="mt-2 block text-sm font-medium text-foreground">Choose a CSV file</span>
                          <span className="mt-1 block text-xs text-muted-foreground">Maximum file size: 5MB</span>
                        </label>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept=".csv"
                          className="sr-only"
                          onChange={handleFileSelect}
                          data-testid="input-file-upload"
                        />
                      </div>
                    </div>
                  </div>

                  {uploadFile && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <FileSpreadsheet className="h-6 w-6 text-green-600" />
                          <div>
                            <p className="text-sm font-medium">{uploadFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUploadFile(null)}
                          data-testid="button-remove-file"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {uploadFile && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Step 2: Validate File</h3>
                    <div className="space-y-4">
                      <Button
                        onClick={handleValidateFile}
                        disabled={isValidating}
                        className="w-full"
                        data-testid="button-validate-file"
                      >
                        {isValidating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Validating...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Validate File
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {uploadResults && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Step 3: Review Results</h3>
                    <div className="space-y-4">
                      {/* Validation Summary */}
                      <div className="bg-muted rounded-lg p-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-green-600">{uploadResults.validCount || 0}</div>
                            <div className="text-xs text-muted-foreground">Valid Users</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-red-600">{uploadResults.errorCount || 0}</div>
                            <div className="text-xs text-muted-foreground">Errors</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-yellow-600">{uploadResults.warningCount || 0}</div>
                            <div className="text-xs text-muted-foreground">Warnings</div>
                          </div>
                        </div>
                      </div>

                      {/* Import Options */}
                      {uploadResults.validCount > 0 && (
                        <div className="space-y-2">
                          <Button
                            onClick={() => handleBulkImport(false)}
                            disabled={bulkImportMutation.isPending}
                            className="w-full"
                            data-testid="button-import-all"
                          >
                            {bulkImportMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Importing...
                              </>
                            ) : (
                              <>Create All Users ({uploadResults.validCount} valid)</>
                            )}
                          </Button>
                          {uploadResults.errorCount > 0 && (
                            <Button
                              variant="outline"
                              onClick={() => handleBulkImport(true)}
                              disabled={bulkImportMutation.isPending}
                              className="w-full"
                              data-testid="button-import-valid-only"
                            >
                              Create Valid Users Only ({uploadResults.validCount})
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {/* Error/Warning Details */}
                      {uploadResults.errors && uploadResults.errors.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-destructive mb-2">Errors Found:</h4>
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 max-h-40 overflow-y-auto">
                            {uploadResults.errors.map((error: any, index: number) => (
                              <div key={index} className="text-sm text-red-700 dark:text-red-300">
                                Row {error.row}: {error.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {uploadResults.warnings && uploadResults.warnings.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">Warnings:</h4>
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 max-h-40 overflow-y-auto">
                            {uploadResults.warnings.map((warning: any, index: number) => (
                              <div key={index} className="text-sm text-yellow-700 dark:text-yellow-300">
                                Row {warning.row}: {warning.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />
    </div>
  );
}

function UserActions({ member, currentUser, onEditRole, onToggleStatus }: UserActionsProps) {
  const currentRole = currentUser?.role ?? "";
  const isSelf = currentUser?.id === member.id;
  const canManage =
    currentRole === "super-admin" ||
    (currentRole === "admin" && member.role !== "super-admin" && member.role !== "admin");

  if (!canManage) {
    return null;
  }

  const handleEditClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onEditRole(member);
  };

  const handleStatusClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleStatus(member);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          data-testid={`user-actions-trigger-${member.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>User Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={handleEditClick}
          disabled={isSelf}
          data-testid={`user-actions-edit-${member.id}`}
        >
          Edit Role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleStatusClick}
          disabled={isSelf}
          className={member.isActive ? "text-destructive focus:text-destructive" : ""}
          data-testid={`user-actions-toggle-${member.id}`}
        >
          {member.isActive ? "Deactivate User" : "Activate User"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
