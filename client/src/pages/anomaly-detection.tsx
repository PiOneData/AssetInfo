/**
 * Anomaly Detection Dashboard (Phase 6.5)
 * Behavioral anomaly investigation and management
 */

import { useState, useEffect } from "react";
import { AlertTriangle, Shield, Clock, TrendingUp, Search, CheckCircle2, XCircle } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnomalyDetection {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  appId: string;
  appName: string;
  anomalyType: string;
  anomalyName: string;
  severity: string;
  confidence: number;
  description: string;
  detectedAt: Date;
  status: string;
  eventData?: any;
  baselineData?: any;
  investigatedBy?: string;
  investigatedAt?: Date;
  investigationNotes?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
}

interface Statistics {
  period: string;
  totalDetected: number;
  byStatus: {
    open: number;
    investigating: number;
    confirmed: number;
    falsePositive: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<string, number>;
  falsePositiveRate: string;
}

export default function AnomalyDetectionPage() {
  const { toast } = useToast();
  const [anomalies, setAnomalies] = useState<AnomalyDetection[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyDetection | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showInvestigateDialog, setShowInvestigateDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [investigationNotes, setInvestigationNotes] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isFalsePositive, setIsFalsePositive] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, [filterSeverity, filterStatus]);

  async function loadData() {
    setLoading(true);
    try {
      // Build query params
      const params = new URLSearchParams();
      if (filterSeverity !== "all") params.append("severity", filterSeverity);
      if (filterStatus !== "all") params.append("status", filterStatus);

      // Load anomalies
      const anomaliesRes = await fetch(`/api/anomalies?${params.toString()}`);
      if (anomaliesRes.ok) {
        const data = await anomaliesRes.json();
        setAnomalies(data);
      }

      // Load statistics (last 30 days)
      const statsRes = await fetch("/api/anomalies/statistics/30");
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStatistics(data);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load anomaly data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function investigateAnomaly() {
    if (!selectedAnomaly || !investigationNotes.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide investigation notes",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`/api/anomalies/${selectedAnomaly.id}/investigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: investigationNotes }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: "Investigation Started",
        description: "Anomaly has been marked as under investigation",
      });

      setShowInvestigateDialog(false);
      setInvestigationNotes("");
      loadData();
    } catch (error) {
      console.error("Failed to investigate:", error);
      toast({
        title: "Investigation Failed",
        description: error instanceof Error ? error.message : "Failed to start investigation",
        variant: "destructive",
      });
    }
  }

  async function resolveAnomaly() {
    if (!selectedAnomaly || !resolutionNotes.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide resolution notes",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`/api/anomalies/${selectedAnomaly.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFalsePositive,
          notes: resolutionNotes,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: "Anomaly Resolved",
        description: isFalsePositive
          ? "Marked as false positive"
          : "Confirmed as security incident",
      });

