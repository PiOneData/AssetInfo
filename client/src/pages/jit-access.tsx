/**
 * JIT Access Page (Phase 6.2)
 * Just-In-Time access management for temporary privilege elevation
 */

import { useState, useEffect } from "react";
import { Plus, Clock, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface JitSession {
  id: string;
  appId: string;
  appName: string;
  accessType: string;
  previousAccessType?: string;
  justification: string;
  durationHours: number;
  startsAt: Date;
  expiresAt: Date;
  status: string;
  requiresApproval: boolean;
  requiresMfa: boolean;
  mfaVerified: boolean;
  approverName?: string;
  createdAt: Date;
}

interface SaasApp {
  id: string;
  name: string;
  riskScore: number;
}

export default function JitAccessPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<JitSession[]>([]);
  const [apps, setApps] = useState<SaasApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New request form
  const [selectedApp, setSelectedApp] = useState("");
  const [accessType, setAccessType] = useState("admin");
  const [durationHours, setDurationHours] = useState("4");
  const [justification, setJustification] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(true);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds to update expiry times
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load user's JIT sessions
      const sessionsRes = await fetch("/api/jit-access?userId=me");
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data);
      }

      // Load available apps
      const appsRes = await fetch("/api/saas-apps");
      if (appsRes.ok) {
        const data = await appsRes.json();
        setApps(data);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load JIT sessions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function requestJitAccess() {
    if (!selectedApp || !justification.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select an app and provide justification",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/jit-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "me",
          appId: selectedApp,
          accessType,
          justification,
          durationHours: parseInt(durationHours),
          requiresMfa,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const result = await res.json();

      toast({
        title: "JIT Request Submitted",
        description: result.requiresApproval
          ? "Your request has been sent to your manager for approval"
          : result.requiresMfa
          ? "Please verify MFA to activate your session"
          : "Your session is now active",
      });

      setShowNewRequestDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Failed to request JIT access:", error);
      toast({
        title: "Request Failed",
        description: error instanceof Error ? error.message : "Failed to request JIT access",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!confirm("Are you sure you want to revoke this JIT session?")) {
      return;
    }

    try {
      const res = await fetch(`/api/jit-access/${sessionId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "User requested revocation",
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: "Session Revoked",
        description: "Your JIT session has been revoked",
      });

      loadData();
    } catch (error) {
      console.error("Failed to revoke session:", error);
      toast({
        title: "Revocation Failed",
        description: error instanceof Error ? error.message : "Failed to revoke session",
        variant: "destructive",
      });
    }
  }

  function resetForm() {
    setSelectedApp("");
    setAccessType("admin");
    setDurationHours("4");
    setJustification("");
    setRequiresMfa(true);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending_approval":
        return <Badge variant="outline" className="bg-yellow-50">Pending Approval</Badge>;
      case "pending_mfa":
        return <Badge variant="outline" className="bg-blue-50">Pending MFA</Badge>;
      case "active":
        return <Badge className="bg-green-600">Active</Badge>;
      case "expired":
        return <Badge variant="outline" className="bg-gray-50">Expired</Badge>;
      case "revoked":
        return <Badge variant="destructive">Revoked</Badge>;
      case "denied":
        return <Badge variant="destructive">Denied</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getTimeRemaining(expiresAt: Date): { percentage: number; text: string } {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    const total = expiry - now;

    if (total <= 0) {
      return { percentage: 0, text: "Expired" };
    }

    const hours = Math.floor(total / (1000 * 60 * 60));
    const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));

    // Calculate percentage (assuming max 72 hours)
    const maxDuration = 72 * 60 * 60 * 1000;
    const percentage = Math.min(100, (total / maxDuration) * 100);

    if (hours > 24) {
      return { percentage, text: `${Math.floor(hours / 24)}d ${hours % 24}h remaining` };
    }
    return { percentage, text: `${hours}h ${minutes}m remaining` };
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  const activeSessions = sessions.filter(s => s.status === "active");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Just-In-Time Access</h1>
          <p className="text-gray-600 mt-1">
            Request temporary elevated privileges with automatic revocation
          </p>
        </div>
        <Button onClick={() => setShowNewRequestDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Request Elevation
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeSessions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {sessions.filter(s => s.status === "pending_approval").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending MFA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {sessions.filter(s => s.status === "pending_mfa").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Active Elevated Access
            </CardTitle>
            <CardDescription>
              These sessions will automatically expire and revert to previous access level
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeSessions.map((session) => {
              const timeRemaining = getTimeRemaining(session.expiresAt);
              return (
                <div key={session.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{session.appName}</div>
                      <div className="text-sm text-gray-600">
                        Elevated to: <Badge variant="outline">{session.accessType}</Badge>
                        {session.previousAccessType && (
                          <span className="ml-2">
                            (was: {session.previousAccessType})
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => revokeSession(session.id)}
                    >
                      Revoke
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{timeRemaining.text}</span>
                      <span className="text-gray-600">
                        Expires: {new Date(session.expiresAt).toLocaleString()}
                      </span>
                    </div>
                    <Progress value={timeRemaining.percentage} className="h-2" />
                  </div>

                  {session.requiresMfa && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Shield className="h-4 w-4" />
                      MFA Verified
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* All Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
          <CardDescription>View history of all JIT access requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Access Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No JIT sessions yet. Click "Request Elevation" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.appName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{session.accessType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {session.durationHours}h
                    </TableCell>
                    <TableCell>{getStatusBadge(session.status)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {new Date(session.expiresAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Request Dialog */}
      <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Temporary Elevated Access</DialogTitle>
            <DialogDescription>
              Request temporary admin or owner access that will automatically expire
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="app">Application *</Label>
              <Select value={selectedApp} onValueChange={setSelectedApp}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessType">Elevated Access Type *</Label>
              <Select value={accessType} onValueChange={setAccessType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration *</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="8">8 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                Access will automatically expire after this duration
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="justification">Justification *</Label>
              <Textarea
                id="justification"
                placeholder="Explain why you need temporary elevated access..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
              <div className="text-sm">
                <div className="font-medium text-blue-900">MFA Required</div>
                <div className="text-blue-700">
                  You will need to verify multi-factor authentication before access is granted
                </div>
              </div>
            </div>

            {parseInt(durationHours) > 8 && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div className="text-sm text-yellow-900">
                  Requests longer than 8 hours may require manager approval
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewRequestDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={requestJitAccess} disabled={submitting}>
              {submitting ? "Submitting..." : "Request Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
