/**
 * Phase 5: Overprivileged Account Detail Page
 *
 * Detailed view and remediation workflow for overprivileged accounts
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
  Shield,
  User,
  Briefcase,
  AppWindow,
  Clock,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";

interface OverprivilegedAccount {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  userTitle: string;
  adminAppCount: number;
  adminApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    grantedAt: string;
    lastUsedAt: string;
    daysSinceLastUse: number;
  }>;
  staleAdminCount: number;
  staleAdminApps: Array<{
    appId: string;
    appName: string;
    daysSinceLastUse: number;
  }>;
  crossDeptAdminCount: number;
  crossDeptAdminApps: Array<{
    appId: string;
    appName: string;
    appCategory: string;
  }>;
  riskScore: number;
  riskLevel: string;
  riskFactors: string[];
  recommendedAction: string;
  recommendedAppsToDowngrade: string[];
  leastPrivilegeAlternative: string;
  status: string;
  remediationPlan?: string;
  remediationDeadline?: string;
  remediatedBy?: string;
  remediatedAt?: string;
  businessJustification?: string;
  justificationExpiry?: string;
  detectedAt: string;
}

export default function OverprivilegedAccountDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [remediateDialogOpen, setRemediateDialogOpen] = useState(false);
  const [remediationType, setRemediationType] = useState<string>("");
  const [remediationNotes, setRemediationNotes] = useState("");
  const [businessJustification, setBusinessJustification] = useState("");

  const accountId = params.id as string;

  // Fetch account details
  const { data: account, isLoading } = useQuery({
    queryKey: ["overprivileged-account", accountId],
    queryFn: async () => {
      const res = await authenticatedRequest(`/api/overprivileged-accounts/${accountId}`);
      return res.account as OverprivilegedAccount;
    },
  });

  // Remediate account mutation
  const remediateAccountMutation = useMutation({
    mutationFn: async ({
      remediationType,
      remediationNotes,
      businessJustification,
    }: {
      remediationType: string;
      remediationNotes: string;
      businessJustification?: string;
    }) => {
      return authenticatedRequest(`/api/overprivileged-accounts/${accountId}/remediate`, {
        method: "POST",
        body: JSON.stringify({
          remediationType,
          remediationNotes,
          businessJustification,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overprivileged-account", accountId] });
      queryClient.invalidateQueries({ queryKey: ["overprivileged-accounts"] });
      toast({
        title: "Success",
        description: "Account remediated successfully",
      });
      setRemediateDialogOpen(false);
      setRemediationType("");
      setRemediationNotes("");
      setBusinessJustification("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRemediate = () => {
    if (!remediationType) {
      toast({
        title: "Validation Error",
        description: "Please select a remediation type",
        variant: "destructive",
      });
      return;
    }

    if (remediationType === "accept_risk" && !businessJustification) {
      toast({
        title: "Validation Error",
        description: "Business justification required for accepting risk",
        variant: "destructive",
      });
      return;
    }

    remediateAccountMutation.mutate({
      remediationType,
      remediationNotes,
      businessJustification: remediationType === "accept_risk" ? businessJustification : undefined,
    });
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
      case "remediated":
        return <Badge variant="default" className="bg-green-600">Remediated</Badge>;
      case "in_progress":
        return <Badge variant="secondary">In Progress</Badge>;
      case "accepted":
        return <Badge variant="outline">Risk Accepted</Badge>;
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
              <div className="text-center py-12 text-gray-500">Loading account details...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center py-12 text-gray-500">Account not found</div>
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
                  <h1 className="text-3xl font-bold text-gray-900">Overprivileged Account</h1>
                  <p className="text-gray-600 mt-1">
                    Detected {new Date(account.detectedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getRiskBadge(account.riskLevel)}
                {getStatusBadge(account.status)}
              </div>
            </div>

            {/* Account Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Account Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">User</div>
                      <div className="font-medium">{account.userName}</div>
                      <div className="text-sm text-gray-600">{account.userEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Department & Title</div>
                      <div className="font-medium">{account.userDepartment}</div>
                      <div className="text-sm text-gray-600">{account.userTitle}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Admin Apps</div>
                      <div className="font-medium">{account.adminAppCount} applications</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-500">Risk Score</div>
                      <div className="font-medium">{account.riskScore} / 100</div>
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
                  {account.riskFactors.map((factor, idx) => (
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
                <p className="text-blue-800 mb-3">{account.recommendedAction}</p>
                <div className="text-sm text-blue-700">
                  <div className="font-medium mb-1">Least Privilege Alternative:</div>
                  <p>{account.leastPrivilegeAlternative}</p>
                </div>
              </CardContent>
            </Card>

            {/* Admin Apps */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-orange-500" />
                  Admin Applications ({account.adminAppCount})
                </CardTitle>
                <CardDescription>
                  All applications where the user has admin access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {account.adminApps.map((app) => {
                    const isStale = app.daysSinceLastUse >= 90;
                    return (
                      <div
                        key={app.appId}
                        className={`flex items-center justify-between p-3 border rounded-lg ${
                          isStale
                            ? "bg-red-50 border-red-200"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <AppWindow className="w-5 h-5 text-gray-600" />
                          <div>
                            <div className="font-medium">{app.appName}</div>
                            <div className="text-sm text-gray-600 flex items-center gap-2">
                              <span>Access Type: {app.accessType}</span>
                              <span className="text-gray-400">•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last used {app.daysSinceLastUse} days ago
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Granted {new Date(app.grantedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {isStale && <Badge variant="destructive">Stale</Badge>}
                        {account.recommendedAppsToDowngrade.includes(app.appId) && (
                          <Badge variant="outline" className="ml-2">
                            Recommended for downgrade
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Stale Admin Apps */}
            {account.staleAdminCount > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-900">
                    <AlertTriangle className="w-5 h-5" />
                    Stale Admin Access ({account.staleAdminCount})
                  </CardTitle>
                  <CardDescription className="text-red-700">
                    Admin access not used in 90+ days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {account.staleAdminApps.map((app) => (
                      <div
                        key={app.appId}
                        className="flex items-center justify-between p-2 bg-white rounded border border-red-200"
                      >
                        <span className="font-medium text-red-900">{app.appName}</span>
                        <span className="text-sm text-red-700">
                          {app.daysSinceLastUse} days unused
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cross-Department Admin */}
            {account.crossDeptAdminCount > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-900">
                    <AlertCircle className="w-5 h-5" />
                    Cross-Department Admin ({account.crossDeptAdminCount})
                  </CardTitle>
                  <CardDescription className="text-orange-700">
                    Admin access to apps outside user's department
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {account.crossDeptAdminApps.map((app) => (
                      <div
                        key={app.appId}
                        className="flex items-center justify-between p-2 bg-white rounded border border-orange-200"
                      >
                        <span className="font-medium text-orange-900">{app.appName}</span>
                        <Badge variant="outline">{app.appCategory}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Business Justification (if accepted) */}
            {account.status === "accepted" && account.businessJustification && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <CardTitle className="text-yellow-900">Business Justification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-yellow-800">{account.businessJustification}</p>
                  {account.justificationExpiry && (
                    <div className="text-sm text-yellow-700">
                      Expires: {new Date(account.justificationExpiry).toLocaleDateString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Remediation Info */}
            {account.status === "remediated" && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-green-900 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Remediation Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="font-medium text-green-900">Remediated By:</span>{" "}
                    <span className="text-green-800">{account.remediatedBy}</span>
                  </div>
                  <div>
                    <span className="font-medium text-green-900">Remediated At:</span>{" "}
                    <span className="text-green-800">
                      {account.remediatedAt && new Date(account.remediatedAt).toLocaleString()}
                    </span>
                  </div>
                  {account.remediationPlan && (
                    <div>
                      <span className="font-medium text-green-900">Plan:</span>
                      <p className="text-green-800 mt-1">{account.remediationPlan}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            {(account.status === "open" || account.status === "in_progress") && (
              <div className="flex gap-2 justify-end">
                <Button onClick={() => setRemediateDialogOpen(true)}>
                  Remediate Account
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Remediate Account Dialog */}
      <Dialog open={remediateDialogOpen} onOpenChange={setRemediateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Remediate Overprivileged Account</DialogTitle>
            <DialogDescription>
              Choose how to remediate this overprivileged account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="remediationType">Remediation Type *</Label>
              <Select value={remediationType} onValueChange={setRemediationType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select remediation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="downgrade">
                    Downgrade - Remove admin access from stale apps
                  </SelectItem>
                  <SelectItem value="implement_jit">
                    Implement JIT - Set up just-in-time access
                  </SelectItem>
                  <SelectItem value="require_mfa">
                    Require MFA - Add multi-factor authentication
                  </SelectItem>
                  <SelectItem value="accept_risk">
                    Accept Risk - Admin access is justified
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {remediationType === "accept_risk" && (
              <div>
                <Label htmlFor="justification">Business Justification *</Label>
                <Textarea
                  id="justification"
                  value={businessJustification}
                  onChange={(e) => setBusinessJustification(e.target.value)}
                  placeholder="Explain why this admin access is necessary..."
                  rows={3}
                />
              </div>
            )}

            <div>
              <Label htmlFor="notes">Remediation Notes</Label>
              <Textarea
                id="notes"
                value={remediationNotes}
                onChange={(e) => setRemediationNotes(e.target.value)}
                placeholder="Optional notes about the remediation"
                rows={3}
              />
            </div>

            {account.recommendedAppsToDowngrade.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="font-medium text-blue-900 mb-2">
                  Recommended Apps to Downgrade:
                </div>
                <div className="text-sm text-blue-800">
                  {account.recommendedAppsToDowngrade.join(", ")}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemediateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRemediate}>Remediate Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloatingAIAssistant />
    </div>
  );
}