      setShowResolveDialog(false);
      setResolutionNotes("");
      setIsFalsePositive(false);
      loadData();
    } catch (error) {
      console.error("Failed to resolve:", error);
      toast({
        title: "Resolution Failed",
        description: error instanceof Error ? error.message : "Failed to resolve anomaly",
        variant: "destructive",
      });
    }
  }

  function getSeverityBadge(severity: string) {
    const colors: Record<string, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };

    return (
      <Badge className={colors[severity] || "bg-gray-100"}>
        {severity.toUpperCase()}
      </Badge>
    );
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "open":
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Open</Badge>;
      case "investigating":
        return <Badge className="bg-blue-600"><Search className="h-3 w-3 mr-1" />Investigating</Badge>;
      case "confirmed":
        return <Badge className="bg-red-600"><Shield className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case "false_positive":
        return <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="h-3 w-3 mr-1" />False Positive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getAnomalyTypeIcon(type: string) {
    switch (type) {
      case "after_hours_access":
      case "weekend_access":
        return <Clock className="h-4 w-4" />;
      case "geographic_anomaly":
        return <TrendingUp className="h-4 w-4" />;
      case "privilege_escalation":
      case "failed_login_spike":
        return <Shield className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  const openAnomalies = anomalies.filter(a => a.status === "open");
  const criticalAnomalies = openAnomalies.filter(a => a.severity === "critical");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Anomaly Detection</h1>
          <p className="text-gray-600 mt-1">
            Monitor and investigate suspicious user behavior patterns
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Detected (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalDetected}</div>
            </CardContent>
          </Card>
          <Card className={criticalAnomalies.length > 0 ? "border-red-300 bg-red-50" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Critical Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{criticalAnomalies.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Investigating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {statistics.byStatus.investigating}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Confirmed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {statistics.byStatus.confirmed}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">False Positive Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statistics.falsePositiveRate}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="severity">Severity</Label>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="status">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomalies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detected Anomalies</CardTitle>
          <CardDescription>
            Review and investigate suspicious behavior patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Anomaly Type</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                    <div className="text-lg font-medium text-green-600">No Anomalies Detected</div>
                    <div className="text-sm text-gray-600">All user behavior appears normal</div>
                  </TableCell>
                </TableRow>
              ) : (
                anomalies.map((anomaly) => (
                  <TableRow key={anomaly.id}>
                    <TableCell>
                      <div className="font-medium">{anomaly.userName}</div>
                      <div className="text-sm text-gray-600">{anomaly.userEmail}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getAnomalyTypeIcon(anomaly.anomalyType)}
                        <span className="text-sm">{anomaly.anomalyName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{anomaly.appName}</TableCell>
                    <TableCell>{getSeverityBadge(anomaly.severity)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{anomaly.confidence}%</div>
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              anomaly.confidence >= 80
                                ? "bg-green-600"
                                : anomaly.confidence >= 60
                                ? "bg-yellow-600"
                                : "bg-red-600"
                            }`}
                            style={{ width: `${anomaly.confidence}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(anomaly.status)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {new Date(anomaly.detectedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedAnomaly(anomaly);
                            setShowDetailsDialog(true);
                          }}
                        >
                          Details
                        </Button>
                        {anomaly.status === "open" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedAnomaly(anomaly);
                              setShowInvestigateDialog(true);
                            }}
                          >
                            Investigate
                          </Button>
                        )}
                        {anomaly.status === "investigating" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedAnomaly(anomaly);
                              setShowResolveDialog(true);
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anomaly Details</DialogTitle>
            <DialogDescription>
              {selectedAnomaly?.anomalyName}
            </DialogDescription>
          </DialogHeader>

          {selectedAnomaly && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-600">User</Label>
                  <div className="font-medium">{selectedAnomaly.userName}</div>
                  <div className="text-sm text-gray-600">{selectedAnomaly.userEmail}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Application</Label>
                  <div className="font-medium">{selectedAnomaly.appName}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Severity</Label>
                  <div>{getSeverityBadge(selectedAnomaly.severity)}</div>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Confidence</Label>
                  <div className="font-medium">{selectedAnomaly.confidence}%</div>
                </div>
              </div>

              <div>
                <Label className="text-sm text-gray-600">Description</Label>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedAnomaly.description}
                </div>
              </div>

              <div>
                <Label className="text-sm text-gray-600">Detected At</Label>
                <div className="font-medium">
                  {new Date(selectedAnomaly.detectedAt).toLocaleString()}
                </div>
              </div>

              {selectedAnomaly.investigationNotes && (
                <div>
                  <Label className="text-sm text-gray-600">Investigation Notes</Label>
                  <div className="mt-1 p-3 bg-blue-50 rounded-lg text-sm">
                    {selectedAnomaly.investigationNotes}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    By {selectedAnomaly.investigatedBy} on{" "}
                    {selectedAnomaly.investigatedAt &&
                      new Date(selectedAnomaly.investigatedAt).toLocaleString()}
                  </div>
                </div>
              )}

              {selectedAnomaly.resolutionNotes && (
                <div>
                  <Label className="text-sm text-gray-600">Resolution Notes</Label>
                  <div className="mt-1 p-3 bg-green-50 rounded-lg text-sm">
                    {selectedAnomaly.resolutionNotes}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    By {selectedAnomaly.resolvedBy} on{" "}
                    {selectedAnomaly.resolvedAt &&
                      new Date(selectedAnomaly.resolvedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowDetailsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Investigate Dialog */}
      <Dialog open={showInvestigateDialog} onOpenChange={setShowInvestigateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Investigation</DialogTitle>
            <DialogDescription>
              Provide investigation notes for this anomaly
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="investigation">Investigation Notes *</Label>
              <Textarea
                id="investigation"
                placeholder="Describe your investigation findings..."
                value={investigationNotes}
                onChange={(e) => setInvestigationNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvestigateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={investigateAnomaly}>Start Investigation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Anomaly</DialogTitle>
            <DialogDescription>
              Mark this anomaly as confirmed or false positive
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Resolution Type</Label>
              <Select
                value={isFalsePositive ? "false_positive" : "confirmed"}
                onValueChange={(value) => setIsFalsePositive(value === "false_positive")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Confirmed Security Incident
                    </div>
                  </SelectItem>
                  <SelectItem value="false_positive">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      False Positive
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution Notes *</Label>
              <Textarea
                id="resolution"
                placeholder="Describe the resolution and any actions taken..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={resolveAnomaly}>Resolve Anomaly</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
