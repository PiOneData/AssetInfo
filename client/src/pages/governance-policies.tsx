import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { Shield, Search, Edit, Trash2, Eye, Loader2, CheckCircle, XCircle, AlertTriangle, Zap } from "lucide-react";

const POLICY_TYPE_OPTIONS = ["approval-required", "auto-deny", "risk-threshold", "compliance-check", "spend-limit", "user-limit", "custom"] as const;
const ACTION_OPTIONS = ["notify", "block", "approve", "deny", "escalate", "custom"] as const;

type PolicyType = typeof POLICY_TYPE_OPTIONS[number];
type ActionType = typeof ACTION_OPTIONS[number];

const policySchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  description: z.string().optional(),
  policyType: z.enum(POLICY_TYPE_OPTIONS),
  enabled: z.boolean().default(true),
  conditions: z.string().min(1, "Conditions are required"),
  actions: z.string().min(1, "Actions are required"),
  priority: z.number().min(0).max(100).default(50),
  notificationEmails: z.string().optional(),
});

type PolicyData = z.infer<typeof policySchema>;

interface GovernancePolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  policyType: PolicyType;
  enabled: boolean;
  conditions: string;
  actions: string;
  priority: number;
  executionCount: number;
  lastExecutedAt?: string;
  notificationEmails?: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_FORM_VALUES: PolicyData = {
  name: "",
  description: "",
  policyType: "approval-required",
  enabled: true,
  conditions: '{"riskScore": {"$gte": 70}}',
  actions: '{"action": "notify", "recipients": ["it-manager"]}',
  priority: 50,
  notificationEmails: "",
};

