import { useMemo, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  useComplianceOverview,
  useTenantAssets,
  useAssetDeletion,
  useAssetUpdate,
  type ComplianceAssetSummary,
} from "@/hooks/use-compliance";
import { ComplianceAssetTable } from "@/components/compliance/asset-table";
import { RemediationModal, RemediationContext } from "@/components/compliance/remediation-modal";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeviceSoftware } from "@/components/assets/DeviceSoftware";
import { AssetForm } from "@/components/assets/asset-form";
import type { InsertAsset } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";

function extractIssueAssets(issues: any[] | undefined, key: string): ComplianceAssetSummary[] {
  if (!issues) return [];
  const match = issues.find((issue) => issue.key === key);
  return match?.assets || [];
}

export default function ComplianceLicensePage() {
  const { data, isLoading } = useComplianceOverview();
  const { data: allAssets = [] } = useTenantAssets();
  const assetLookup = useMemo(() => {
    const map = new Map<string, any>();
    allAssets.forEach((asset: any) => map.set(asset.id, asset));
    return map;
  }, [allAssets]);

  const deleteAssetMutation = useAssetDeletion();
  const updateAssetMutation = useAssetUpdate();
  const deletingAssetId =
    typeof deleteAssetMutation.variables === "string" ? deleteAssetMutation.variables : null;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const [viewingAsset, setViewingAsset] = useState<any | null>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [remediationContext, setRemediationContext] = useState<RemediationContext | null>(null);
  const [resolvedAssets, setResolvedAssets] = useState<Record<string, Set<string>>>({});

  const issues = data?.issues || [];

  const unlicensedAssets = useMemo(() => {
    const base = extractIssueAssets(data?.issues, "unlicensedSoftware");
    const dismissed = resolvedAssets.unlicensedSoftware;
    if (!dismissed) return base;
    return base.filter((asset) => !dismissed.has(asset.id));
  }, [data, resolvedAssets]);

  const expiredWarrantyAssets = useMemo(() => {
    const base = extractIssueAssets(data?.issues, "expiredWarranty");
    const dismissed = resolvedAssets.expiredWarranty;
    if (!dismissed) return base;
    return base.filter((asset) => !dismissed.has(asset.id));
  }, [data, resolvedAssets]);

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

  const gatherIssueDetails = useCallback(
    (assetId: string, fallbackKey: string, fallbackLabel: string) => {
      const keys = new Set<string>();
      const labels: string[] = [];
      issues.forEach((issue) => {
        if (issue.assets?.some((asset) => asset.id === assetId)) {
          keys.add(issue.key);
          labels.push(issue.label);
        }
      });
      if (!keys.size) {
        keys.add(fallbackKey);
        labels.push(fallbackLabel);
      }
      return { keys: Array.from(keys), labels: Array.from(new Set(labels)) };
    },
    [issues]
  );

  const handleSelectAsset = (params: { asset: ComplianceAssetSummary; record: any; issueKey?: string; issueContext?: any }) => {
    if (!ensurePermission(permissions.canManageAssets, "You cannot remediate assets.")) return;
    if (!params.issueKey) return;
    const asset = assetLookup.get(params.asset.id);
    const details = gatherIssueDetails(params.asset.id, params.issueKey, params.issueContext?.label || "");
    setRemediationContext({
      issueKey: params.issueKey,
      issueLabel: params.issueContext?.label,
      issueKeys: details.keys,
      issueLabels: details.labels,
      primaryIssueKey: details.keys[0],
      primaryLabel: details.labels[0] || params.issueContext?.label,
      summary: params.asset,
      asset,
    });
  };

  const handleResolveAsset = (issueKeys: string[], assetId: string) => {
    if (!issueKeys.length) return;
    setResolvedAssets((prev) => {
      const next = { ...prev };
      issueKeys.forEach((key) => {
        const collection = new Set(next[key] || []);
        collection.add(assetId);
        next[key] = collection;
      });
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading compliance detail…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="License & Warranty Compliance"
          description="Detailed view of unlicensed software and expiring warranties"
        />

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">
          <section>
            <Card className="bg-card border">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Unlicensed Software</CardTitle>
                <span className="text-sm text-muted-foreground">{unlicensedAssets.length} items</span>
              </CardHeader>
              <CardContent>
                <ComplianceAssetTable
                  assets={unlicensedAssets}
                  assetLookup={assetLookup}
                  onViewAsset={handleViewAsset}
                  onEditAsset={handleEditAsset}
                  onDeleteAsset={handleDeleteAsset}
                  deletingAssetId={deletingAssetId}
                  onNavigate={navigate}
                  emptyMessage="No unlicensed software detected"
                  issueKey="unlicensedSoftware"
                  issueContext={{ label: "Unlicensed Software" }}
                  onSelectAsset={handleSelectAsset}
                />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="bg-card border">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Expired Warranties</CardTitle>
                <span className="text-sm text-muted-foreground">{expiredWarrantyAssets.length} items</span>
              </CardHeader>
              <CardContent>
                <ComplianceAssetTable
                  assets={expiredWarrantyAssets}
                  assetLookup={assetLookup}
                  onViewAsset={handleViewAsset}
                  onEditAsset={handleEditAsset}
                  onDeleteAsset={handleDeleteAsset}
                  deletingAssetId={deletingAssetId}
                  onNavigate={navigate}
                  emptyMessage="No expired warranties found"
                  issueKey="expiredWarranty"
                  issueContext={{ label: "Expired Warranty" }}
                  onSelectAsset={handleSelectAsset}
                />
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
          const keysToResolve =
            remediationContext.issueKeys && remediationContext.issueKeys.length
              ? remediationContext.issueKeys
              : remediationContext.issueKey
              ? [remediationContext.issueKey]
              : [];
          await new Promise<void>((resolve, reject) => {
            updateAssetMutation.mutate(
              { id: remediationContext.summary.id, data: payload },
              {
                onSuccess: () => {
                  handleResolveAsset(keysToResolve, remediationContext.summary.id);
                  setRemediationContext(null);
                  resolve();
                },
                onError: (error) => reject(error),
              }
            );
          });
        }}
      />
    </div>
  );
}
