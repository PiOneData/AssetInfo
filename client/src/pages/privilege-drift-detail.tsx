/**
 * Phase 5: Privilege Drift Detail Page
 *
 * Detailed view and resolution workflow for privilege drift alerts
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Briefcase,
  AppWindow,
  Shield,
  Calendar,
} from "lucide-react";

interface PrivilegeDriftAlert {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  roleTemplateId: string;
  roleName: string;
  expectedApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    required: boolean;
  }>;
  actualApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
  }>;
  excessApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
  }>;
  missingApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    required: boolean;
  }>;
  riskScore: number;
  riskLevel: string;
  riskFactors: string[];
  recommendedAction: string;
  status: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionType?: string;
  resolutionNotes?: string;
  detectedAt: string;
}

export default function PrivilegeDriftDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionType, setResolutionType] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  const alertId = params.id as string;

  // Fetch alert details
  const { data: alert, isLoading } = useQuery({
    queryKey: ["privilege-drift", alertId],
    queryFn: async () => {
      const res = await authenticatedRequest(`/api/privilege-drift/${alertId}`);
      return res.alert as PrivilegeDriftAlert;
    },
  });

  // Resolve alert mutation
  const resolveAlertMutation = useMutation({
    mutationFn: async ({
      resolutionType,
      resolutionNotes,
    }: {
      resolutionType: string;
      resolutionNotes: string;
    }) => {
      return authenticatedRequest(`/api/privilege-drift/${alertId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutionType, resolutionNotes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privilege-drift", alertId] });
      queryClient.invalidateQueries({ queryKey: ["privilege-drift"] });
      toast({
        title: "Success",
        description: "Alert resolved successfully",
      });
      setResolveDialogOpen(false);
      setResolutionType("");
      setResolutionNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleResolve = () => {
    if (!resolutionType) {
      toast({
        title: "Validation Error",
        description: "Please select a resolution type",
        variant: "destructive",
      });
      return;
    }

    resolveAlertMutation.mutate({ resolutionType, resolutionNotes });
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "high":
        return <Badge className="bg-orange-500">High</Badge>;
      case "medium":
        return <Badge className="bg-blue-500">Medium</Badge>;
      case "low":
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Open</Badge>;
      case "resolved":
        return <Badge variant="default" className="bg-green-600">Resolved</Badge>;
      case "acknowledged":
        return <Badge variant="secondary">Acknowledged</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center py-12 text-gray-500">Loading alert details...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center py-12 text-gray-500">Alert not found</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/access-reviews")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Privilege Drift Alert</h1>
                  <p className="text-gray-600 mt-1">
                    Detected {new Date(alert.detectedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getRiskBadge(alert.riskLevel)}
                {getStatusBadge(alert.status)}
              </div>
            </div>

            {/* Alert Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Alert Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">User</div>
                      <div className="font-medium">{alert.userName}</div>
                      <div className="text-sm text-gray-600">{alert.userEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Role</div>
                      <div className="font-medium">{alert.roleName}</div>
                      <div className="text-sm text-gray-600">{alert.userDepartment}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Risk Score</div>
                      <div className="font-medium">{alert.riskScore} / 100</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <AppWindow className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Excess Apps</div>
                      <div className="font-medium">{alert.excessApps.length}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Factors */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Factors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alert.riskFactors.map((factor, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5" />
                      <span className="text-sm">{factor}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recommended Action */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900">Recommended Action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-800">{alert.recommendedAction}</p>
              </CardContent>
            </Card>

            {/* Excess Apps */}
            {alert.excessApps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    Excess Applications ({alert.excessApps.length})
                  </CardTitle>
                  <CardDescription>
                    Apps the user has access to but are not in their role template
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alert.excessApps.map((app) => (
                      <div
                        key={app.appId}
                        className="flex items-center justify-between p-3 border rounded-lg bg-orange-50 border-orange-200"
                      >
                        <div className="flex items-center gap-3">
                          <AppWindow className="w-5 h-5 text-orange-600" />
                          <div>
                            <div className="font-medium">{app.appName}</div>
                            <div className="text-sm text-gray-600">
                              Access Type: {app.accessType}
                            </div>
                          </div>
                        </div>
                        <Badge variant="destructive">Excess</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Missing Required Apps */}
            {alert.missingApps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    Missing Required Applications ({alert.missingApps.length})
                  </CardTitle>
                  <CardDescription>
                    Required apps the user should have but doesn't
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alert.missingApps.map((app) => (
                      <div
                        key={app.appId}
                        className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-200"
                      >
                        <div className="flex items-center gap-3">
                          <AppWindow className="w-5 h-5 text-red-600" />
                          <div>
                            <div className="font-medium">{app.appName}</div>
                            <div className="text-sm text-gray-600">
                              Expected Access: {app.accessType}
                            </div>
                          </div>
                        </div>
                        <Badge variant="destructive">Missing</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resolution Info */}
            {alert.status === "resolved" && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-green-900 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Resolution Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="font-medium text-green-900">Resolution Type:</span>{" "}
                    <span className="text-green-800">
                      {alert.resolutionType?.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-green-900">Resolved By:</span>{" "}
                    <span className="text-green-800">{alert.resolvedBy}</span>
                  </div>
                  <div>
                    <span className="font-medium text-green-900">Resolved At:</span>{" "}
                    <span className="text-green-800">
                      {alert.resolvedAt && new Date(alert.resolvedAt).toLocaleString()}
                    </span>
                  </div>
                  {alert.resolutionNotes && (
                    <div>
                      <span className="font-medium text-green-900">Notes:</span>
                      <p className="text-green-800 mt-1">{alert.resolutionNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            {alert.status === "open" && (
              <div className="flex gap-2 justify-end">
                <Button onClick={() => setResolveDialogOpen(true)}>
                  Resolve Alert
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Resolve Alert Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Privilege Drift Alert</DialogTitle>
            <DialogDescription>
              Choose how to resolve this privilege drift alert
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="resolutionType">Resolution Type *</Label>
              <Select value={resolutionType} onValueChange={setResolutionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revoked">
                    Revoked - Excess apps removed
                  </SelectItem>
                  <SelectItem value="role_updated">
                    Role Updated - User assigned new role
                  </SelectItem>
                  <SelectItem value="false_positive">
                    False Positive - No action needed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Resolution Notes</Label>
              <Textarea
                id="notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Optional notes about the resolution"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolve}>Resolve Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloatingAIAssistant />
    </div>
  );
}
