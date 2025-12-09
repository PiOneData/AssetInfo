import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { Cloud, Search, Edit, Trash2, Eye, Loader2, CheckCircle, XCircle, Clock, Shield, TrendingUp, Users, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const APPROVAL_STATUS_OPTIONS = ["pending", "approved", "denied"] as const;
const CATEGORY_OPTIONS = ["productivity", "collaboration", "security", "development", "marketing", "sales", "hr", "finance", "analytics", "other"] as const;
const COMPLIANCE_LEVEL_OPTIONS = ["compliant", "partial", "non-compliant", "unknown"] as const;

type ApprovalStatus = typeof APPROVAL_STATUS_OPTIONS[number];
type Category = typeof CATEGORY_OPTIONS[number];
type ComplianceLevel = typeof COMPLIANCE_LEVEL_OPTIONS[number];

// Custom URL validation that accepts modern TLDs like .ai, .io, .tech, etc.
const urlPattern = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

const saasAppSchema = z.object({
  name: z.string().min(1, "App name is required"),
  vendor: z.string().optional(),
  category: z.enum(CATEGORY_OPTIONS).optional(),
  approvalStatus: z.enum(APPROVAL_STATUS_OPTIONS).default("pending"),
  riskScore: z.number().min(0).max(100).default(0),
  websiteUrl: z.string()
    .regex(urlPattern, "Invalid URL")
    .transform((url) => {
      // Automatically prepend https:// if no protocol is provided
      if (url && !url.match(/^https?:\/\//i)) {
        return `https://${url}`;
      }
      return url;
    })
    .optional()
    .or(z.literal("")),
  description: z.string().optional(),
  primaryOwner: z.string().optional(),
  department: z.string().optional(),
  complianceLevel: z.enum(COMPLIANCE_LEVEL_OPTIONS).default("unknown"),
  dataClassification: z.string().optional(),
  userCount: z.number().min(0).optional(),
  monthlyActiveUsers: z.number().min(0).optional(),
  lastAccessDate: z.string().optional(),
  integrations: z.string().optional(),
  notes: z.string().optional(),
});

type SaasAppData = z.infer<typeof saasAppSchema>;

interface SaasApp {
  id: string;
  tenantId: string;
  name: string;
  vendor?: string;
  category?: string;
  approvalStatus: ApprovalStatus;
  riskScore: number;
  websiteUrl?: string;
  description?: string;
  primaryOwner?: string;
  department?: string;
  complianceLevel: ComplianceLevel;
  dataClassification?: string;
  userCount?: number;
  monthlyActiveUsers?: number;
  lastAccessDate?: string;
  integrations?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_FORM_VALUES: SaasAppData = {
  name: "",
  vendor: "",
  category: undefined,
  approvalStatus: "pending",
  riskScore: 0,
  websiteUrl: "",
  description: "",
  primaryOwner: "",
  department: "",
  complianceLevel: "unknown",
  dataClassification: "",
  userCount: undefined,
  monthlyActiveUsers: undefined,
  lastAccessDate: "",
  integrations: "",
  notes: "",
};

function SaasAppForm({
  onSuccess,
  onCancel,
  editingApp,
  initialValues,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  editingApp?: SaasApp;
  initialValues: SaasAppData;
}) {
  const { toast } = useToast();

  const form = useForm<SaasAppData>({
    resolver: zodResolver(saasAppSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const createOrUpdateApp = useMutation({
    mutationFn: async (data: SaasAppData) => {
      const endpoint = editingApp ? `/api/saas-apps/${editingApp.id}` : "/api/saas-apps";
      const method = editingApp ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saas-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saas-apps/stats"] });
      toast({
        title: editingApp ? "App updated!" : "App created!",
        description: editingApp
          ? "The SaaS app has been updated successfully."
          : "A new SaaS app has been added to your inventory.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      console.error("SaaS app mutation error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${editingApp ? 'update' : 'create'} SaaS app. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SaasAppData) => {
    createOrUpdateApp.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>App Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Slack, Salesforce" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="vendor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Salesforce Inc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="approvalStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Approval Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {APPROVAL_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="riskScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Risk Score (0-100)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="primaryOwner"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Owner</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <FormControl>
                  <Input placeholder="Engineering" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="websiteUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="complianceLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compliance Level</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select compliance level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COMPLIANCE_LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dataClassification"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Classification</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Public, Internal, Confidential" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="userCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total User Count</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    placeholder="150"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="monthlyActiveUsers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly Active Users</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    placeholder="120"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Brief description of the application" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="integrations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Integrations</FormLabel>
              <FormControl>
                <Textarea placeholder="List of integrated services" {...field} />
              </FormControl>
              <FormDescription>
                Comma-separated list of integrations (e.g., "Slack, Google Drive, Jira")
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={createOrUpdateApp.isPending}>
            {createOrUpdateApp.isPending ? "Saving..." : editingApp ? "Update App" : "Create App"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function SaasApps() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingApp, setEditingApp] = useState<SaasApp | null>(null);
  const [appFormValues, setAppFormValues] = useState<SaasAppData>(DEFAULT_FORM_VALUES);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewApp, setViewApp] = useState<SaasApp | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const isNewApp = window.location.pathname === "/saas-apps/new";

  // Fetch SaaS apps
  const { data: apps, isLoading } = useQuery({
    queryKey: ["/api/saas-apps", selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatus !== "all") {
        params.set("approvalStatus", selectedStatus);
      }
      const url = `/api/saas-apps${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await authenticatedRequest("GET", url);
      return response.json();
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["/api/saas-apps/stats"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/saas-apps/stats");
      return response.json();
    },
  });

  const deleteApp = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/saas-apps/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saas-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saas-apps/stats"] });
      toast({
        title: "App deleted!",
        description: "The SaaS app has been removed.",
      });
    },
    onError: (error: any) => {
      console.error("App deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete app. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isNewApp) {
      if (permissions.canEditVendors) {
        setShowAddForm(true);
      } else {
        toast({
          title: "Insufficient permissions",
          description: "Only IT managers and admins can create SaaS apps.",
          variant: "destructive",
        });
        setLocation("/saas-apps");
      }
    }
  }, [isNewApp, permissions.canEditVendors, setLocation, toast]);

  const handleAddApp = () => {
    setEditingApp(null);
    setAppFormValues({ ...DEFAULT_FORM_VALUES });
    setShowAddForm(true);
    if (!isNewApp) {
      setLocation("/saas-apps/new");
    }
  };

  const handleEditApp = async (app: SaasApp) => {
    setEditingApp(app);
    setAppFormValues({
      name: app.name,
      vendor: app.vendor || "",
      category: app.category as Category | undefined,
      approvalStatus: app.approvalStatus,
      riskScore: app.riskScore,
      websiteUrl: app.websiteUrl || "",
      description: app.description || "",
      primaryOwner: app.primaryOwner || "",
      department: app.department || "",
      complianceLevel: app.complianceLevel,
      dataClassification: app.dataClassification || "",
      userCount: app.userCount,
      monthlyActiveUsers: app.monthlyActiveUsers,
      lastAccessDate: app.lastAccessDate || "",
      integrations: app.integrations || "",
      notes: app.notes || "",
    });
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingApp(null);
    setAppFormValues({ ...DEFAULT_FORM_VALUES });
    if (isNewApp) {
      setLocation("/saas-apps");
    }
  };

  const handleViewApp = (app: SaasApp) => {
    setViewApp(app);
    setIsViewDialogOpen(true);
  };

  const closeViewDialog = () => {
    setIsViewDialogOpen(false);
    setViewApp(null);
  };

  const getApprovalBadge = (status: ApprovalStatus) => {
    const variants = {
      approved: { variant: "default" as const, icon: CheckCircle, color: "text-green-500" },
      denied: { variant: "destructive" as const, icon: XCircle, color: "text-red-500" },
      pending: { variant: "secondary" as const, icon: Clock, color: "text-yellow-500" },
    };
    const config = variants[status];
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <config.icon className={cn("w-3 h-3", config.color)} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getRiskBadgeColor = (score: number) => {
    if (score >= 70) return "bg-red-500/10 text-red-500 border-red-500/20";
    if (score >= 40) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-green-500/10 text-green-500 border-green-500/20";
  };

  const filteredApps = apps?.filter((app: SaasApp) =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.category?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (showAddForm) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />

        <main className="flex-1 md:ml-64 overflow-auto">
          <TopBar
            title={editingApp ? "Edit SaaS App" : "Add New SaaS App"}
            description={editingApp
              ? "Update application information and approval status"
              : "Add a new SaaS application to your inventory"
            }
            showAddButton={false}
          />
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <SaasAppForm
                    onSuccess={handleCloseForm}
                    onCancel={handleCloseForm}
                    editingApp={editingApp || undefined}
                    initialValues={appFormValues}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background page-enter">
      <Sidebar />

      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="SaaS Applications"
          description="Manage your organization's SaaS application inventory"
          showAddButton={permissions.canEditVendors}
          addButtonText="Add SaaS App"
          onAddClick={permissions.canEditVendors ? handleAddApp : undefined}
        />
        <div className="p-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Apps</CardTitle>
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalApps || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Approved</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.approvedApps || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.pendingApps || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">High Risk</CardTitle>
                  <Shield className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.highRiskApps || 0}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search applications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Apps Grid */}
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredApps.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Cloud className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No SaaS apps found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "No apps match your search criteria"
                    : "Get started by adding your first SaaS application"
                  }
                </p>
                {!searchTerm && permissions.canEditVendors && (
                  <Button onClick={handleAddApp}>
                    Add Your First SaaS App
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredApps.map((app: SaasApp) => (
                <Card key={app.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Cloud className="w-5 h-5 text-muted-foreground" />
                          {app.name}
                        </CardTitle>
                        {app.vendor && (
                          <CardDescription className="mt-1">{app.vendor}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewApp(app)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {permissions.canEditVendors && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditApp(app)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete SaaS App</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{app.name}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteApp.mutate(app.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      {getApprovalBadge(app.approvalStatus)}
                      <Badge className={cn("border", getRiskBadgeColor(app.riskScore))}>
                        Risk: {app.riskScore}
                      </Badge>
                    </div>

                    {app.category && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Category:</span> {app.category.charAt(0).toUpperCase() + app.category.slice(1)}
                      </div>
                    )}

                    {app.primaryOwner && (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {app.primaryOwner}
                      </div>
                    )}

                    {app.websiteUrl && (
                      <a
                        href={app.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Visit website
                      </a>
                    )}

                    {app.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {app.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <FloatingAIAssistant />

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
        if (!open) closeViewDialog();
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewApp?.name || "App Details"}</DialogTitle>
            <DialogDescription>Complete information about this SaaS application</DialogDescription>
          </DialogHeader>
          {viewApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Vendor</p>
                  <p className="font-medium">{viewApp.vendor || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Category</p>
                  <p className="font-medium">{viewApp.category || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Approval Status</p>
                  <div className="mt-1">{getApprovalBadge(viewApp.approvalStatus)}</div>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Risk Score</p>
                  <p className="font-medium">{viewApp.riskScore}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Primary Owner</p>
                  <p className="font-medium">{viewApp.primaryOwner || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Department</p>
                  <p className="font-medium">{viewApp.department || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Compliance Level</p>
                  <p className="font-medium">{viewApp.complianceLevel || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Data Classification</p>
                  <p className="font-medium">{viewApp.dataClassification || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">User Count</p>
                  <p className="font-medium">{viewApp.userCount || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Monthly Active Users</p>
                  <p className="font-medium">{viewApp.monthlyActiveUsers || "—"}</p>
                </div>
              </div>

              {viewApp.websiteUrl && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Website</p>
                  <a href={viewApp.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {viewApp.websiteUrl}
                  </a>
                </div>
              )}

              {viewApp.description && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm text-muted-foreground">{viewApp.description}</p>
                </div>
              )}

              {viewApp.integrations && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Integrations</p>
                  <p className="mt-1 text-sm text-muted-foreground">{viewApp.integrations}</p>
                </div>
              )}

              {viewApp.notes && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{viewApp.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
