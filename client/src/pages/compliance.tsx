import { useMemo, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  useComplianceOverview,
  useTenantAssets,
  useAssetDeletion,
  useAssetUpdate,
  type ComplianceIssue,
  type HighRiskAsset,
  type ComplianceAssetSummary,
} from "@/hooks/use-compliance";
import { ComplianceAssetTable } from "@/components/compliance/asset-table";
import { RemediationModal, RemediationContext } from "@/components/compliance/remediation-modal";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceSoftware } from "@/components/assets/DeviceSoftware";
import { AssetForm } from "@/components/assets/asset-form";
import type { InsertAsset } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";

const severityStyles: Record<ComplianceIssue["severity"], string> = {
  low: "bg-emerald-500/10 text-emerald-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-orange-500/10 text-orange-400",
  critical: "bg-red-500/10 text-red-400",
};

const riskFactorMappings = [
  { match: /missing owner/i, key: "missingUser", label: "Missing Owner" },
  { match: /missing location/i, key: "missingLocation", label: "Missing Location" },
  { match: /no warranty/i, key: "noWarranty", label: "No Warranty" },
  { match: /expired warranty/i, key: "expiredWarranty", label: "Expired Warranty" },
  { match: /outdated os/i, key: "outdatedOs", label: "Outdated OS" },
  { match: /unauthorized software/i, key: "unlicensedSoftware", label: "Unlicensed Software" },
  { match: /idle/i, key: "idleAssets", label: "Idle Asset" },
  { match: /patch/i, key: "missingPatches", label: "Missing Patches" },
];

const emptyMessages: Record<string, string> = {
  missingUser: "No assets missing owners",
  missingLocation: "All assets have locations",
  noWarranty: "All devices have warranty details",
  expiredWarranty: "No expired warranties found",
  unlicensedSoftware: "No unlicensed software detected",
  outdatedOs: "No outdated operating systems found",
  missingPatches: "No endpoints with missing patches",
  duplicateAssignments: "No duplicate assignments detected",
  idleAssets: "No idle assets beyond 90 days",
  default: "No records available",
};

function buildHighRiskSummary(asset: HighRiskAsset): ComplianceAssetSummary {
  return {
    id: asset.id,
    name: asset.name,
    serialNumber: null,
    model: null,
    manufacturer: null,
    category: null,
    type: null,
    status: asset.status,
    version: null,
    licenseType: null,
    warrantyExpiry: null,
    purchaseDate: null,
    purchaseCost: null,
    ipAddress: null,
    hostname: null,
    os: null,
    location: asset.location,
    assignedUserName: asset.owner,
    assignedUserEmail: null,
    assignedUserEmployeeId: null,
    riskFactors: asset.riskFactors,
  };
}

