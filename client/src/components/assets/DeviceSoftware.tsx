import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authenticatedRequest } from "@/lib/auth";
import { Trash2 } from "lucide-react";

type Props = {
  assetId: string;   // our ITAM asset id for the device
  tenantId: string;  // current tenant (from auth/session)
  canAssignSoftware?: boolean;
};

type OAItem = { name: string; version?: string | null; publisher?: string | null };

type ManualSoftwareItem = {
  id: string;
  softwareAssetId: string;
  name: string;
  version?: string | null;
  manufacturer?: string | null;
  assignedAt?: string | null;
};

type DeviceSoftwareResponse =
  | {
      items: OAItem[];
      manualItems?: ManualSoftwareItem[];
    }
  | {
      status: "no-enrollment";
      message: string;
      manualItems?: ManualSoftwareItem[];
    };

// "system" publishers to ignore by default
const DEFAULT_IGNORES = [
  "Apple",
  "Microsoft",
  "Intel",
  "Dell",
  "HP",
  "Adobe Systems, Inc. (system)",
];

export function DeviceSoftware({ assetId, tenantId, canAssignSoftware = false }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [hideVendors, setHideVendors] = useState(true);
  const [ignorePublishers, setIgnorePublishers] = useState<string[]>(DEFAULT_IGNORES);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>("");
  const [isUnassignDialogOpen, setIsUnassignDialogOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ManualSoftwareItem | null>(null);


  // Fetch software list for this device (our server -> OA)
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DeviceSoftwareResponse>({
    queryKey: ["deviceSoftware", assetId],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", `/api/assets/${assetId}/software`);
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        // ignore JSON parse error, handled below
      }

      if (!response.ok) {
        const message =
          payload?.details || payload?.error || "Failed to load software";
        throw new Error(message);
      }

      if (payload === null) {
        return { items: [] } as DeviceSoftwareResponse;
      }

      return payload as DeviceSoftwareResponse;
    },
  });

  const {
    data: assignableSoftware = [],
    isLoading: isSoftwareListLoading,
    isError: isSoftwareListError,
    error: softwareListError,
  } = useQuery({
    queryKey: ["assignableSoftwareAssets"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/assets?type=Software");
      return response.json();
    },
    enabled: canAssignSoftware && isAssignDialogOpen,
  });

  React.useEffect(() => {
    if (
      isAssignDialogOpen &&
      Array.isArray(assignableSoftware) &&
      assignableSoftware.length > 0 &&
      !selectedSoftwareId
    ) {
      setSelectedSoftwareId(assignableSoftware[0].id);
    }
  }, [isAssignDialogOpen, assignableSoftware, selectedSoftwareId]);

  const isNoEnrollment = data && "status" in data && data.status === "no-enrollment";
  const manualItems: ManualSoftwareItem[] = React.useMemo(() => {
    if (!data) return [];
    if ("manualItems" in data && Array.isArray(data.manualItems)) {
      return data.manualItems;
    }
    return [];
  }, [data]);

  // Filter + de-duplicate
  const items = useMemo(() => {
    if (!data || "status" in data) {
      return [];
    }

    let arr = data.items ?? [];

    if (hideVendors) {
      const ignoresLower = ignorePublishers.map((p) => p.toLowerCase());
      arr = arr.filter(
        (x) => !x.publisher || !ignoresLower.some((p) => x.publisher!.toLowerCase().includes(p))
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (x) =>
          x.name?.toLowerCase().includes(q) ||
          x.publisher?.toLowerCase().includes(q) ||
          (x.version ?? "").toLowerCase().includes(q)
      );
    }

    // remove empties & duplicates (by name+version)
    const key = (x: any) => `${x.name}__${x.version ?? ""}`.toLowerCase();
    const seen = new Set<string>();
    const dedup: typeof arr = [];
    for (const it of arr) {
      if (!it.name) continue;
      const k = key(it);
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(it);
    }
    return dedup.sort((a, b) => a.name.localeCompare(b.name));
  }, [data, hideVendors, ignorePublishers, search]);

  const importMutation = useMutation({
    mutationFn: async (payload: { tenantId: string; deviceAssetId?: string; items: any[] }) => {
      const response = await authenticatedRequest("POST", `/api/software/import`, payload);
      return response.json();
    },
    onSuccess: (resp) => {
      toast({
        title: "Imported",
        description: `Added ${resp.created} app(s) to Software inventory.`,
      });
      // If you cache a Software page list under ["assets","Software"], refresh it:
      qc.invalidateQueries({ queryKey: ["assets", "Software"] });
    },
    onError: (e: any) => {
      toast({
        title: "Import failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const assignSoftwareMutation = useMutation({
    mutationFn: async (softwareAssetId: string) => {
      const response = await authenticatedRequest("POST", `/api/assets/${assetId}/software-links`, {
        softwareAssetId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Software assigned",
        description: "The selected software asset has been linked to this device.",
      });
      setIsAssignDialogOpen(false);
      const softwareId = selectedSoftwareId;
      setSelectedSoftwareId("");
      qc.invalidateQueries({ queryKey: ["deviceSoftware", assetId] });
      if (softwareId) {
        qc.invalidateQueries({ queryKey: [`/api/software/${softwareId}/devices`] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign software",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const unassignSoftwareMutation = useMutation({
    mutationFn: async (softwareAssetId: string) => {
      const response = await authenticatedRequest("DELETE", `/api/assets/${assetId}/software-links/${softwareAssetId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to unassign software");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Software unassigned",
        description: "The software link was removed from this device.",
      });
      qc.invalidateQueries({ queryKey: ["deviceSoftware", assetId] });
      const removalSoftwareId = pendingRemoval?.softwareAssetId;
      if (removalSoftwareId) {
        qc.invalidateQueries({ queryKey: [`/api/software/${removalSoftwareId}/devices`] });
      }
      setIsUnassignDialogOpen(false);
      setPendingRemoval(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to unassign software",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssignSoftware = () => {
    if (!selectedSoftwareId) {
      toast({
        title: "Select software",
        description: "Please choose a software asset to assign.",
        variant: "destructive",
      });
      return;
    }
    assignSoftwareMutation.mutate(selectedSoftwareId);
  };
  const handleUnassignClick = (item: ManualSoftwareItem) => {
    setPendingRemoval(item);
    setIsUnassignDialogOpen(true);
  };

  const toggle = (key: string) =>
    setSelected((s) => ({ ...s, [key]: !s[key] }));

  const selectedItems = useMemo(() => {
    const map = new Map<string, any>();
    for (const it of items) {
      const k = `${it.name}__${it.version ?? ""}`;
      if (selected[k]) map.set(k, it);
    }
    return Array.from(map.values());
  }, [items, selected]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading software…</div>;
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Failed to load software";
    return (
      <div className="space-y-2">
        <div className="text-sm text-red-500">
          Failed to load software: {msg}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const oaContent = isNoEnrollment ? (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground bg-muted/40">
      <p>
        This device was not added through the tenant-specific enrollment link, so software inventory is unavailable.
      </p>
      <p className="mt-2">
        To automatically view installed software, please add this device via the enrollment link.
      </p>
    </div>
  ) : (
    // constrain the modal content height so the list can scroll
    <div className="space-y-3 w-full max-w-3xl max-h-[80vh] overflow-auto">
      <div className="flex items-center gap-2">
        <input
          className="border rounded px-2 py-1 text-sm w-60"
          placeholder="Search name / publisher / version"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={hideVendors}
            onCheckedChange={(v) => setHideVendors(Boolean(v))}
          />
          Hide system vendors
        </label>
      </div>

      {/* scrollable table area */}
      <div className="rounded-md border max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              <th className="text-left p-2 w-8"></th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Version</th>
              <th className="text-left p-2">Publisher</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const key = `${it.name}__${it.version ?? ""}`;
              return (
                <tr key={key} className="border-t">
                  <td className="p-2">
                    <Checkbox
                      checked={!!selected[key]}
                      onCheckedChange={() => toggle(key)}
                    />
                  </td>
                  <td className="p-2">{it.name}</td>
                  <td className="p-2">{it.version ?? "-"}</td>
                  <td className="p-2">{it.publisher ?? "-"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-muted-foreground">
                  No user-installed software found (filtered).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* sticky action bar so buttons stay visible */}
      <div className="sticky bottom-0 bg-background border-t px-2 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {selectedItems.length} selected
        </div>
        <Button
          size="sm"
          onClick={() =>
            importMutation.mutate({
              tenantId,
              deviceAssetId: assetId,
              items: selectedItems.map((x) => ({
                name: x.name,
                version: x.version ?? null,
                publisher: x.publisher ?? null,
              })),
            })
          }
          disabled={selectedItems.length === 0 || importMutation.isPending}
        >
          Add to Software Inventory
        </Button>
      </div>
    </div>
  );

  const manualSection = (
    <div className="space-y-2">
      <div className="text-sm font-medium">Manually assigned software</div>
      {manualItems.length ? (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Version</th>
                <th className="text-left p-2">Publisher</th>
                <th className="text-left p-2">Assigned</th>
                {canAssignSoftware && <th className="text-right p-2 w-28">Action</th>}
              </tr>
            </thead>
            <tbody>
              {manualItems.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.version ?? "-"}</td>
                  <td className="p-2">{item.manufacturer ?? "-"}</td>
                  <td className="p-2 text-muted-foreground">
                    {item.assignedAt ? new Date(item.assignedAt).toLocaleString() : "-"}
                  </td>
                  {canAssignSoftware && (
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnassignClick(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Unassign</span>
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No software has been manually assigned to this device yet.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {canAssignSoftware && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setIsAssignDialogOpen(true)}>
            Assign Software to this Device
          </Button>
        </div>
      )}
      {oaContent}
      {manualSection}

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Software</DialogTitle>
            <DialogDescription>
              Select a software asset from your inventory to link to this device.
            </DialogDescription>
          </DialogHeader>

          {isSoftwareListLoading ? (
            <p className="text-sm text-muted-foreground">Loading software assets…</p>
          ) : isSoftwareListError ? (
            <p className="text-sm text-red-500">
              {softwareListError instanceof Error
                ? softwareListError.message
                : "Failed to load software assets"}
            </p>
          ) : assignableSoftware.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No software assets available. Add software records first from the Assets page.
            </p>
          ) : (
            <Select value={selectedSoftwareId} onValueChange={setSelectedSoftwareId}>
              <SelectTrigger>
                <SelectValue placeholder="Select software" />
              </SelectTrigger>
              <SelectContent>
                {assignableSoftware.map((software: any) => (
                  <SelectItem key={software.id} value={software.id}>
                    {software.name}
                    {software.version ? ` • v${software.version}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAssignDialogOpen(false);
                setSelectedSoftwareId("");
              }}
              disabled={assignSoftwareMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignSoftware}
              disabled={!selectedSoftwareId || assignSoftwareMutation.isPending}
            >
              {assignSoftwareMutation.isPending ? "Assigning…" : "Assign Software"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isUnassignDialogOpen}
        onOpenChange={(open) => {
          setIsUnassignDialogOpen(open);
          if (!open) {
            setPendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this software?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink {pendingRemoval?.name || "the selected software"} from this device. The asset record will remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignSoftwareMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unassignSoftwareMutation.isPending || !pendingRemoval}
              onClick={() => {
                if (pendingRemoval) {
                  unassignSoftwareMutation.mutate(pendingRemoval.softwareAssetId);
                }
              }}
            >
              {unassignSoftwareMutation.isPending ? "Removing..." : "Unassign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