function PolicyForm({
  onSuccess,
  onCancel,
  editingPolicy,
  initialValues,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  editingPolicy?: GovernancePolicy;
  initialValues: PolicyData;
}) {
  const { toast } = useToast();

  const form = useForm<PolicyData>({
    resolver: zodResolver(policySchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const createOrUpdatePolicy = useMutation({
    mutationFn: async (data: PolicyData) => {
      // Validate JSON fields
      try {
        JSON.parse(data.conditions);
        JSON.parse(data.actions);
      } catch (e) {
        throw new Error("Conditions and actions must be valid JSON");
      }

      const endpoint = editingPolicy ? `/api/governance-policies/${editingPolicy.id}` : "/api/governance-policies";
      const method = editingPolicy ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance-policies"] });
      toast({
        title: editingPolicy ? "Policy updated!" : "Policy created!",
        description: editingPolicy
          ? "The governance policy has been updated successfully."
          : "A new governance policy has been created.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      console.error("Policy mutation error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${editingPolicy ? 'update' : 'create'} policy.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PolicyData) => {
    createOrUpdatePolicy.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Policy Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. High-Risk App Approval Required" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Brief description of what this policy does" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="policyType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Policy Type *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {POLICY_TYPE_OPTIONS.map((option) => (
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
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority (0-100)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormDescription>
                  Higher priority policies are evaluated first
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="conditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conditions (JSON) *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='{"riskScore": {"$gte": 70}}'
                  className="font-mono text-sm"
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                JSON object defining when this policy triggers. Examples:
                <br />
                <code className="text-xs">{"riskScore": {"$gte": 70}}</code> - Apps with risk score ≥ 70
                <br />
                <code className="text-xs">{"approvalStatus": "pending"}</code> - Pending apps
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="actions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Actions (JSON) *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='{"action": "notify", "recipients": ["it-manager"]}'
                  className="font-mono text-sm"
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                JSON object defining what happens when policy triggers. Examples:
                <br />
                <code className="text-xs">{"action": "notify", "recipients": ["admin"]}</code>
                <br />
                <code className="text-xs">{"action": "block", "message": "High risk"}</code>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notificationEmails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notification Emails</FormLabel>
              <FormControl>
                <Input placeholder="admin@company.com, security@company.com" {...field} />
              </FormControl>
              <FormDescription>
                Comma-separated list of email addresses to notify
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Enable this policy</FormLabel>
                <FormDescription>
                  Disabled policies will not be evaluated or executed
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={createOrUpdatePolicy.isPending}>
            {createOrUpdatePolicy.isPending ? "Saving..." : editingPolicy ? "Update Policy" : "Create Policy"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function GovernancePolicies() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<GovernancePolicy | null>(null);
  const [policyFormValues, setPolicyFormValues] = useState<PolicyData>(DEFAULT_FORM_VALUES);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewPolicy, setViewPolicy] = useState<GovernancePolicy | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const isNewPolicy = window.location.pathname === "/governance-policies/new";

  // Fetch policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ["/api/governance-policies"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/governance-policies");
      return response.json();
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/governance-policies/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance-policies"] });
      toast({
        title: "Policy deleted!",
        description: "The governance policy has been removed.",
      });
    },
    onError: (error: any) => {
      console.error("Policy deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete policy.",
        variant: "destructive",
      });
    },
  });

  const togglePolicy = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/governance-policies/${id}/toggle`, { enabled });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance-policies"] });
      toast({
        title: "Policy updated!",
        description: "The policy status has been changed.",
      });
    },
    onError: (error: any) => {
      console.error("Toggle error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle policy.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isNewPolicy) {
      if (user?.role === "admin" || user?.role === "super-admin") {
        setShowAddForm(true);
      } else {
        toast({
          title: "Insufficient permissions",
          description: "Only admins can manage governance policies.",
          variant: "destructive",
        });
        setLocation("/governance-policies");
      }
    }
  }, [isNewPolicy, user?.role, setLocation, toast]);

  const handleAddPolicy = () => {
    setEditingPolicy(null);
    setPolicyFormValues({ ...DEFAULT_FORM_VALUES });
    setShowAddForm(true);
    if (!isNewPolicy) {
      setLocation("/governance-policies/new");
    }
  };

  const handleEditPolicy = async (policy: GovernancePolicy) => {
    setEditingPolicy(policy);
    setPolicyFormValues({
      name: policy.name,
      description: policy.description || "",
      policyType: policy.policyType,
      enabled: policy.enabled,
      conditions: policy.conditions,
      actions: policy.actions,
      priority: policy.priority,
      notificationEmails: policy.notificationEmails || "",
    });
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingPolicy(null);
    setPolicyFormValues({ ...DEFAULT_FORM_VALUES });
    if (isNewPolicy) {
      setLocation("/governance-policies");
    }
  };

  const handleViewPolicy = (policy: GovernancePolicy) => {
    setViewPolicy(policy);
    setIsViewDialogOpen(true);
  };

  const closeViewDialog = () => {
    setIsViewDialogOpen(false);
    setViewPolicy(null);
  };

  const filteredPolicies = policies?.filter((policy: GovernancePolicy) =>
    policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.policyType.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Check admin access
  if (user?.role !== "admin" && user?.role !== "super-admin") {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 md:ml-64 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardHeader>
              <CardTitle>Access Restricted</CardTitle>
              <CardDescription>Only administrators can manage governance policies.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  if (showAddForm) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />

        <main className="flex-1 md:ml-64 overflow-auto">
          <TopBar
            title={editingPolicy ? "Edit Governance Policy" : "Add Governance Policy"}
            description={editingPolicy
              ? "Update policy rules and actions"
              : "Create a new automation policy for SaaS governance"
            }
            showAddButton={false}
          />
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <PolicyForm
                    onSuccess={handleCloseForm}
                    onCancel={handleCloseForm}
                    editingPolicy={editingPolicy || undefined}
                    initialValues={policyFormValues}
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
          title="Governance Policies"
          description="Automate SaaS governance with policy rules"
          showAddButton={true}
          addButtonText="Add Policy"
          onAddClick={handleAddPolicy}
        />
        <div className="p-6">
          {/* Search */}
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search policies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Policies Grid */}
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredPolicies.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Zap className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No governance policies configured</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "No policies match your search criteria"
                    : "Create your first automation policy to enforce governance rules"
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={handleAddPolicy}>
                    Add Your First Policy
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPolicies.map((policy: GovernancePolicy) => (
                <Card key={policy.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Zap className="w-5 h-5 text-muted-foreground" />
                          {policy.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {policy.policyType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewPolicy(policy)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPolicy(policy)}
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
                              <AlertDialogTitle>Delete Governance Policy</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{policy.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePolicy.mutate(policy.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={policy.enabled ? "default" : "secondary"}>
                        {policy.enabled ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Enabled
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </>
                        )}
                      </Badge>
                      <Badge variant="outline">
                        Priority: {policy.priority}
                      </Badge>
                    </div>

                    {policy.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {policy.description}
                      </p>
                    )}

                    {policy.executionCount > 0 && (
                      <div className="text-sm text-muted-foreground">
                        Executed {policy.executionCount} time{policy.executionCount > 1 ? 's' : ''}
                      </div>
                    )}

                    {policy.lastExecutedAt && (
                      <div className="text-xs text-muted-foreground">
                        Last executed: {new Date(policy.lastExecutedAt).toLocaleString()}
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => togglePolicy.mutate({ id: policy.id, enabled: !policy.enabled })}
                      disabled={togglePolicy.isPending}
                    >
                      {policy.enabled ? "Disable" : "Enable"}
                    </Button>
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
            <DialogTitle>{viewPolicy?.name || "Policy Details"}</DialogTitle>
            <DialogDescription>Complete policy configuration</DialogDescription>
          </DialogHeader>
          {viewPolicy && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Policy Type</p>
                  <p className="font-medium">{viewPolicy.policyType}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Status</p>
                  <Badge variant={viewPolicy.enabled ? "default" : "secondary"}>
                    {viewPolicy.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Priority</p>
                  <p className="font-medium">{viewPolicy.priority}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Execution Count</p>
                  <p className="font-medium">{viewPolicy.executionCount}</p>
                </div>
              </div>

              {viewPolicy.description && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm text-muted-foreground">{viewPolicy.description}</p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase text-muted-foreground">Conditions (JSON)</p>
                <pre className="mt-1 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
                  {JSON.stringify(JSON.parse(viewPolicy.conditions), null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-xs uppercase text-muted-foreground">Actions (JSON)</p>
                <pre className="mt-1 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
                  {JSON.stringify(JSON.parse(viewPolicy.actions), null, 2)}
                </pre>
              </div>

              {viewPolicy.notificationEmails && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Notification Emails</p>
                  <p className="mt-1 text-sm text-muted-foreground">{viewPolicy.notificationEmails}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
