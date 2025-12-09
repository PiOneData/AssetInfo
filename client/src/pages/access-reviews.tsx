/**
 * Phase 5: Access Reviews Dashboard
 *
 * Main dashboard for Identity Governance & Access Reviews:
 * - View all access review campaigns
 * - Create new campaigns
 * - Monitor campaign progress
 * - View pending reviews assigned to current user
 * - View privilege drift and overprivileged alerts
 */

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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import {
  ShieldCheck,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  PlayCircle,
  CheckSquare,
  XCircle,
} from "lucide-react";

interface AccessReviewCampaign {
  id: string;
  name: string;
  description?: string;
  campaignType: string;
  status: string;
  totalItems: number;
  reviewedItems: number;
  approvedItems: number;
  revokedItems: number;
  deferredItems: number;
  startDate: string;
  dueDate: string;
  completedAt?: string;
  createdAt: string;
}

interface PrivilegeDriftAlert {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  excessApps: Array<{ appId: string; appName: string }>;
  riskLevel: string;
  riskScore: number;
  status: string;
  detectedAt: string;
}

interface OverprivilegedAccount {
  id: string;
  userId: string;
  userName: string;
  adminAppCount: number;
  staleAdminCount: number;
  riskLevel: string;
  riskScore: number;
  status: string;
  detectedAt: string;
}

interface MyReview {
  campaign: AccessReviewCampaign;
  items: Array<{
    id: string;
    userName: string;
    appName: string;
    accessType: string;
    riskLevel: string;
    lastUsedDate?: string;
  }>;
}

