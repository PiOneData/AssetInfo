import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authenticatedRequest } from "@/lib/auth";
import { useLocation } from "wouter";

interface ComplianceOverviewData {
  complianceScore: number;
  highRiskAssets: number;
  complianceIssues: number;
  unlicensedSoftware: number;
  expiredWarranties: number;
}

const EMPTY_OVERVIEW: ComplianceOverviewData = {
  complianceScore: Number.NaN,
  highRiskAssets: 0,
  complianceIssues: 0,
  unlicensedSoftware: 0,
  expiredWarranties: 0,
};

function useComplianceOverview() {
  return useQuery<ComplianceOverviewData>({
    queryKey: ["/api/compliance/overview"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/compliance/overview");
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          return EMPTY_OVERVIEW;
        }
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Unable to load compliance overview");
      }
      const payload = await response.json().catch(() => ({}));
      return {
        ...EMPTY_OVERVIEW,
        ...payload,
      };
    },
    staleTime: 60 * 1000,
  });
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

export function DashboardComplianceSection() {
  const { data, isLoading } = useComplianceOverview();
  const [, navigate] = useLocation();

  const formattedScore = useMemo(() => {
    if (typeof data?.complianceScore !== "number" || Number.isNaN(data.complianceScore)) {
      return "--";
    }
    return Math.round(data.complianceScore).toString();
  }, [data]);

  return (
    <section className="mb-8" data-testid="section-compliance-overview">
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1 gradient-text">Compliance & Risk Overview</h2>
        <p className="text-xs text-muted-foreground">Real-time compliance posture and risk insights</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card className="bg-card border rounded-xl px-5 py-6 flex flex-col gap-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 cursor-pointer" onClick={() => navigate("/dashboard/compliance/score")}>
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">Compliance Score</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-col gap-2">
            <div className={`text-3xl font-semibold ${formattedScore === "--" ? "text-muted-foreground" : getScoreColor(data?.complianceScore ?? 0)}`}>
              {isLoading ? "--" : formattedScore}
            </div>
            <p className="text-xs font-medium text-muted-foreground">Target ≥ 85</p>
          </CardContent>
          <Button variant="outline" size="sm" className="self-center mt-auto h-8 px-4" onClick={(event) => {
            event.stopPropagation();
            navigate("/dashboard/compliance/score");
          }}>
            View
          </Button>
        </Card>

        <Card
          className="bg-card border rounded-xl px-5 py-6 flex flex-col gap-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 cursor-pointer"
          onClick={() => navigate("/dashboard/compliance?view=high-risk")}
          data-testid="card-high-risk-assets"
        >
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">High-Risk Assets</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-col gap-2">
            <div className="text-3xl font-semibold">
              {isLoading ? "--" : data?.highRiskAssets ?? 0}
            </div>
            <p className="text-xs font-medium text-muted-foreground">Assets that need urgent attention</p>
          </CardContent>
          <Button variant="outline" size="sm" className="self-center mt-auto h-8 px-4" onClick={() => navigate("/dashboard/compliance?view=high-risk")}>
            View
          </Button>
        </Card>

        <Card
          className="bg-card border rounded-xl px-5 py-6 flex flex-col gap-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 cursor-pointer"
          onClick={() => navigate("/dashboard/compliance?view=issues")}
          data-testid="card-compliance-issues"
        >
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">Compliance Issues</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-col gap-2">
            <div className="text-3xl font-semibold">
              {isLoading ? "--" : data?.complianceIssues ?? 0}
            </div>
            <p className="text-xs font-medium text-muted-foreground">Open compliance findings</p>
          </CardContent>
          <Button variant="outline" size="sm" className="self-center mt-auto h-8 px-4" onClick={() => navigate("/dashboard/compliance?view=issues")}>
            View
          </Button>
        </Card>

        <Card className="bg-card border rounded-xl p-4 flex flex-col gap-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40" data-testid="card-license-warranty">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">License & Warranty Compliance</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Unlicensed Software</p>
              <p className="text-3xl font-semibold">
                {isLoading ? "--" : data?.unlicensedSoftware ?? 0}
              </p>
            </div>
            <div className="pt-2 border-t border-border/60">
              <p className="text-xs font-medium text-muted-foreground">Expired Warranties</p>
              <p className="text-3xl font-semibold">
                {isLoading ? "--" : data?.expiredWarranties ?? 0}
              </p>
            </div>
          </CardContent>
          <Button variant="outline" size="sm" className="self-center h-8 px-4" onClick={() => navigate("/dashboard/compliance/license")}>
            View
          </Button>
        </Card>
      </div>
    </section>
  );
}
