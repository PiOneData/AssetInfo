/**
 * Segregation of Duties Management Page (Phase 6.3)
 * SoD rule configuration and violation management
 */

import { useState, useEffect } from "react";
import { Plus, Shield, AlertTriangle, CheckCircle, XCircle, FileText } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

interface SodRule {
  id: string;
  name: string;
  severity: string;
  appId1: string;
  appName1: string;
  appId2: string;
  appName2: string;
  rationale: string;
  complianceFramework?: string;
  isActive: boolean;
  createdAt: Date;
}

interface SodViolation {
  id: string;
  sodRuleId: string;
  sodRuleName: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment?: string;
  appId1: string;
  appName1: string;
  appId2: string;
  appName2: string;
  severity: string;
  status: string;
  detectedAt: Date;
  remediation?: string;
}

interface SaasApp {
  id: string;
  name: string;
}

export default function SodManagementPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<SodRule[]>([]);
  const [violations, setViolations] = useState<SodViolation[]>([]);
  const [apps, setApps] = useState<SaasApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRuleDialog, setShowNewRuleDialog] = useState(false);
  const [showComplianceReport, setShowComplianceReport] = useState(false);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // New rule form
  const [ruleName, setRuleName] = useState("");
  const [app1, setApp1] = useState("");
  const [app2, setApp2] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [rationale, setRationale] = useState("");
  const [complianceFramework, setComplianceFramework] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load rules
      const rulesRes = await fetch("/api/sod/rules");
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data);
      }

      // Load violations
      const violationsRes = await fetch("/api/sod/violations");
      if (violationsRes.ok) {
        const data = await violationsRes.json();
        setViolations(data);
      }

      // Load apps
      const appsRes = await fetch("/api/saas-apps");
      if (appsRes.ok) {
        const data = await appsRes.json();
        setApps(data);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load SoD data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function createRule() {
    if (!ruleName.trim() || !app1 || !app2 || !rationale.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (app1 === app2) {
      toast({
        title: "Validation Error",
        description: "Please select two different applications",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sod/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          appId1: app1,
          appId2: app2,
          severity,
          rationale,
          complianceFramework: complianceFramework || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: "Rule Created",
        description: "SoD rule has been created and violations are being scanned",
      });

      setShowNewRuleDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Failed to create rule:", error);
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create SoD rule",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleRule(ruleId: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/sod/rules/${ruleId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: isActive ? "Rule Activated" : "Rule Deactivated",
        description: isActive
          ? "Scanning for violations..."
          : "Associated violations have been marked as resolved",
      });

      loadData();
    } catch (error) {
      console.error("Failed to toggle rule:", error);
      toast({
        title: "Toggle Failed",
        description: error instanceof Error ? error.message : "Failed to toggle rule",
        variant: "destructive",
      });
    }
  }

  async function scanForViolations() {
    try {
      const res = await fetch("/api/sod/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const result = await res.json();

      toast({
        title: "Scan Complete",
        description: `Found ${result.violationsFound} new violations across ${result.totalUsers} users`,
      });

      loadData();
    } catch (error) {
      console.error("Failed to scan:", error);
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan for violations",
        variant: "destructive",
      });
    }
  }

  async function loadComplianceReport(framework?: string) {
    try {
      const url = framework
        ? `/api/sod/compliance-report?framework=${framework}`
        : "/api/sod/compliance-report";

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setComplianceData(data);
      setShowComplianceReport(true);
    } catch (error) {
      console.error("Failed to load report:", error);
      toast({
        title: "Report Failed",
        description: "Failed to generate compliance report",
        variant: "destructive",
      });
    }
  }

  async function remediateViolation(violationId: string, revokeAppId: string) {
    try {
      const res = await fetch(`/api/sod/violations/${violationId}/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revokeAppId,
          notes: "Remediated via SoD Management dashboard",
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({
        title: "Violation Remediated",
        description: "Conflicting access has been revoked",
      });

      loadData();
    } catch (error) {
      console.error("Failed to remediate:", error);
      toast({
        title: "Remediation Failed",
        description: error instanceof Error ? error.message : "Failed to remediate violation",
        variant: "destructive",
      });
    }
  }

  function resetForm() {
    setRuleName("");
    setApp1("");
    setApp2("");
    setSeverity("medium");
    setRationale("");
    setComplianceFramework("");
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
      case "remediated":
        return <Badge variant="outline" className="bg-green-50"><CheckCircle className="h-3 w-3 mr-1" />Remediated</Badge>;
      case "accepted":
        return <Badge variant="outline" className="bg-blue-50">Accepted</Badge>;
      case "resolved":
        return <Badge variant="outline" className="bg-gray-50">Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  const openViolations = violations.filter(v => v.status === "open");
  const criticalViolations = openViolations.filter(v => v.severity === "critical");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Segregation of Duties</h1>
          <p className="text-gray-600 mt-1">
            Prevent conflicting access combinations and ensure compliance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadComplianceReport()}>
            <FileText className="h-4 w-4 mr-2" />
            Compliance Report
          </Button>
          <Button variant="outline" onClick={scanForViolations}>
            <Shield className="h-4 w-4 mr-2" />
            Scan Users
          </Button>
          <Button onClick={() => setShowNewRuleDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rules.filter(r => r.isActive).length}
            </div>
            <p className="text-sm text-gray-600">of {rules.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Open Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{openViolations.length}</div>
          </CardContent>
        </Card>
        <Card className={criticalViolations.length > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Critical Violations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalViolations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Remediated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {violations.filter(v => v.status === "remediated").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="violations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="violations">
            Violations ({openViolations.length})
          </TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
        </TabsList>

        {/* Violations Tab */}
        <TabsContent value="violations">
          <Card>
            <CardHeader>
              <CardTitle>Active Violations</CardTitle>
              <CardDescription>
                Users with conflicting access that violates SoD policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Conflicting Apps</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openViolations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                        <div className="text-lg font-medium text-green-600">No Violations</div>
                        <div className="text-sm text-gray-600">All users are compliant with SoD policies</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    openViolations.map((violation) => (
                      <TableRow key={violation.id}>
                        <TableCell>
                          <div className="font-medium">{violation.userName}</div>
                          <div className="text-sm text-gray-600">{violation.userEmail}</div>
                        </TableCell>
                        <TableCell className="text-sm">{violation.sodRuleName}</TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{violation.appName1}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{violation.appName2}</Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getSeverityBadge(violation.severity)}</TableCell>
                        <TableCell>{getStatusBadge(violation.status)}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {new Date(violation.detectedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => remediateViolation(violation.id, violation.appId1)}
                            >
                              Revoke App 1
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => remediateViolation(violation.id, violation.appId2)}
                            >
                              Revoke App 2
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>SoD Rules</CardTitle>
              <CardDescription>
                Define conflicting application combinations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Conflicting Apps</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Framework</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div>{rule.appName1}</div>
                          <div className="text-gray-400">×</div>
                          <div>{rule.appName2}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                      <TableCell>
                        {rule.complianceFramework ? (
                          <Badge variant="outline">{rule.complianceFramework}</Badge>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Rule Dialog */}
      <Dialog open={showNewRuleDialog} onOpenChange={setShowNewRuleDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create SoD Rule</DialogTitle>
            <DialogDescription>
              Define a conflicting application combination that violates segregation of duties
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name *</Label>
              <Input
                id="ruleName"
                placeholder="e.g., Financial Controls: Accounting & Payments"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="app1">Application 1 *</Label>
                <Select value={app1} onValueChange={setApp1}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select first app" />
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
                <Label htmlFor="app2">Application 2 *</Label>
                <Select value={app2} onValueChange={setApp2}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select second app" />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity *</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="framework">Compliance Framework</Label>
              <Select value={complianceFramework} onValueChange={setComplianceFramework}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional - select framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOX">SOX</SelectItem>
                  <SelectItem value="GDPR">GDPR</SelectItem>
                  <SelectItem value="HIPAA">HIPAA</SelectItem>
                  <SelectItem value="PCI-DSS">PCI-DSS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rationale">Rationale *</Label>
              <Textarea
                id="rationale"
                placeholder="Explain why these apps should not be accessed by the same user..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewRuleDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={createRule} disabled={submitting}>
              {submitting ? "Creating..." : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compliance Report Dialog */}
      <Dialog open={showComplianceReport} onOpenChange={setShowComplianceReport}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>SoD Compliance Report</DialogTitle>
            <DialogDescription>
              {complianceData?.framework} Compliance Status
            </DialogDescription>
          </DialogHeader>

          {complianceData && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Rules</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{complianceData.totalRules}</div>
                    <p className="text-sm text-gray-600">
                      {complianceData.activeRules} active
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Compliance Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${
                      complianceData.complianceStatus === "Compliant"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}>
                      {complianceData.complianceStatus}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Violations by Severity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Critical:</span>
                      <Badge variant="destructive">
                        {complianceData.violationsBySeverity.critical}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">High:</span>
                      <Badge className="bg-orange-600">
                        {complianceData.violationsBySeverity.high}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Medium:</span>
                      <Badge className="bg-yellow-600">
                        {complianceData.violationsBySeverity.medium}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Low:</span>
                      <Badge className="bg-green-600">
                        {complianceData.violationsBySeverity.low}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Total Violations</div>
                  <div className="text-2xl font-bold">{complianceData.totalViolations}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Open Violations</div>
                  <div className="text-2xl font-bold text-red-600">
                    {complianceData.openViolations}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Remediated</div>
                  <div className="text-2xl font-bold text-green-600">
                    {complianceData.remediatedViolations}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-gray-600">Accepted</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {complianceData.acceptedViolations}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowComplianceReport(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
