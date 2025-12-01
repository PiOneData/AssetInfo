import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authenticatedRequest } from "@/lib/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";

type BreakdownKey =
  | "assets_with_owner"
  | "assets_with_location"
  | "valid_warranty"
  | "licensed_software"
  | "up_to_date_os"
  | "security_patches"
  | "no_duplicates"
  | "idle_assets";

interface WeightedBreakdownEntry {
  key: BreakdownKey;
  label: string;
  earned: number;
  max: number;
}

interface ComplianceScoreDetailsResponse {
  score: number;
  target: number;
  breakdown: Record<BreakdownKey, { current: number; total: number }>;  
  weightedBreakdown?: WeightedBreakdownEntry[];
  rating?: string;
  ratingDescription?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, "");

function buildAbsoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

async function fetchScoreDetails(path: string) {
  const response = await authenticatedRequest("GET", buildAbsoluteUrl(path));
  const raw = await response.text();
  try {
    return JSON.parse(raw) as ComplianceScoreDetailsResponse;
  } catch {
    throw new Error(raw || "Compliance score endpoint returned unexpected data");
  }
}

function useComplianceScoreDetails() {
  const createEmptyScoreDetails = (): ComplianceScoreDetailsResponse => ({
    score: Number.NaN,
    target: 85,
    breakdown: {
      assets_with_owner: { current: 0, total: 0 },
      assets_with_location: { current: 0, total: 0 },
      valid_warranty: { current: 0, total: 0 },
      licensed_software: { current: 0, total: 0 },
      up_to_date_os: { current: 0, total: 0 },
      security_patches: { current: 0, total: 0 },
      no_duplicates: { current: 0, total: 0 },
      idle_assets: { current: 0, total: 0 },
    },
    weightedBreakdown: [],
    rating: undefined,
    ratingDescription: undefined,
  });

  const mergeWithDefaults = (data?: ComplianceScoreDetailsResponse) => {
    const base = createEmptyScoreDetails();
    if (!data) return base;
    return {
      ...base,
      ...data,
      breakdown: {
        ...base.breakdown,
        ...(data.breakdown || {}),
      },
      weightedBreakdown: data.weightedBreakdown ?? base.weightedBreakdown,
    };
  };

  return useQuery<ComplianceScoreDetailsResponse>({
    queryKey: ["/api/compliance/score-details"],
    queryFn: async () => {
      try {
        const primary = await fetchScoreDetails("/api/compliance/score-details");
        return mergeWithDefaults(primary);
      } catch (primaryError) {
        console.warn("Primary compliance score endpoint failed, attempting fallback /api/compliance/score", primaryError);
        try {
          const fallback = await fetchScoreDetails("/api/compliance/score");
          return mergeWithDefaults(fallback);
        } catch (secondaryError) {
          console.warn("Fallback compliance score endpoint failed", secondaryError);
          return mergeWithDefaults();
        }
      }
    },
    staleTime: 60 * 1000,
  });
}

