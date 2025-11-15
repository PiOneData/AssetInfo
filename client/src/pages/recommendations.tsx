import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authenticatedRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { 
  Bot, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  RotateCcw, 
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  Trash2
} from "lucide-react";
import type { Recommendation } from "@shared/schema";

const NO_DATA_COPY = "No meaningful recommendations can be generated because your organization does not have enough ITAM data.";
const RECOMMENDATION_TYPES = [
  "License Optimization",
  "Hardware Refresh",
  "Cost Reduction",
  "Security Risk",
  "Asset Consolidation",
  "General Optimization",
];

type RecommendationRecord = Recommendation & { severity?: string };

export default function Recommendations() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [noDataMessage, setNoDataMessage] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  // Fetch recommendations
  const { data: recommendations = [], isLoading } = useQuery<RecommendationRecord[]>({
    queryKey: ["/api/ai/recommendations", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      const response = await authenticatedRequest("GET", `/api/ai/recommendations?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to load recommendations");
      }
      return response.json();
    },
  });

  // Generate recommendations mutation
  const generateRecommendationsMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedRequest("POST", "/api/ai/recommendations/run");
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to generate recommendations");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.status === "no-data") {
        setNoDataMessage(data.message || NO_DATA_COPY);
        toast({
          title: "Insufficient data",
          description: data.message || NO_DATA_COPY,
        });
        return;
      }
      setNoDataMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/ai/recommendations"] });
      toast({
        title: "Recommendations generated",
        description: "New AI recommendations have been generated based on your current asset data.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate recommendations. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update recommendation status mutation
  const updateRecommendationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await authenticatedRequest("PUT", `/api/recommendations/${id}`, { status });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update recommendation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/recommendations"] });
      toast({
        title: "Recommendation updated",
        description: "The recommendation status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update recommendation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteRecommendationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await authenticatedRequest("DELETE", `/api/recommendations/${id}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to delete recommendation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/recommendations"] });
      toast({
        title: "Recommendation removed",
        description: "The recommendation has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error?.message || "Unable to delete recommendation.",
        variant: "destructive",
      });
    },
  });

  const getRecommendationIcon = (type: string) => {
    const normalized = type.toLowerCase();
    switch (normalized) {
      case "cost reduction":
        return TrendingDown;
      case "hardware refresh":
        return TrendingUp;
      case "license optimization":
        return AlertTriangle;
      case "asset consolidation":
        return RotateCcw;
      case "security risk":
        return AlertTriangle;
      default:
        return Bot;
    }
  };

  const getIconColor = (type: string) => {
    const normalized = type.toLowerCase();
    switch (normalized) {
      case "cost reduction":
        return "text-yellow-600 bg-yellow-100";
      case "hardware refresh":
        return "text-blue-600 bg-blue-100";
      case "license optimization":
        return "text-red-600 bg-red-100";
      case "asset consolidation":
        return "text-green-600 bg-green-100";
      case "security risk":
        return "text-orange-600 bg-orange-100";
      default:
        return "text-purple-600 bg-purple-100";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "accepted":
        return CheckCircle;
      case "dismissed":
        return XCircle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "text-green-600 bg-green-100";
      case "dismissed":
        return "text-red-600 bg-red-100";
      default:
        return "text-yellow-600 bg-yellow-100";
    }
  };

  const handleAcceptRecommendation = (id: string) => {
    if (!permissions.canGenerateAIRecommendations) {
      toast({
        title: "Insufficient permissions",
        description: "Only admins can update recommendation status.",
        variant: "destructive",
      });
      return;
    }
    updateRecommendationMutation.mutate({ id, status: "accepted" });
  };

  const handleDismissRecommendation = (id: string) => {
    if (!permissions.canGenerateAIRecommendations) {
      toast({
        title: "Insufficient permissions",
        description: "Only admins can update recommendation status.",
        variant: "destructive",
      });
      return;
    }
    updateRecommendationMutation.mutate({ id, status: "dismissed" });
  };

  const handleGenerateRecommendations = () => {
    if (!permissions.canGenerateAIRecommendations) {
      toast({
        title: "Insufficient permissions",
        description: "Only admins can generate new recommendations.",
        variant: "destructive",
      });
      return;
    }
    generateRecommendationsMutation.mutate();
  };

  const handleDeleteRecommendation = (id: string) => {
    if (!permissions.canGenerateAIRecommendations) {
      toast({
        title: "Insufficient permissions",
        description: "Only admins can delete recommendations.",
        variant: "destructive",
      });
      return;
    }
    deleteRecommendationMutation.mutate(id);
  };

  // Filter recommendations
  const filteredRecommendations = recommendations.filter((rec: RecommendationRecord) => {
    if (typeFilter !== "all" && rec.type !== typeFilter) return false;
    return true;
  });

  // Calculate total potential savings
  const totalSavings = filteredRecommendations
    .filter((rec) => rec.status === "pending")
    .reduce((sum: number, rec) => 
      sum + parseFloat((rec.potentialSavings as any) || "0"), 0
    );

  useEffect(() => {
    if (recommendations.length > 0) {
      setNoDataMessage("");
    }
  }, [recommendations.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="AI Recommendations"
          description="Optimize your IT infrastructure with AI-powered insights"
          onAddClick={permissions.canGenerateAIRecommendations ? handleGenerateRecommendations : undefined}
          addButtonText="Generate New Recommendations"
          showAddButton={permissions.canGenerateAIRecommendations}
        />
        
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Pending Recommendations</p>
                    <p className="text-3xl font-bold text-foreground">
                      {filteredRecommendations.filter((r: RecommendationRecord) => r.status === "pending").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Bot className="text-purple-600 h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Potential Savings</p>
                    <p className="text-3xl font-bold text-foreground">
                      ${totalSavings.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-600 h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Accepted This Month</p>
                    <p className="text-3xl font-bold text-foreground">
                      {filteredRecommendations.filter((r: RecommendationRecord) => r.status === "accepted").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-blue-600 h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40" data-testid="select-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {RECOMMENDATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {generateRecommendationsMutation.isPending && (
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-spin" />
                <span className="text-sm">Generating recommendations...</span>
              </div>
            )}
          </div>

          {noDataMessage && (
            <div className="rounded-lg border border-dashed border-yellow-400/60 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-900 dark:text-yellow-100">
              {noDataMessage}
            </div>
          )}

          {/* Recommendations List */}
          <div className="space-y-4">
            {filteredRecommendations.map((recommendation: RecommendationRecord) => {
              const Icon = getRecommendationIcon(recommendation.type || "");
              const iconColorClass = getIconColor(recommendation.type || "");
              const StatusIcon = getStatusIcon(recommendation.status);
              const statusColorClass = getStatusColor(recommendation.status);
              const typeLabel = (recommendation.type || "General Optimization").replace(/-/g, " ");
              const severity = (recommendation.severity || recommendation.priority || "medium").toLowerCase();
              const description = recommendation.description?.trim() || "No description available for this recommendation.";
              const generatedAt = recommendation.generatedAt
                ? new Date(recommendation.generatedAt).toLocaleDateString()
                : "Unknown";
              const canModify = permissions.canGenerateAIRecommendations;
              const isPending = recommendation.status === "pending";
              
              return (
                <Card key={recommendation.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className={`w-12 h-12 ${iconColorClass} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {recommendation.title}
                            </h3>
                            <Badge className={`text-xs ${getPriorityColor(severity)}`}>
                              Severity: {severity}
                            </Badge>
                            <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${statusColorClass}`}>
                              <StatusIcon className="h-3 w-3" />
                              <span className="capitalize">{recommendation.status}</span>
                            </div>
                          </div>
                          
                          <p className="text-muted-foreground mb-3">
                            {description}
                          </p>
                          
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span className="capitalize">Type: {typeLabel}</span>
                            {recommendation.potentialSavings && parseFloat(recommendation.potentialSavings) > 0 && (
                              <span className="text-secondary font-medium">
                                Potential savings: ${parseFloat(recommendation.potentialSavings).toLocaleString()}
                              </span>
                            )}
                            <span>Generated: {generatedAt}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        {isPending && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-blue-500 text-blue-600 hover:bg-blue-50"
                              onClick={() => handleAcceptRecommendation(recommendation.id)}
                              disabled={updateRecommendationMutation.isPending || !canModify}
                              data-testid={`button-accept-${recommendation.id}`}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-muted text-muted-foreground hover:bg-muted/20"
                              onClick={() => handleDismissRecommendation(recommendation.id)}
                              disabled={updateRecommendationMutation.isPending || !canModify}
                              data-testid={`button-dismiss-${recommendation.id}`}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                        {canModify && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRecommendation(recommendation.id)}
                            disabled={deleteRecommendationMutation.isPending}
                            data-testid={`button-delete-${recommendation.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {filteredRecommendations.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No recommendations available
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {noDataMessage || "Generate new recommendations to get AI-powered insights about your IT infrastructure."}
                  </p>
                  {permissions.canGenerateAIRecommendations ? (
                    <Button 
                      onClick={handleGenerateRecommendations}
                      disabled={generateRecommendationsMutation.isPending}
                      data-testid="button-generate-recommendations"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Recommendations
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Contact an administrator to generate new recommendations.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );

}