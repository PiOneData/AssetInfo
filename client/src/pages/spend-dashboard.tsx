import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authenticatedRequest } from "@/lib/auth";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
  PieChart,
  BarChart3,
  Lightbulb,
  RefreshCw
} from "lucide-react";

interface SpendOverview {
  totalAnnualSpend: number;
  totalMonthlySpend: number;
  actualSpendLast12Months: number;
  activeContracts: number;
  upcomingRenewals: number;
  upcomingRenewalValue: number;
  optimization: {
    potentialAnnualSavings: number;
    potentialMonthlySavings: number;
    averageUtilization: number;
    appsWithWaste: number;
  };
  invoices: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
  };
  currency: string;
}

interface SpendByApp {
  appId: string;
  appName: string;
  vendor?: string;
  annualValue: number;
  monthlyValue: number;
  actualSpend: number;
  totalLicenses: number;
  userCount: number;
  utilizationRate: number;
  costPerLicense: number;
  category?: string;
  approvalStatus: string;
}

interface LicenseOptimization {
  summary: {
    totalAppsAnalyzed: number;
    appsWithWaste: number;
    totalLicenses: number;
    totalUnusedLicenses: number;
    totalMonthlyWaste: number;
    totalAnnualWaste: number;
    currency: string;
    averageUtilization: number;
    topWastefulApps: Array<{
      appName: string;
      wastedCost: number;
      unusedLicenses: number;
    }>;
  };
  results: Array<{
    appId: string;
    appName: string;
    vendor?: string;
    totalLicenses: number;
    usedLicenses: number;
    unusedLicenses: number;
    utilizationRate: number;
    costPerLicense: number;
    totalAnnualCost: number;
    wastedCost: number;
    inactiveUsers: Array<{
      userId: string;
      userName: string;
      email?: string;
      lastActive?: Date;
      daysSinceLastActive?: number;
    }>;
    recommendations: string[];
    potentialMonthlySavings: number;
    potentialAnnualSavings: number;
  }>;
}

interface Renewal {
  contractId: string;
  appId?: string;
  appName: string;
  vendor?: string;
  renewalDate?: string;
  daysUntilRenewal: number;
  annualValue: number;
  totalLicenses?: number;
  status: string;
  autoRenew?: boolean;
  optimization: {
    utilizationRate: number;
    unusedLicenses: number;
    potentialSavings: number;
    recommendations: string[];
  } | null;
}