function scoreColor(score?: number) {
  if (typeof score !== "number" || Number.isNaN(score)) return "text-muted-foreground";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

const breakdownConfig: Array<{
  key: BreakdownKey;
  title: string;
  detail: (current: number, total: number) => string;
}> = [
  {
    key: "assets_with_owner",
    title: "Owner Assignment",
    detail: (current, total) =>
      total === 0 ? "No hardware assets recorded yet." : `${current} of ${total} assets have an assigned owner.`,
  },
  {
    key: "assets_with_location",
    title: "Location Coverage",
    detail: (current, total) =>
      total === 0
        ? "Location data unavailable until assets are added."
        : `${current} of ${total} assets include a mapped location.`,
  },
  {
    key: "valid_warranty",
    title: "Warranty Protection",
    detail: (current, total) =>
      total === 0
        ? "Warranty tracking begins once hardware is onboarded."
        : `${current} of ${total} devices carry an active warranty.`,
  },
  {
    key: "licensed_software",
    title: "Software Licensing",
    detail: (current, total) => {
      if (total === 0) return "No software licensing records have been logged.";
      return `${current} of ${total} software license assignments are backed by valid licenses.`;
    },
  },
  {
    key: "up_to_date_os",
    title: "Supported Operating Systems",
    detail: (current, total) =>
      total === 0 ? "OS details will appear after devices sync." : `${current} of ${total} devices run supported OS versions.`,
  },
  {
    key: "security_patches",
    title: "Security Patch Status",
    detail: (current, total) =>
      total === 0
        ? "Patch reporting requires at least one enrolled device."
        : `${current} of ${total} devices are up to date on security patches.`,
  },
  {
    key: "no_duplicates",
    title: "Unique Device Assignments",
    detail: (current, total) =>
      total === 0 ? "Assignment quality improves as devices are added." : `${current} of ${total} assets have unique primary assignments.`,
  },
  {
    key: "idle_assets",
    title: "Active Asset Utilization",
    detail: (current, total) =>
      total === 0 ? "Asset utilization appears once hardware is deployed." : `${current} of ${total} assets have been active within 90 days.`,
  },
];

function statusLabel(current: number, total: number) {
  if (total === 0) {
    return { label: "Waiting for data", className: "text-muted-foreground" };
  }
  const ratio = current / Math.max(total, 1);
  if (ratio >= 0.85) {
    return { label: "Healthy coverage", className: "text-green-400" };
  }
  if (ratio >= 0.6) {
    return { label: "Needs monitoring", className: "text-yellow-400" };
  }
  return { label: "Requires immediate attention", className: "text-red-400" };
}

function formatScore(score?: number) {
  if (typeof score !== "number" || Number.isNaN(score)) return "--";
  return Math.round(score).toString();
}

function breakdownBadgeColor(percent: number) {
  if (percent >= 0.75) return "bg-green-500/10 text-green-400 border-green-500/30";
  if (percent >= 0.5) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/10 text-red-400 border-red-500/30";
}

export default function ComplianceScoreDetails() {
  const { data, isLoading } = useComplianceScoreDetails();

  const breakdownValues = useMemo(() => {
    const weightedMap = new Map<BreakdownKey, WeightedBreakdownEntry>();
    data?.weightedBreakdown?.forEach((entry) => weightedMap.set(entry.key, entry));
    if (!data) return [];
    return breakdownConfig.map((item) => {
      const stats = data.breakdown[item.key] || { current: 0, total: 0 };
      const weighted = weightedMap.get(item.key);
      return { ...item, ...stats, earned: weighted?.earned ?? 0, maxPoints: weighted?.max ?? 0 };
    });
  }, [data]);

  return (
    <div className="flex h-screen bg-background" data-testid="page-compliance-score">
      <Sidebar />
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="Compliance Score"
          description="Detailed breakdown of the controls powering this score"
        />

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card border rounded-xl p-6 flex flex-col justify-between">
              <CardHeader className="p-0 mb-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Overall Compliance Score</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground transition" aria-label="Score summary">
                        <Info className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      This score looks across owner assignment, location accuracy, warranty coverage, software licensing,
                      OS posture, and utilization signals. Each control contributes to the overall compliance posture and
                      highlights the areas that deserve immediate focus.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className={`text-6xl font-semibold ${scoreColor(data?.score)}`}>
                  {isLoading ? "--" : formatScore(data?.score)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">Target ≥ {data?.target ?? 85}</p>
              </CardContent>
            </Card>

            <Card className="bg-card border rounded-xl p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base font-semibold">Score Interpretation</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <p className="text-2xl font-semibold mb-2">{data?.rating ?? "--"}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {data?.ratingDescription ?? "Compliance rating details will appear once data is available."}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border rounded-xl">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-base font-semibold">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-5">
              {isLoading && (
                <p className="text-sm text-muted-foreground">Loading score breakdown...</p>
              )}
              {!isLoading &&
                breakdownValues.map(({ key, title, detail, current, total, earned = 0, maxPoints = 0 }) => {
                  const { label, className } = statusLabel(current, total);
                  const percent = maxPoints > 0 ? earned / maxPoints : 0;
                  const badgeClass = breakdownBadgeColor(percent);
                  return (
                    <div key={key} className="pb-5 border-b border-border/50 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                          {`${Math.round(earned)} / ${Math.round(maxPoints)}`}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{detail(current, total)}</p>
                      <p className={`text-xs font-medium mt-2 ${className}`}>{label}</p>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      </main>
      <FloatingAIAssistant />
    </div>
  );
}