export default function AccessReviewsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCampaignData, setNewCampaignData] = useState({
    name: "",
    description: "",
    campaignType: "quarterly",
    scopeType: "all",
    dueDate: "",
  });

  const permissions = user ? getRolePermissions(user.role) : { canWrite: false, canManage: false };

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<AccessReviewCampaign[]>({
    queryKey: ["access-review-campaigns"],
    queryFn: () => authenticatedRequest("GET", "/api/access-reviews/campaigns"),
  });

  // Fetch my reviews
  const { data: myReviews = [] } = useQuery<MyReview[]>({
    queryKey: ["my-reviews"],
    queryFn: () => authenticatedRequest("GET", "/api/access-reviews/my-reviews"),
  });

  // Fetch privilege drift alerts
  const { data: driftAlerts = [] } = useQuery<PrivilegeDriftAlert[]>({
    queryKey: ["privilege-drift"],
    queryFn: () => authenticatedRequest("GET", "/api/privilege-drift"),
  });

  // Fetch overprivileged accounts
  const { data: overprivilegedAccounts = [] } = useQuery<OverprivilegedAccount[]>({
    queryKey: ["overprivileged-accounts"],
    queryFn: () => authenticatedRequest("GET", "/api/overprivileged-accounts"),
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: (data: any) =>
      authenticatedRequest("POST", "/api/access-reviews/campaigns", data),
    onSuccess: (response: any) => {
      toast({
        title: "Campaign created",
        description: "Access review campaign created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["access-review-campaigns"] });
      setCreateDialogOpen(false);

      // Generate review items
      generateItemsMutation.mutate(response.campaignId);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    },
  });

  // Generate items mutation
  const generateItemsMutation = useMutation({
    mutationFn: (campaignId: string) =>
      authenticatedRequest("POST", `/api/access-reviews/campaigns/${campaignId}/generate-items`),
    onSuccess: () => {
      toast({
        title: "Review items generated",
        description: "Campaign review items have been generated",
      });
      queryClient.invalidateQueries({ queryKey: ["access-review-campaigns"] });
    },
  });

  // Run drift scan mutation
  const runDriftScanMutation = useMutation({
    mutationFn: () =>
      authenticatedRequest("POST", "/api/privilege-drift/scan"),
    onSuccess: () => {
      toast({
        title: "Drift scan completed",
        description: "Privilege drift detection scan completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["privilege-drift"] });
    },
  });

  // Run overprivileged scan mutation
  const runOverprivilegedScanMutation = useMutation({
    mutationFn: () =>
      authenticatedRequest("POST", "/api/overprivileged-accounts/scan"),
    onSuccess: () => {
      toast({
        title: "Overprivileged scan completed",
        description: "Overprivileged account detection completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["overprivileged-accounts"] });
    },
  });

  const handleCreateCampaign = () => {
    if (!newCampaignData.name || !newCampaignData.dueDate) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date();
    const dueDate = new Date(newCampaignData.dueDate);

    createCampaignMutation.mutate({
      ...newCampaignData,
      startDate,
      dueDate,
    });
  };

  // Calculate stats
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const pendingReviewCount = myReviews.reduce((sum, r) => sum + r.items.length, 0);
  const highRiskDrift = driftAlerts.filter((a) => a.riskLevel === "high" || a.riskLevel === "critical").length;
  const highRiskOverprivileged = overprivilegedAccounts.filter(
    (a) => a.riskLevel === "high" || a.riskLevel === "critical"
  ).length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "draft":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "critical":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const calculateProgress = (campaign: AccessReviewCampaign) => {
    if (campaign.totalItems === 0) return 0;
    return Math.round((campaign.reviewedItems / campaign.totalItems) * 100);
  };

  const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="h-8 w-8 text-blue-600" />
                  Identity Governance & Access Reviews
                </h1>
                <p className="text-gray-600 mt-1">
                  Quarterly access certification and continuous privilege monitoring
                </p>
              </div>
              {permissions.canManage && (
                <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Campaign
                </Button>
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-600">Active Campaigns</p>
                      <p className="text-3xl font-bold text-blue-900">{activeCampaigns}</p>
                    </div>
                    <PlayCircle className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-600">Pending Reviews</p>
                      <p className="text-3xl font-bold text-orange-900">{pendingReviewCount}</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-600">Privilege Drift</p>
                      <p className="text-3xl font-bold text-red-900">{highRiskDrift}</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-600">Overprivileged</p>
                      <p className="text-3xl font-bold text-purple-900">{highRiskOverprivileged}</p>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="campaigns" className="space-y-6">
              <TabsList className="bg-white border">
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="my-reviews">
                  My Reviews
                  {pendingReviewCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingReviewCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="drift">Privilege Drift</TabsTrigger>
                <TabsTrigger value="overprivileged">Overprivileged Accounts</TabsTrigger>
              </TabsList>

              {/* Campaigns Tab */}
              <TabsContent value="campaigns" className="space-y-4">
                {campaignsLoading ? (
                  <Card>
                    <CardContent className="p-6">
                      <p className="text-center text-gray-500">Loading campaigns...</p>
                    </CardContent>
                  </Card>
                ) : campaigns.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <ShieldCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No campaigns yet</h3>
                      <p className="text-gray-600 mb-6">
                        Create your first access review campaign to start certifying user access
                      </p>
                      {permissions.canManage && (
                        <Button onClick={() => setCreateDialogOpen(true)}>Create Campaign</Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {campaigns.map((campaign) => {
                      const progress = calculateProgress(campaign);
                      const daysRemaining = getDaysRemaining(campaign.dueDate);
                      const isOverdue = daysRemaining < 0;

                      return (
                        <Card
                          key={campaign.id}
                          className="hover:shadow-lg transition-shadow cursor-pointer"
                          onClick={() => setLocation(`/access-reviews/${campaign.id}`)}
                        >
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                                  <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                                  <Badge variant="outline">{campaign.campaignType}</Badge>
                                </div>
                                {campaign.description && (
                                  <p className="text-sm text-gray-600">{campaign.description}</p>
                                )}
                              </div>
                              <Button variant="outline" size="sm">
                                View Details
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                              <div>
                                <p className="text-xs text-gray-500">Total Items</p>
                                <p className="text-lg font-semibold">{campaign.totalItems}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Reviewed</p>
                                <p className="text-lg font-semibold">{campaign.reviewedItems}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Approved</p>
                                <p className="text-lg font-semibold text-green-600">{campaign.approvedItems}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Revoked</p>
                                <p className="text-lg font-semibold text-red-600">{campaign.revokedItems}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Deferred</p>
                                <p className="text-lg font-semibold text-yellow-600">{campaign.deferredItems}</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Progress: {progress}%</span>
                                <span className={isOverdue ? "text-red-600 font-semibold" : "text-gray-600"}>
                                  {isOverdue
                                    ? `Overdue by ${Math.abs(daysRemaining)} days`
                                    : `${daysRemaining} days remaining`}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    progress === 100 ? "bg-green-600" : isOverdue ? "bg-red-600" : "bg-blue-600"
                                  }`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* My Reviews Tab */}
              <TabsContent value="my-reviews" className="space-y-4">
                {myReviews.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No pending reviews</h3>
                      <p className="text-gray-600">You have no access review items assigned to you</p>
                    </CardContent>
                  </Card>
                ) : (
                  myReviews.map((review) => (
                    <Card key={review.campaign.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{review.campaign.name}</CardTitle>
                            <CardDescription>
                              {review.items.length} items pending your review
                            </CardDescription>
                          </div>
                          <Button onClick={() => setLocation(`/access-reviews/${review.campaign.id}`)}>
                            Review Now
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {review.items.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{item.userName}</p>
                                <p className="text-sm text-gray-600">
                                  {item.appName} - {item.accessType}
                                </p>
                              </div>
                              <Badge className={getRiskColor(item.riskLevel)}>{item.riskLevel}</Badge>
                            </div>
                          ))}
                          {review.items.length > 5 && (
                            <p className="text-sm text-gray-600 text-center pt-2">
                              +{review.items.length - 5} more items
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Privilege Drift Tab */}
              <TabsContent value="drift" className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600">{driftAlerts.length} drift alerts detected</p>
                  {permissions.canManage && (
                    <Button
                      onClick={() => runDriftScanMutation.mutate()}
                      disabled={runDriftScanMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      Run Drift Scan
                    </Button>
                  )}
                </div>

                {driftAlerts.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No privilege drift detected</h3>
                      <p className="text-gray-600">All users have access aligned with their assigned roles</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {driftAlerts.map((alert) => (
                      <Card key={alert.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">{alert.userName}</h3>
                                <Badge className={getRiskColor(alert.riskLevel)}>{alert.riskLevel}</Badge>
                                <Badge variant="outline">{alert.roleName}</Badge>
                              </div>
                              <p className="text-sm text-gray-600">
                                {alert.excessApps.length} excess app{alert.excessApps.length !== 1 ? "s" : ""} beyond role template
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Risk Score</p>
                              <p className="text-2xl font-bold text-gray-900">{alert.riskScore}</p>
                            </div>
                          </div>

                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm font-medium text-gray-700 mb-2">Excess Applications:</p>
                            <div className="flex flex-wrap gap-2">
                              {alert.excessApps.map((app) => (
                                <Badge key={app.appId} variant="secondary">
                                  {app.appName}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation(`/privilege-drift/${alert.id}`)}
                            >
                              View Details
                            </Button>
                            {permissions.canManage && alert.status === "open" && (
                              <Button variant="destructive" size="sm">
                                Resolve
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Overprivileged Accounts Tab */}
              <TabsContent value="overprivileged" className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600">{overprivilegedAccounts.length} overprivileged accounts detected</p>
                  {permissions.canManage && (
                    <Button
                      onClick={() => runOverprivilegedScanMutation.mutate()}
                      disabled={runOverprivilegedScanMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      Run Overprivileged Scan
                    </Button>
                  )}
                </div>

                {overprivilegedAccounts.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No overprivileged accounts</h3>
                      <p className="text-gray-600">No users with excessive admin access detected</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {overprivilegedAccounts.map((account) => (
                      <Card key={account.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">{account.userName}</h3>
                                <Badge className={getRiskColor(account.riskLevel)}>{account.riskLevel}</Badge>
                              </div>
                              <p className="text-sm text-gray-600">
                                Admin access to {account.adminAppCount} apps, {account.staleAdminCount} stale
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Risk Score</p>
                              <p className="text-2xl font-bold text-gray-900">{account.riskScore}</p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation(`/overprivileged-accounts/${account.id}`)}
                            >
                              View Details
                            </Button>
                            {permissions.canManage && account.status === "open" && (
                              <Button variant="destructive" size="sm">
                                Remediate
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Access Review Campaign</DialogTitle>
            <DialogDescription>
              Create a new access review campaign to certify user access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                placeholder="Q1 2025 Access Review"
                value={newCampaignData.name}
                onChange={(e) =>
                  setNewCampaignData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Quarterly access certification for Q1 2025"
                value={newCampaignData.description}
                onChange={(e) =>
                  setNewCampaignData((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="campaignType">Campaign Type</Label>
                <Select
                  value={newCampaignData.campaignType}
                  onValueChange={(value) =>
                    setNewCampaignData((prev) => ({ ...prev, campaignType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly Review</SelectItem>
                    <SelectItem value="department">Department Review</SelectItem>
                    <SelectItem value="high_risk">High-Risk Apps</SelectItem>
                    <SelectItem value="admin">Admin Access Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scopeType">Scope</Label>
                <Select
                  value={newCampaignData.scopeType}
                  onValueChange={(value) =>
                    setNewCampaignData((prev) => ({ ...prev, scopeType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users & Apps</SelectItem>
                    <SelectItem value="department">Specific Department</SelectItem>
                    <SelectItem value="apps">Specific Apps</SelectItem>
                    <SelectItem value="users">Specific Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={newCampaignData.dueDate}
                onChange={(e) =>
                  setNewCampaignData((prev) => ({ ...prev, dueDate: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={createCampaignMutation.isPending}
            >
              {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloatingAIAssistant />
    </div>
  );
}
