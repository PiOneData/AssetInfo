import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authenticatedRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export interface ComplianceAssetSummary {
  id: string;
  name: string | null;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  type?: string | null;
  status: string | null;
  version?: string | null;
  licenseType?: string | null;
  warrantyExpiry: string | null;
  purchaseDate?: string | null;
  purchaseCost?: string | number | null;
  ipAddress?: string | null;
  hostname?: string | null;
  os?: string | null;
  location: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  assignedUserEmployeeId?: string | null;
  riskFactors?: string[];
}

export interface ComplianceIssue {
  key: string;
  label: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  assets?: ComplianceAssetSummary[];
}

export interface HighRiskAsset {
  id: string;
  name: string;
  status: string | null;
  owner: string | null;
  location: string | null;
  riskFactors: string[];
}

export interface ComplianceOverviewPayload {
  complianceScore: number;
  rating?: string;
  ratingDescription?: string;
  highRiskAssets: number;
  complianceIssues: number;
  unlicensedSoftware: number;
  expiredWarranties: number;
  weightedBreakdown?: Array<{ key: string; label: string; earned: number; max: number }>;
  issues?: ComplianceIssue[];
  highRiskAssetsList?: HighRiskAsset[];
}

const EMPTY_COMPLIANCE_OVERVIEW: ComplianceOverviewPayload = {
  complianceScore: Number.NaN,
  rating: undefined,
  ratingDescription: undefined,
  highRiskAssets: 0,
  complianceIssues: 0,
  unlicensedSoftware: 0,
  expiredWarranties: 0,
  weightedBreakdown: [],
  issues: [],
  highRiskAssetsList: [],
};

export function useComplianceOverview() {
  return useQuery<ComplianceOverviewPayload>({
    queryKey: ["/api/compliance/overview"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/compliance/overview");
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          return EMPTY_COMPLIANCE_OVERVIEW;
        }
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Unable to load compliance overview");
      }
      const payload = await response.json().catch(() => ({}));
      return {
        ...EMPTY_COMPLIANCE_OVERVIEW,
        ...payload,
      };
    },
    staleTime: 60 * 1000,
  });
}

export function useTenantAssets() {
  return useQuery<any[]>({
    queryKey: ["/api/assets"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/assets");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Unable to load assets");
      }
      return response.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useAssetDeletion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const response = await authenticatedRequest("DELETE", `/api/assets/${assetId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to delete asset");
      }
      return assetId;
    },
    onSuccess: () => {
      toast({
        title: "Asset deleted",
        description: "The asset has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error?.message || "Unable to delete asset.",
        variant: "destructive",
      });
    },
  });
}

export function useAssetUpdate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await authenticatedRequest("PUT", `/api/assets/${id}`, data);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to update asset");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Asset updated",
        description: "The asset has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/license"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Unable to update asset.",
        variant: "destructive",
      });
    },
  });
}
