/**
 * Access Requests Page (Phase 6.1)
 * Self-service access request submission and tracking
 */

import { useState, useEffect } from "react";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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

interface AccessRequest {
  id: string;
  appId: string;
  appName: string;
  accessType: string;
  justification: string;
  durationType: string;
  durationHours?: number;
  status: string;
  riskScore: number;
  riskLevel: string;
  riskFactors?: string[];
  sodConflicts?: any[];
  slaDueAt: Date;
  isOverdue: boolean;
  createdAt: Date;
  reviewedAt?: Date;
  approverName?: string;
  approvalNotes?: string;
}

interface SaasApp {
  id: string;
  name: string;
  riskScore: number;
}

export default function AccessRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [apps, setApps] = useState<SaasApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New request form
  const [selectedApp, setSelectedApp] = useState("");
  const [accessType, setAccessType] = useState("member");
  const [justification, setJustification] = useState("");
  const [durationType, setDurationType] = useState("permanent");
  const [durationHours, setDurationHours] = useState("720"); // 30 days

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load user's requests
      const requestsRes = await fetch("/api/access-requests/user/me");
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setRequests(data);
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
        description: "Failed to load access requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
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
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: "me", // Backend will get from session
          appId: selectedApp,
          accessType,
          justification,
          durationType,
          durationHours: durationType === "temporary" ? parseInt(durationHours) : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const result = await res.json();

      toast({
        title: "Request Submitted",
        description: `Your access request has been submitted (Risk: ${result.riskLevel})`,
      });

      setShowNewRequestDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Failed to submit request:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedApp("");
    setAccessType("member");
    setJustification("");
    setDurationType("permanent");
    setDurationHours("720");
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "denied":
        return <Badge variant="outline" className="bg-red-50"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-gray-50">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getRiskBadge(riskLevel: string, riskScore: number) {
    const colors: Record<string, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };

    return (
      <Badge className={colors[riskLevel] || "bg-gray-100"}>
        {riskLevel.toUpperCase()} ({riskScore})
      </Badge>
    );
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Access Requests</h1>
          <p className="text-gray-600 mt-1">
            Request access to applications with automatic approval routing
          </p>
        </div>
        <Button onClick={() => setShowNewRequestDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{requests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {requests.filter(r => r.status === "pending").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {requests.filter(r => r.status === "approved").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {requests.filter(r => r.status === "denied").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>Track the status of your access requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Access Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No access requests yet. Click "New Request" to submit one.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.appName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{request.accessType}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>{getRiskBadge(request.riskLevel, request.riskScore)}</TableCell>
                    <TableCell>
                      {request.durationType === "permanent" ? (
                        <span className="text-sm text-gray-600">Permanent</span>
                      ) : (
                        <span className="text-sm text-gray-600">
                          {request.durationHours}h
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {request.status === "pending" && (
                        <div className="flex items-center gap-1">
                          {request.isOverdue ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Overdue
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-600">
                              {new Date(request.slaDueAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      )}
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
            <DialogTitle>Request Access</DialogTitle>
            <DialogDescription>
              Submit a request for access to an application. Your manager will be notified for approval.
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
              <Label htmlFor="accessType">Access Type *</Label>
              <Select value={accessType} onValueChange={setAccessType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                  <SelectItem value="member">Member (Standard access)</SelectItem>
                  <SelectItem value="admin">Admin (Full control)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="durationType">Duration *</Label>
              <Select value={durationType} onValueChange={setDurationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="temporary">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {durationType === "temporary" && (
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (hours) *</Label>
                <Select value={durationHours} onValueChange={setDurationHours}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours (1 day)</SelectItem>
                    <SelectItem value="168">168 hours (1 week)</SelectItem>
                    <SelectItem value="720">720 hours (30 days)</SelectItem>
                    <SelectItem value="2160">2160 hours (90 days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="justification">Business Justification *</Label>
              <Textarea
                id="justification"
                placeholder="Explain why you need this access..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={4}
              />
              <p className="text-sm text-gray-500">
                Provide a clear business reason for requesting this access.
              </p>
            </div>
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
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