export default function SpendDashboard() {
  // Fetch spend overview
  const { data: overview, isLoading: overviewLoading } = useQuery<SpendOverview>({
    queryKey: ['spend-overview'],
    queryFn: () => authenticatedRequest('/api/spend/overview'),
    refetchInterval: 60000 // Refresh every minute
  });

  // Fetch spending by app
  const { data: spendByApp, isLoading: spendByAppLoading } = useQuery<SpendByApp[]>({
    queryKey: ['spend-by-app'],
    queryFn: () => authenticatedRequest('/api/spend/by-app'),
    refetchInterval: 60000
  });

  // Fetch license optimization
  const { data: optimization, isLoading: optimizationLoading } = useQuery<LicenseOptimization>({
    queryKey: ['license-optimization'],
    queryFn: () => authenticatedRequest('/api/spend/license-optimization'),
    refetchInterval: 300000 // Refresh every 5 minutes
  });

  // Fetch upcoming renewals
  const { data: renewals, isLoading: renewalsLoading } = useQuery<Renewal[]>({
    queryKey: ['upcoming-renewals'],
    queryFn: () => authenticatedRequest('/api/spend/renewals?days=90'),
    refetchInterval: 60000
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getRenewalUrgency = (days: number) => {
    if (days <= 30) return 'bg-red-100 text-red-800';
    if (days <= 60) return 'bg-orange-100 text-orange-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 75) return 'text-green-600';
    if (rate >= 50) return 'text-yellow-600';
    if (rate >= 25) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64 overflow-hidden">
        <TopBar title="Spend Management" />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Annual Spend</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overviewLoading ? '...' : formatCurrency(overview?.totalAnnualSpend || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency((overview?.totalMonthlySpend || 0))} per month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
                <TrendingDown className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {overviewLoading ? '...' : formatCurrency(overview?.optimization.potentialAnnualSavings || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview?.optimization.appsWithWaste || 0} apps with waste
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Renewals</CardTitle>
                <Calendar className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {overviewLoading ? '...' : overview?.upcomingRenewals || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(overview?.upcomingRenewalValue || 0)} value
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overviewLoading ? '...' : formatPercent(overview?.optimization.averageUtilization || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview?.activeContracts || 0} active contracts
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="apps" className="space-y-6">
            <TabsList>
              <TabsTrigger value="apps">
                <PieChart className="h-4 w-4 mr-2" />
                By Application
              </TabsTrigger>
              <TabsTrigger value="optimization">
                <Lightbulb className="h-4 w-4 mr-2" />
                Optimization
              </TabsTrigger>
              <TabsTrigger value="renewals">
                <Calendar className="h-4 w-4 mr-2" />
                Renewals
              </TabsTrigger>
            </TabsList>

            {/* Spending by Application */}
            <TabsContent value="apps">
              <Card>
                <CardHeader>
                  <CardTitle>Spending by Application</CardTitle>
                  <CardDescription>Annual costs and license utilization per application</CardDescription>
                </CardHeader>
                <CardContent>
                  {spendByAppLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : spendByApp && spendByApp.length > 0 ? (
                    <div className="space-y-4">
                      {spendByApp.slice(0, 10).map((app) => (
                        <div key={app.appId} className="flex items-center justify-between border-b pb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{app.appName}</h4>
                              {app.vendor && (
                                <span className="text-sm text-muted-foreground">by {app.vendor}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span>{app.totalLicenses} licenses</span>
                              <span>{app.userCount} users</span>
                              <span className={getUtilizationColor(app.utilizationRate)}>
                                {formatPercent(app.utilizationRate)} utilized
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{formatCurrency(app.annualValue)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(app.costPerLicense)}/license
                            </div>
                          </div>
                        </div>
                      ))}
                      {spendByApp.length > 10 && (
                        <p className="text-sm text-muted-foreground text-center pt-2">
                          Showing top 10 of {spendByApp.length} applications
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No spending data available
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* License Optimization */}
            <TabsContent value="optimization">
              <div className="space-y-6">
                {/* Summary Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>License Optimization Summary</CardTitle>
                    <CardDescription>Identify unused licenses and cost-saving opportunities</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {optimizationLoading ? (
                      <p className="text-sm text-muted-foreground">Analyzing licenses...</p>
                    ) : optimization ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">Total Savings Opportunity</div>
                          <div className="text-2xl font-bold text-green-600 mt-1">
                            {formatCurrency(optimization.summary.totalAnnualWaste)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatCurrency(optimization.summary.totalMonthlyWaste)}/month
                          </div>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">Unused Licenses</div>
                          <div className="text-2xl font-bold text-orange-600 mt-1">
                            {optimization.summary.totalUnusedLicenses}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            out of {optimization.summary.totalLicenses} total
                          </div>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">Apps with Waste</div>
                          <div className="text-2xl font-bold mt-1">
                            {optimization.summary.appsWithWaste}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            of {optimization.summary.totalAppsAnalyzed} analyzed
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Optimization Opportunities */}
                <Card>
                  <CardHeader>
                    <CardTitle>Optimization Opportunities</CardTitle>
                    <CardDescription>Recommended actions to reduce costs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {optimizationLoading ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : optimization && optimization.results.length > 0 ? (
                      <div className="space-y-6">
                        {optimization.results.slice(0, 5).map((result) => (
                          <div key={result.appId} className="border-b pb-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium">{result.appName}</h4>
                                {result.vendor && (
                                  <p className="text-sm text-muted-foreground">{result.vendor}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-600">
                                  {formatCurrency(result.potentialAnnualSavings)}
                                </div>
                                <div className="text-xs text-muted-foreground">potential savings</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mb-2 text-sm">
                              <span className={getUtilizationColor(result.utilizationRate)}>
                                {formatPercent(result.utilizationRate)} utilized
                              </span>
                              <span className="text-muted-foreground">
                                {result.unusedLicenses} unused licenses
                              </span>
                              {result.inactiveUsers.length > 0 && (
                                <span className="text-muted-foreground">
                                  {result.inactiveUsers.length} inactive users
                                </span>
                              )}
                            </div>
                            {result.recommendations.length > 0 && (
                              <div className="space-y-1 mt-2">
                                {result.recommendations.map((rec, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-sm">
                                    <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5" />
                                    <span>{rec}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No optimization opportunities found
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Upcoming Renewals */}
            <TabsContent value="renewals">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Renewals (Next 90 Days)</CardTitle>
                  <CardDescription>Contract renewals requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {renewalsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : renewals && renewals.length > 0 ? (
                    <div className="space-y-4">
                      {renewals.map((renewal) => (
                        <div key={renewal.contractId} className="border-b pb-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{renewal.appName}</h4>
                                <Badge className={getRenewalUrgency(renewal.daysUntilRenewal)}>
                                  {renewal.daysUntilRenewal} days
                                </Badge>
                                {renewal.autoRenew && (
                                  <Badge variant="outline">Auto-renew</Badge>
                                )}
                              </div>
                              {renewal.vendor && (
                                <p className="text-sm text-muted-foreground">{renewal.vendor}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Renewal: {renewal.renewalDate ? new Date(renewal.renewalDate).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                {formatCurrency(renewal.annualValue)}
                              </div>
                              {renewal.totalLicenses && (
                                <div className="text-xs text-muted-foreground">
                                  {renewal.totalLicenses} licenses
                                </div>
                              )}
                            </div>
                          </div>
                          {renewal.optimization && (
                            <div className="mt-2 p-3 bg-yellow-50 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className="h-4 w-4 text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-800">
                                  Optimization Opportunity
                                </span>
                              </div>
                              <div className="text-sm text-yellow-700 mb-1">
                                {formatPercent(renewal.optimization.utilizationRate)} utilized •
                                {renewal.optimization.unusedLicenses} unused licenses •
                                Save {formatCurrency(renewal.optimization.potentialSavings)}/year
                              </div>
                              {renewal.optimization.recommendations.length > 0 && (
                                <ul className="text-xs text-yellow-700 mt-2 space-y-1">
                                  {renewal.optimization.recommendations.slice(0, 2).map((rec, idx) => (
                                    <li key={idx}>• {rec}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No upcoming renewals in the next 90 days
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

        <FloatingAIAssistant />
      </div>
    </div>
  );
}