export default function ComplianceOverviewPage() {
  const { data, isLoading } = useComplianceOverview();
  const { data: allAssets = [] } = useTenantAssets();
  const assetLookup = useMemo(() => {
    const map = new Map<string, any>();
    allAssets.forEach((asset: any) => map.set(asset.id, asset));
    return map;
  }, [allAssets]);

  const [, navigate] = useLocation();
  const deleteAssetMutation = useAssetDeletion();
  const updateAssetMutation = useAssetUpdate();
  const deletingAssetId =
    typeof deleteAssetMutation.variables === "string" ? deleteAssetMutation.variables : null;
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [expandedHighRiskId, setExpandedHighRiskId] = useState<string | null>(null);
  const [viewingAsset, setViewingAsset] = useState<any | null>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [remediationContext, setRemediationContext] = useState<RemediationContext | null>(null);
  const [resolvedIssueAssets, setResolvedIssueAssets] = useState<Record<string, Set<string>>>({});

  const issues = useMemo(() => data?.issues || [], [data]);
  const filteredIssues = useMemo(() => {
    return issues.map((issue) => {
      const dismissed = resolvedIssueAssets[issue.key];
      if (!dismissed || dismissed.size === 0) return issue;
      const filteredAssets = issue.assets?.filter((asset) => !dismissed.has(asset.id)) || [];
      return {
        ...issue,
        assets: filteredAssets,
        count: filteredAssets.length,
      };
    });
  }, [issues, resolvedIssueAssets]);
  const visibleIssues = useMemo(
    () => filteredIssues.filter((issue) => (issue.assets?.length ?? issue.count ?? 0) > 0),
    [filteredIssues]
  );

  const mapRiskFactorsToIssues = useCallback((factors: string[] = []) => {
    const matches: { key: string; label: string }[] = [];
    factors.forEach((factor) => {
      const mapping = riskFactorMappings.find((entry) => entry.match.test(factor));
      if (mapping && !matches.find((item) => item.key === mapping.key)) {
        matches.push({ key: mapping.key, label: mapping.label });
      }
    });
    return matches;
  }, []);

  const gatherIssueDetails = useCallback(
    (
      assetId: string,
      initialKey?: string,
      initialLabel?: string,
      riskFactors?: string[]
    ) => {
      const keys = new Set<string>();
      const labels: string[] = [];

      visibleIssues.forEach((issue) => {
        if (issue.assets?.some((asset) => asset.id === assetId)) {
          keys.add(issue.key);
          labels.push(issue.label);
        }
      });

      mapRiskFactorsToIssues(riskFactors || []).forEach((mapping) => {
        keys.add(mapping.key);
        labels.push(mapping.label);
      });

      if (initialKey && initialKey !== "highRisk") {
        keys.add(initialKey);
        if (initialLabel) labels.push(initialLabel);
      }

      if (!keys.size && initialKey) {
        keys.add(initialKey);
        if (initialLabel) labels.push(initialLabel);
      }

      return {
        keys: Array.from(keys),
        labels: Array.from(new Set(labels)),
      };
    },
    [visibleIssues, mapRiskFactorsToIssues]
  );
  const highRiskAssets = useMemo(() => {
    const base = data?.highRiskAssetsList || [];
    const dismissed = resolvedIssueAssets.highRisk;
    if (!dismissed || dismissed.size === 0) return base;
    return base.filter((asset) => !dismissed.has(asset.id));
  }, [data, resolvedIssueAssets]);

  const ensurePermission = (allowed: boolean, message: string) => {
    if (!allowed) {
      toast({ title: "Permission denied", description: message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleViewAsset = (assetId: string) => {
    const asset = assetLookup.get(assetId);
    if (!asset) return;
    setViewingAsset(asset);
    setIsViewDrawerOpen(true);
  };

  const handleEditAsset = (assetId: string) => {
    if (!ensurePermission(permissions.canManageAssets, "You cannot edit assets.")) return;
    const asset = assetLookup.get(assetId);
    if (!asset) return;
    setEditingAsset(asset);
    setIsAssetFormOpen(true);
  };

  const handleAssetFormSubmit = (formValues: InsertAsset) => {
    if (!editingAsset) return;
    updateAssetMutation.mutate(
      { id: editingAsset.id, data: formValues },
      {
        onSuccess: () => {
          setIsAssetFormOpen(false);
          setEditingAsset(null);
        },
      }
    );
  };

  const handleDeleteAsset = (assetId: string) => {
    if (!ensurePermission(permissions.canDeleteAssets, "You cannot delete assets.")) return;
    deleteAssetMutation.mutate(assetId);
  };

  const handleResolveAsset = (issueKeys: string[], assetId: string, includeHighRisk?: boolean) => {
    setResolvedIssueAssets((prev) => {
      const next = { ...prev };
      issueKeys.forEach((key) => {
        if (!key) return;
        const current = new Set(next[key] || []);
        current.add(assetId);
        next[key] = current;
      });
      if (includeHighRisk) {
        const hr = new Set(next.highRisk || []);
        hr.add(assetId);
        next.highRisk = hr;
      }
      return next;
    });
  };

  const handleSelectAsset = (params: { asset: ComplianceAssetSummary; record: any; issueKey?: string; issueContext?: any }) => {
    if (!ensurePermission(permissions.canManageAssets, "You cannot remediate assets.")) return;
    const asset = assetLookup.get(params.asset.id);
    const issueDetails = gatherIssueDetails(
      params.asset.id,
      params.issueKey,
      params.issueContext?.label,
      params.issueContext?.riskFactors
    );

    if (!issueDetails.keys.length && !params.issueKey) {
      return;
    }

    setRemediationContext({
      issueKeys: issueDetails.keys.length ? issueDetails.keys : params.issueKey ? [params.issueKey] : [],
      issueLabels: issueDetails.labels,
      primaryIssueKey: (issueDetails.keys.length ? issueDetails.keys : [params.issueKey])[0],
      primaryLabel: issueDetails.labels[0] || params.issueContext?.label,
      summary: params.asset,
      asset,
      riskFactors: params.issueContext?.riskFactors,
      fromHighRisk: params.issueKey === "highRisk",
    });
  };

  useEffect(() => {
    if (!expandedIssue) return;
    const current = visibleIssues.find((issue) => issue.key === expandedIssue);
    if (current && (current.assets?.length || 0) === 0) {
      setExpandedIssue(null);
    }
  }, [expandedIssue, visibleIssues]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading compliance insights…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="Compliance & Risk Overview"
          description="Drill-down view of high-risk assets, compliance issues, and remediation shortcuts"
        />

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">
          <section>
            <Card className="bg-card border">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Compliance Issues</span>
                  <span className="text-sm text-muted-foreground">
                    Total Issues: {data?.complianceIssues ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleIssues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No compliance issues detected.</p>
                ) : (
                  visibleIssues.map((issue) => {
                    const isExpanded = expandedIssue === issue.key;
                    return (
                      <div key={issue.key} className="rounded-lg border bg-muted/40">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3"
                          onClick={() => setExpandedIssue(isExpanded ? null : issue.key)}
                        >
                          <div className="flex items-center gap-3 text-left">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-foreground">{issue.label}</p>
                              <p className="text-xs text-muted-foreground">{issue.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge className={severityStyles[issue.severity]}>{issue.severity.toUpperCase()}</Badge>
                            <span className="text-2xl font-semibold">{issue.count}</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t bg-card rounded-b-lg">
                            <div className="flex justify-end px-3 py-2 border-b">
                              <Button variant="ghost" size="icon" onClick={() => setExpandedIssue(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <ComplianceAssetTable
                              assets={issue.assets || []}
                              assetLookup={assetLookup}
                              onViewAsset={handleViewAsset}
                              onEditAsset={handleEditAsset}
                              onDeleteAsset={handleDeleteAsset}
                              deletingAssetId={deletingAssetId}
                              onNavigate={navigate}
                              emptyMessage={emptyMessages[issue.key] || emptyMessages.default}
                              issueKey={issue.key}
                              issueContext={{ label: issue.label }}
                              onSelectAsset={handleSelectAsset}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="col-span-1 lg:col-span-2 bg-card border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>High-Risk Assets</CardTitle>
                <Button variant="outline" size="sm" onClick={() => navigate("/assets?filter=high-risk")}>
                  View in Assets
                </Button>
              </CardHeader>
              <CardContent>
                {highRiskAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No high-risk assets detected.</p>
                ) : (
                  <div className="space-y-3">
                    {highRiskAssets.map((asset) => {
                      const isExpanded = expandedHighRiskId === asset.id;
                      return (
                        <div key={asset.id} className="border rounded-lg bg-muted/30">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-3 text-left"
                            onClick={() => setExpandedHighRiskId(isExpanded ? null : asset.id)}
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <p className="text-sm font-semibold text-foreground">{asset.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {asset.status || "Unknown"} · {asset.location || "No location"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end max-w-md">
                              {asset.riskFactors.map((factor) => (
                                <Badge key={factor} variant="secondary" className="text-xs">
                                  {factor}
                                </Badge>
                              ))}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="border-t bg-card rounded-b-lg">
                              <div className="flex justify-end px-3 py-2 border-b">
                                <Button variant="ghost" size="icon" onClick={() => setExpandedHighRiskId(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <ComplianceAssetTable
                                assets={[buildHighRiskSummary(asset)]}
                                assetLookup={assetLookup}
                                onViewAsset={handleViewAsset}
                                onEditAsset={handleEditAsset}
                                onDeleteAsset={handleDeleteAsset}
                                deletingAssetId={deletingAssetId}
                                onNavigate={navigate}
                                emptyMessage="No high-risk data"
                                issueKey="highRisk"
                                issueContext={{ label: "High-Risk Asset", riskFactors: asset.riskFactors }}
                                onSelectAsset={handleSelectAsset}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border">
              <CardHeader>
                <CardTitle>Quick Remediation Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="secondary" className="w-full" onClick={() => navigate("/assets?filter=unassigned")}>
                  Assign Owners
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => navigate("/assets?filter=warranty")}>
                  Audit Warranties
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => navigate("/software?view=unlicensed")}>
                  Review Licenses
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => navigate("/tickets?view=security")}>
                  Open Security Tickets
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <Drawer open={isViewDrawerOpen} onOpenChange={setIsViewDrawerOpen}>
        <DrawerContent className="max-w-3xl mx-auto">
          <DrawerHeader>
            <DrawerTitle>{viewingAsset?.name ?? "Asset"}</DrawerTitle>
            <DrawerDescription>
              {viewingAsset?.type} {viewingAsset?.category ? `• ${viewingAsset.category}` : ""}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-6 pb-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                {viewingAsset?.type === "Hardware" && <TabsTrigger value="software">Software</TabsTrigger>}
              </TabsList>
              <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Serial Number</div>
                    <div className="font-medium">{viewingAsset?.serialNumber || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Model</div>
                    <div className="font-medium">{viewingAsset?.model || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Manufacturer</div>
                    <div className="font-medium">{viewingAsset?.manufacturer || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">{viewingAsset?.status || "N/A"}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Location</div>
                    <div className="font-medium">
                      {viewingAsset?.city && viewingAsset?.state && viewingAsset?.country
                        ? `${viewingAsset.city}, ${viewingAsset.state}, ${viewingAsset.country}`
                        : viewingAsset?.location || "N/A"}
                    </div>
                  </div>
                </div>
              </TabsContent>
              {viewingAsset?.type === "Hardware" && viewingAsset?.id && (
                <TabsContent value="software" className="mt-4">
                  <DeviceSoftware
                    assetId={viewingAsset.id}
                    tenantId={viewingAsset.tenantId}
                    canAssignSoftware={permissions.isSuperAdmin || permissions.isAdmin || permissions.isItManager}
                  />
                </TabsContent>
              )}
            </Tabs>
            <div className="mt-6 flex justify-end">
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {permissions.canManageAssets && (
        <AssetForm
          isOpen={isAssetFormOpen}
          onClose={() => {
            setIsAssetFormOpen(false);
            setEditingAsset(null);
          }}
          asset={editingAsset || undefined}
          onSubmit={handleAssetFormSubmit}
          isLoading={updateAssetMutation.isPending}
        />
      )}
      <FloatingAIAssistant />
      <RemediationModal
        open={Boolean(remediationContext)}
        onOpenChange={(open) => {
          if (!open) setRemediationContext(null);
        }}
        context={remediationContext}
        isSubmitting={updateAssetMutation.isPending}
        onSubmit={async (payload) => {
          if (!remediationContext?.summary?.id) return;
          await new Promise<void>((resolve, reject) => {
            updateAssetMutation.mutate(
              { id: remediationContext.summary.id, data: payload },
              {
                onSuccess: () => {
                  const keysToResolve =
                    remediationContext.issueKeys && remediationContext.issueKeys.length
                      ? remediationContext.issueKeys
                      : remediationContext.issueKey
                      ? [remediationContext.issueKey]
                      : [];
                  handleResolveAsset(
                    keysToResolve,
                    remediationContext.summary.id,
                    remediationContext.fromHighRisk
                  );
                  setRemediationContext(null);
                  resolve();
                },
                onError: (error) => {
                  reject(error);
                },
              }
            );
          });
        }}
      />
    </div>
  );
}
