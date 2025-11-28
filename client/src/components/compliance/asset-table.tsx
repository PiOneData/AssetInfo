import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Monitor, Loader2, ChevronRight } from "lucide-react";
import { authenticatedRequest } from "@/lib/auth";
import { ComplianceAssetSummary } from "@/hooks/use-compliance";

export interface ComplianceAssetTableProps {
  assets: ComplianceAssetSummary[];
  assetLookup: Map<string, any>;
  onViewAsset?: (assetId: string) => void;
  onEditAsset?: (assetId: string) => void;
  onNavigate?: (path: string) => void;
  onDeleteAsset?: (assetId: string) => void;
  deletingAssetId?: string | null;
  emptyMessage?: string;
  issueKey?: string;
  issueContext?: any;
  onSelectAsset?: (params: { asset: ComplianceAssetSummary; record: any; issueKey?: string; issueContext?: any }) => void;
}

const COLUMNS = [
  { key: "name", label: "Asset Name" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "model", label: "Model" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "category", label: "Category" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "version", label: "Version" },
  { key: "licenseType", label: "License Type" },
  { key: "warrantyExpiry", label: "Warranty Expiry" },
  { key: "purchaseDate", label: "Purchase Date" },
  { key: "purchaseCost", label: "Purchase Cost" },
  { key: "ipAddress", label: "IP Address" },
  { key: "hostname", label: "Hostname" },
  { key: "os", label: "OS" },
  { key: "location", label: "Location" },
  { key: "assignedUserName", label: "Assigned To" },
  { key: "assignedUserEmail", label: "Email" },
  { key: "assignedUserEmployeeId", label: "Employee ID" },
  { key: "actions", label: "Actions" },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatCurrency(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toLocaleString()}`;
}

function resolveLocation(record: any, summary: ComplianceAssetSummary) {
  const parts = [
    record?.city,
    record?.state,
    record?.country,
    record?.location,
    summary.location,
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function resolveIp(record: any, summary: ComplianceAssetSummary) {
  return (
    record?.ipAddress ||
    record?.specifications?.openaudit?.ip ||
    record?.specifications?.agent?.ipAddress ||
    summary.ipAddress ||
    "—"
  );
}

function resolveHostname(record: any, summary: ComplianceAssetSummary) {
  return (
    record?.specifications?.openaudit?.hostname ||
    record?.specifications?.agent?.hostname ||
    summary.hostname ||
    "—"
  );
}

function resolveOs(record: any, summary: ComplianceAssetSummary) {
  return (
    record?.specifications?.openaudit?.os?.name ||
    record?.specifications?.agent?.osName ||
    summary.os ||
    "—"
  );
}

function resolveField(key: string, record: any, summary: ComplianceAssetSummary) {
  switch (key) {
    case "name":
      return record?.name || summary.name || "—";
    case "serialNumber":
      return record?.serialNumber || summary.serialNumber || "—";
    case "model":
      return record?.model || summary.model || "—";
    case "manufacturer":
      return record?.manufacturer || summary.manufacturer || "—";
    case "category":
      return record?.category || summary.category || "—";
    case "type":
      return record?.type || summary.type || "—";
    case "status":
      return record?.status || summary.status || "—";
    case "version":
      return record?.version || summary.version || "—";
    case "licenseType":
      return record?.licenseType || summary.licenseType || "—";
    case "warrantyExpiry":
      return formatDate(record?.warrantyExpiry || summary.warrantyExpiry || null);
    case "purchaseDate":
      return formatDate(record?.purchaseDate || summary.purchaseDate || null);
    case "purchaseCost":
      return formatCurrency(record?.purchaseCost ?? summary.purchaseCost ?? null);
    case "ipAddress":
      return resolveIp(record, summary);
    case "hostname":
      return resolveHostname(record, summary);
    case "os":
      return resolveOs(record, summary);
    case "location":
      return resolveLocation(record, summary);
    case "assignedUserName":
      return record?.assignedUserName || summary.assignedUserName || "Unassigned";
    case "assignedUserEmail":
      return record?.assignedUserEmail || summary.assignedUserEmail || "—";
    case "assignedUserEmployeeId":
      return record?.assignedUserEmployeeId || summary.assignedUserEmployeeId || "—";
    default:
      return (summary as any)[key] ?? "—";
  }
}

function SoftwareDevicesButton({
  assetId,
  assetName,
  onNavigate,
}: {
  assetId: string;
  assetName: string;
  onNavigate?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/software", assetId, "devices"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", `/api/software/${assetId}/devices`);
      return response.json();
    },
    enabled: open,
  });
  const devices = data?.devices || [];

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Monitor className="h-3 w-3 mr-1" />
        View devices
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Devices with {assetName || "software"}</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No devices found with this software installed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device: any) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.(`/assets?type=Hardware&view=${device.id}`);
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <Monitor className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {device.manufacturer || "Unknown"} {device.model ? `• ${device.model}` : ""}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ComplianceAssetTable({
  assets,
  assetLookup,
  onViewAsset,
  onEditAsset,
  onNavigate,
  onDeleteAsset,
  deletingAssetId,
  emptyMessage,
  issueKey,
  issueContext,
  onSelectAsset,
}: ComplianceAssetTableProps) {
  if (!assets || assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        {emptyMessage || "No records available for this selection."}
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-[1500px] w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const record = assetLookup.get(asset.id) || null;
            const assetType = (record?.type || asset.type || "").toLowerCase();
            return (
              <tr
                key={asset.id}
                className={`border-b last:border-b-0 ${
                  onSelectAsset && issueKey ? "hover:bg-muted/60 cursor-pointer" : ""
                }`}
                onClick={() => {
                  if (onSelectAsset && issueKey) {
                    onSelectAsset({ asset, record, issueKey, issueContext });
                  }
                }}
              >
                {COLUMNS.map((column) => {
                  const key = column.key;
                  if (key === "actions") {
                    return (
                      <td key={key} className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {assetType === "software" && (
                            <SoftwareDevicesButton
                              assetId={asset.id}
                              assetName={asset.name || ""}
                              onNavigate={onNavigate}
                            />
                          )}
                          <Button variant="ghost" size="sm" onClick={() => onViewAsset?.(asset.id)}>
                            View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onEditAsset?.(asset.id)}>
                            Edit
                          </Button>
                          {onDeleteAsset && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={deletingAssetId === asset.id}
                              onClick={() => {
                                if (window.confirm("Are you sure you want to delete this asset?")) {
                                  onDeleteAsset(asset.id);
                                }
                              }}
                            >
                              {deletingAssetId === asset.id ? "Deleting…" : "Delete"}
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={key} className="px-3 py-2 whitespace-nowrap">
                      {resolveField(key, record, asset)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
