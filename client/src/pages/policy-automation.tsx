import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { Zap, Play, Pause, Plus, Search, TrendingUp, CheckCircle, XCircle, Clock, BarChart3, Sparkles } from "lucide-react";

interface AutomatedPolicy {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: any;
  actions: Array<{ type: string; config: any }>;
  executionCount?: number;
  successCount?: number;
  failureCount?: number;
  lastExecutedAt?: string;
  createdAt: string;
}

interface PolicyTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon?: string;
  triggerType: string;
  popularity?: number;
}

interface PolicyExecution {
  id: string;
  policyId: string;
  status: string;
  triggerEvent: string;
  actionsExecuted?: number;
  actionsSucceeded?: number;
  actionsFailed?: number;
  createdAt: string;
}

export default function PolicyAutomationPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPolicy, setSelectedPolicy] = useState<AutomatedPolicy | null>(null);
  const [executionsDialogOpen, setExecutionsDialogOpen] = useState(false);

  const permissions = user ? getRolePermissions(user.role) : { canWrite: false, canManage: false };

  // Fetch policies
  const { data: policies = [], isLoading: policiesLoading } = useQuery<AutomatedPolicy[]>({
    queryKey: ["policies"],
    queryFn: () => authenticatedRequest("/api/policies"),
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<PolicyTemplate[]>({
    queryKey: ["policy-templates"],
    queryFn: () => authenticatedRequest("/api/policies/templates"),
  });

  // Fetch policy executions
  const { data: executions = [] } = useQuery<PolicyExecution[]>({
    queryKey: ["policy-executions", selectedPolicy?.id],
    queryFn: () => authenticatedRequest(`/api/policies/${selectedPolicy?.id}/executions`),
    enabled: !!selectedPolicy,
  });

  // Toggle policy mutation
  const togglePolicyMutation = useMutation({
    mutationFn: async ({ policyId, enabled }: { policyId: string; enabled: boolean }) => {
      const endpoint = enabled ? "enable" : "disable";
      return authenticatedRequest(`/api/policies/${policyId}/${endpoint}`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ title: "Success", description: "Policy updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update policy", variant: "destructive" });
    },
  });

  // Calculate stats
  const totalPolicies = policies.length;
  const enabledPolicies = policies.filter(p => p.enabled).length;
  const totalExecutions = policies.reduce((sum, p) => sum + (p.executionCount || 0), 0);
  const successRate = totalExecutions > 0
    ? Math.round((policies.reduce((sum, p) => sum + (p.successCount || 0), 0) / totalExecutions) * 100)
    : 0;

  // Filter policies
  const filteredPolicies = policies.filter(policy =>
    policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    policy.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTriggerLabel = (triggerType: string) => {
    const labels: Record<string, string> = {
      app_discovered: "App Discovered",
      license_unused: "License Unused",
      oauth_risky_permission: "Risky OAuth",
      user_offboarded: "User Offboarded",
      renewal_approaching: "Renewal Due",
      budget_exceeded: "Budget Exceeded",
    };
    return labels[triggerType] || triggerType;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      security: "bg-red-100 text-red-800",
      cost_optimization: "bg-green-100 text-green-800",
      compliance: "bg-blue-100 text-blue-800",
      procurement: "bg-purple-100 text-purple-800",
      finance: "bg-yellow-100 text-yellow-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Policy Automation</h1>
              </div>
              {permissions.canWrite && (
                <Button onClick={() => setLocation("/policy-builder")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Policy
                </Button>
              )}
            </div>
            <p className="text-muted-foreground">
              Self-healing IT policies that automate routine tasks and reduce manual toil by 50%
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Policies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPolicies}</div>
                <p className="text-xs text-muted-foreground">{enabledPolicies} active</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Executions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalExecutions}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{successRate}%</div>
                <p className="text-xs text-muted-foreground">Average across all policies</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Time Saved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(totalExecutions * 15)}min</div>
                <p className="text-xs text-muted-foreground">~15min per execution</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="policies" className="space-y-4">
            <TabsList>
              <TabsTrigger value="policies">Active Policies</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="executions">Recent Executions</TabsTrigger>
            </TabsList>

            {/* Active Policies Tab */}
            <TabsContent value="policies" className="space-y-4">
              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search policies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Policies Grid */}
              <div className="grid grid-cols-1 gap-4">
                {filteredPolicies.map((policy) => (
                  <Card key={policy.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-lg">{policy.name}</CardTitle>
                            <Badge variant={policy.enabled ? "default" : "secondary"}>
                              {policy.enabled ? "Active" : "Disabled"}
                            </Badge>
                            <Badge variant="outline">{getTriggerLabel(policy.triggerType)}</Badge>
                          </div>
                          <CardDescription>{policy.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPolicy(policy);
                              setExecutionsDialogOpen(true);
                            }}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePolicyMutation.mutate({ policyId: policy.id, enabled: !policy.enabled })}
                          >
                            {policy.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>{policy.successCount || 0} successes</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span>{policy.failureCount || 0} failures</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {policy.lastExecutedAt
                                ? new Date(policy.lastExecutedAt).toLocaleDateString()
                                : "Never executed"}
                            </span>
                          </div>
                        </div>
                        <div className="text-muted-foreground">
                          {policy.actions.length} action{policy.actions.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {filteredPolicies.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground text-center">
                        {policies.length === 0
                          ? "No policies yet. Create your first policy to automate IT workflows."
                          : "No policies match your search."}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <Badge className={getCategoryColor(template.category)}>
                          {template.category.replace("_", " ")}
                        </Badge>
                        {template.popularity && template.popularity > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <TrendingUp className="h-3 w-3" />
                            {template.popularity}
                          </div>
                        )}
                      </div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-sm">{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => setLocation(`/policy-builder?template=${template.id}`)}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Executions Tab */}
            <TabsContent value="executions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Executions</CardTitle>
                  <CardDescription>Last 50 policy executions across all policies</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {executions.slice(0, 50).map((execution) => (
                      <div key={execution.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {execution.status === "success" ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : execution.status === "failed" ? (
                            <XCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Clock className="h-5 w-5 text-yellow-600" />
                          )}
                          <div>
                            <p className="font-medium">{getTriggerLabel(execution.triggerEvent)}</p>
                            <p className="text-sm text-muted-foreground">
                              {execution.actionsSucceeded || 0}/{execution.actionsExecuted || 0} actions succeeded
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(execution.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Executions Dialog */}
          <Dialog open={executionsDialogOpen} onOpenChange={setExecutionsDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{selectedPolicy?.name} - Execution History</DialogTitle>
                <DialogDescription>Recent executions and performance metrics</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {executions.map((execution) => (
                  <div key={execution.id} className="flex items-start justify-between p-3 border rounded-lg">
                    <div className="flex items-start gap-3">
                      {execution.status === "success" ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : execution.status === "failed" ? (
                        <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{getTriggerLabel(execution.triggerEvent)}</p>
                        <p className="text-sm text-muted-foreground">
                          {execution.actionsSucceeded || 0} of {execution.actionsExecuted || 0} actions succeeded
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(execution.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
      <FloatingAIAssistant />
    </div>
  );
}
