/**
 * Phase 5: Access Review Campaign Detail & Review Interface
 *
 * Detailed view of a campaign with review workflow:
 * - View all review items in campaign
 * - Filter by risk level, user, app
 * - Approve/Revoke/Defer individual items
 * - Bulk approve/revoke operations
 * - Track campaign progress
 */

import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Download,
  AlertTriangle,
  User,
  Calendar,
} from "lucide-react";

interface AccessReviewItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment?: string;
  appId: string;
  appName: string;
  accessType?: string;
  grantedDate?: string;
  lastUsedDate?: string;
  daysSinceLastUse?: number;
  businessJustification?: string;
  riskLevel: string;
  decision: string;
  decisionNotes?: string;
  reviewedAt?: string;
  reviewerName?: string;
}

interface Campaign {
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
}

export default function AccessReviewDetailPage() {
  const [, params] = useRoute("/access-reviews/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const campaignId = params?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<AccessReviewItem | null>(null);
  const [decisionData, setDecisionData] = useState({
    decision: "approved" as "approved" | "revoked" | "deferred",
    notes: "",
  });
  const [bulkAction, setBulkAction] = useState<"approved" | "revoked" | "deferred">("approved");

  const permissions = user ? getRolePermissions(user.role) : { canWrite: false, canManage: false };

  // Fetch campaign
  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: ["access-review-campaign", campaignId],
    queryFn: () => authenticatedRequest(`/api/access-reviews/campaigns/${campaignId}`),
    enabled: !!campaignId,
  });

  // Fetch review items
  const { data: items = [], isLoading: itemsLoading } = useQuery<AccessReviewItem[]>({
    queryKey: ["access-review-items", campaignId],
    queryFn: () => authenticatedRequest(`/api/access-reviews/campaigns/${campaignId}/items`),
    enabled: !!campaignId,
  });

  // Submit decision mutation
  const submitDecisionMutation = useMutation({
    mutationFn: ({ itemId, decision, notes }: { itemId: string; decision: string; notes?: string }) =>
      authenticatedRequest(`/api/access-reviews/items/${itemId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, notes }),
      }),
    onSuccess: () => {
      toast({
        title: "Decision submitted",
        description: "Review decision has been recorded",
      });
      queryClient.invalidateQueries({ queryKey: ["access-review-items", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["access-review-campaign", campaignId] });
      setDecisionDialogOpen(false);
      setCurrentItem(null);
      setDecisionData({ decision: "approved", notes: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit decision",
        variant: "destructive",
      });
    },
  });

  // Bulk decision mutation
  const bulkDecisionMutation = useMutation({
    mutationFn: ({ itemIds, decision, notes }: { itemIds: string[]; decision: string; notes?: string }) =>
      authenticatedRequest(`/api/access-reviews/campaigns/${campaignId}/bulk-decision`, {
        method: "POST",
        body: JSON.stringify({ itemIds, decision, notes }),
      }),
    onSuccess: () => {
      toast({
        title: "Bulk decision submitted",
        description: `Decision applied to ${selectedItems.size} items`,
      });
      queryClient.invalidateQueries({ queryKey: ["access-review-items", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["access-review-campaign", campaignId] });
      setBulkDialogOpen(false);
      setSelectedItems(new Set());
      setDecisionData({ decision: "approved", notes: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit bulk decision",
        variant: "destructive",
      });
    },
  });

  const handleDecision = (item: AccessReviewItem, decision: "approved" | "revoked" | "deferred") => {
    setCurrentItem(item);
    setDecisionData({ decision, notes: "" });
    setDecisionDialogOpen(true);
  };

  const handleSubmitDecision = () => {
    if (!currentItem) return;

    submitDecisionMutation.mutate({
      itemId: currentItem.id,
      decision: decisionData.decision,
      notes: decisionData.notes,
    });
  };

  const handleBulkDecision = () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No items selected",
        description: "Please select items to perform bulk action",
        variant: "destructive",
      });
      return;
    }

    bulkDecisionMutation.mutate({
      itemIds: Array.from(selectedItems),
      decision: bulkAction,
      notes: decisionData.notes,
    });
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const toggleAllItems = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.appName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRisk = riskFilter === "all" || item.riskLevel === riskFilter;
    const matchesDecision = decisionFilter === "all" || item.decision === decisionFilter;

    return matchesSearch && matchesRisk && matchesDecision;
  });

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

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "revoked":
        return "bg-red-100 text-red-800";
      case "deferred":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  const getDaysAgo = (days?: number) => {
    if (days === null || days === undefined) return "Unknown";
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  if (campaignLoading || !campaign) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading campaign...</p>
      </div>
    );
  }

  const progress = campaign.totalItems > 0 ? Math.round((campaign.reviewedItems / campaign.totalItems) * 100) : 0;
  const daysRemaining = Math.ceil((new Date(campaign.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => setLocation("/access-reviews")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
                <p className="text-gray-600">{campaign.description}</p>
              </div>
              <Badge variant="outline">{campaign.campaignType}</Badge>
              <Badge className={campaign.status === "active" ? "bg-blue-100 text-blue-800" : ""}>
                {campaign.status}
              </Badge>
            </div>

            {/* Progress Card */}
            <Card>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Progress</p>
                    <p className="text-3xl font-bold text-gray-900">{progress}%</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {campaign.reviewedItems} of {campaign.totalItems}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Approved</p>
                    <p className="text-3xl font-bold text-green-600">{campaign.approvedItems}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Revoked</p>
                    <p className="text-3xl font-bold text-red-600">{campaign.revokedItems}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Deferred</p>
                    <p className="text-3xl font-bold text-yellow-600">{campaign.deferredItems}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Due In</p>
                    <p className={`text-3xl font-bold ${daysRemaining < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {daysRemaining < 0 ? "Overdue" : `${daysRemaining}d`}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filters and Actions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by user or app name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Risk Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risk Levels</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={decisionFilter} onValueChange={setDecisionFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Decision Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Decisions</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                      <SelectItem value="deferred">Deferred</SelectItem>
                    </SelectContent>
                  </Select>

                  {selectedItems.size > 0 && permissions.canWrite && (
                    <Button onClick={() => setBulkDialogOpen(true)} variant="outline">
                      Bulk Action ({selectedItems.size})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Review Items */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Review Items ({filteredItems.length})</CardTitle>
                  {filteredItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleAllItems}
                      />
                      <span className="text-sm text-gray-600">Select All</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {itemsLoading ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-500">Loading review items...</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-12 text-center">
                    <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No items to review</h3>
                    <p className="text-gray-600">All items have been reviewed or no items match the filters</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredItems.map((item) => (
                      <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                            disabled={item.decision !== "pending"}
                          />

                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <User className="h-4 w-4 text-gray-400" />
                                  <h3 className="font-semibold text-gray-900">{item.userName}</h3>
                                  {item.userDepartment && (
                                    <Badge variant="outline">{item.userDepartment}</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  <span>
                                    <strong>App:</strong> {item.appName}
                                  </span>
                                  {item.accessType && (
                                    <span>
                                      <strong>Access:</strong> {item.accessType}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge className={getRiskColor(item.riskLevel)}>{item.riskLevel}</Badge>
                                <Badge className={getDecisionColor(item.decision)}>{item.decision}</Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                              <div>
                                <p className="text-gray-500">Granted</p>
                                <p className="font-medium">{formatDate(item.grantedDate)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Last Used</p>
                                <p className="font-medium">{formatDate(item.lastUsedDate)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Inactive For</p>
                                <p className="font-medium">{getDaysAgo(item.daysSinceLastUse)}</p>
                              </div>
                            </div>

                            {item.businessJustification && (
                              <div className="bg-blue-50 rounded-lg p-3 mb-3">
                                <p className="text-sm text-blue-900">
                                  <strong>Justification:</strong> {item.businessJustification}
                                </p>
                              </div>
                            )}

                            {item.decision !== "pending" && item.reviewerName && (
                              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                <p className="text-sm text-gray-700">
                                  <strong>Reviewed by:</strong> {item.reviewerName} on {formatDate(item.reviewedAt)}
                                </p>
                                {item.decisionNotes && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    <strong>Notes:</strong> {item.decisionNotes}
                                  </p>
                                )}
                              </div>
                            )}

                            {item.decision === "pending" && permissions.canWrite && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-green-300 text-green-700 hover:bg-green-50"
                                  onClick={() => handleDecision(item, "approved")}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-300 text-red-700 hover:bg-red-50"
                                  onClick={() => handleDecision(item, "revoked")}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Revoke
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                                  onClick={() => handleDecision(item, "deferred")}
                                >
                                  <Clock className="h-4 w-4 mr-1" />
                                  Defer
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Decision Dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Review Decision</DialogTitle>
            <DialogDescription>
              Review the access for {currentItem?.userName} to {currentItem?.appName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">User</p>
                  <p className="font-medium">{currentItem?.userName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Application</p>
                  <p className="font-medium">{currentItem?.appName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Access Type</p>
                  <p className="font-medium">{currentItem?.accessType || "N/A"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Risk Level</p>
                  <Badge className={getRiskColor(currentItem?.riskLevel || "low")}>
                    {currentItem?.riskLevel}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="decision">Decision</Label>
              <Select
                value={decisionData.decision}
                onValueChange={(value: any) =>
                  setDecisionData((prev) => ({ ...prev, decision: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve (Keep Access)</SelectItem>
                  <SelectItem value="revoked">Revoke (Remove Access)</SelectItem>
                  <SelectItem value="deferred">Defer (Review Later)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add notes about this decision..."
                value={decisionData.notes}
                onChange={(e) =>
                  setDecisionData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDecision}
              disabled={submitDecisionMutation.isPending}
            >
              {submitDecisionMutation.isPending ? "Submitting..." : "Submit Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Decision Dialog */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Apply the same decision to {selectedItems.size} selected items
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={bulkAction} onValueChange={(value: any) => setBulkAction(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve All</SelectItem>
                  <SelectItem value="revoked">Revoke All</SelectItem>
                  <SelectItem value="deferred">Defer All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-notes">Notes (Optional)</Label>
              <Textarea
                id="bulk-notes"
                placeholder="Add notes for all selected items..."
                value={decisionData.notes}
                onChange={(e) =>
                  setDecisionData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDecision}
              disabled={bulkDecisionMutation.isPending}
            >
              {bulkDecisionMutation.isPending ? "Submitting..." : "Apply to All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingAIAssistant />
    </div>
  );
}
