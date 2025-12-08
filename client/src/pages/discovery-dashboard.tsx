import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authenticatedRequest } from "@/lib/auth";
import { Shield, AlertTriangle, Cloud, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface DiscoveryStats {
  totalApps: number;
  pendingApproval: number;
  approved: number;
  denied: number;
  highRiskApps: number;
  shadowITDetected: number;
  discoveredViaIdP: number;
  identityProviders: {
    total: number;
    active: number;
    syncing: number;
  };
}

interface SaasApp {
  id: string;
  name: string;
  vendor?: string;
  logoUrl?: string;
  websiteUrl?: string;
  approvalStatus: 'pending' | 'approved' | 'denied';
  riskScore?: number;
  riskFactors?: string[];
  discoveryDate?: string;
  discoveryMethod?: string;
  userCount?: number;
}

interface ProviderSyncStatus {
  id: string;
  name: string;
  type: string;
  status: string;
  syncStatus: string;
  syncEnabled: boolean;
  lastSyncAt?: string;
  nextSyncAt?: string;
  syncError?: string;
  isCurrentlySyncing: boolean;
  totalApps: number;
  totalUsers: number;
}

export default function DiscoveryDashboard() {
  const { toast } = useToast();
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());

  // Fetch discovery stats
  const { data: stats, isLoading: statsLoading } = useQuery<DiscoveryStats>({
    queryKey: ['discovery-stats'],
    queryFn: () => authenticatedRequest('/api/discovery/stats'),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch Shadow IT apps
  const { data: shadowITApps, isLoading: shadowITLoading } = useQuery<SaasApp[]>({
    queryKey: ['shadow-it-apps'],
    queryFn: () => authenticatedRequest('/api/discovery/shadow-it'),
    refetchInterval: 30000
  });

  // Fetch high-risk apps
  const { data: highRiskApps, isLoading: highRiskLoading } = useQuery<SaasApp[]>({
    queryKey: ['high-risk-apps'],
    queryFn: () => authenticatedRequest('/api/discovery/high-risk'),
    refetchInterval: 30000
  });

  // Fetch sync status
  const { data: syncStatus, isLoading: syncStatusLoading, refetch: refetchSyncStatus } = useQuery<{
    providers: ProviderSyncStatus[];
    scheduler: { activeSchedules: number; runningSyncs: number };
  }>({
    queryKey: ['sync-status'],
    queryFn: () => authenticatedRequest('/api/discovery/sync-status'),
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const getRiskBadgeColor = (riskScore?: number) => {
    if (!riskScore) return 'bg-gray-100 text-gray-800';
    if (riskScore >= 75) return 'bg-red-100 text-red-800';
    if (riskScore >= 50) return 'bg-orange-100 text-orange-800';
    if (riskScore >= 25) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getRiskLabel = (riskScore?: number) => {
    if (!riskScore) return 'Unknown';
    if (riskScore >= 75) return 'Critical';
    if (riskScore >= 50) return 'High';
    if (riskScore >= 25) return 'Medium';
    return 'Low';
  };

  const handleSyncProvider = async (providerId: string) => {
    setSyncingProviders(prev => new Set(prev).add(providerId));

    try {
      await authenticatedRequest(`/api/identity-providers/${providerId}/sync`, {
        method: 'POST'
      });

      toast({
        title: "Sync Triggered",
        description: "Identity provider sync has been initiated.",
      });

      // Refetch sync status after a delay
      setTimeout(() => {
        refetchSyncStatus();
        setSyncingProviders(prev => {
          const next = new Set(prev);
          next.delete(providerId);
          return next;
        });
      }, 2000);
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to trigger sync",
        variant: "destructive",
      });
      setSyncingProviders(prev => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64 overflow-hidden">
        <TopBar title="Shadow IT Discovery" />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Apps Discovered</CardTitle>
                <Cloud className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalApps || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.discoveredViaIdP || 0} via IdP integration
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Shadow IT Detected</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {stats?.shadowITDetected || 0}
                </div>
                <p className="text-xs text-muted-foreground">Awaiting approval</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Risk Apps</CardTitle>
                <Shield className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats?.highRiskApps || 0}</div>
                <p className="text-xs text-muted-foreground">Risk score ≥ 70</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved Apps</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats?.approved || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.denied || 0} denied
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Shadow IT Apps */}
            <Card>
              <CardHeader>
                <CardTitle>Shadow IT Detected</CardTitle>
                <CardDescription>Unapproved applications discovered via IdP</CardDescription>
              </CardHeader>
              <CardContent>
                {shadowITLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : shadowITApps && shadowITApps.length > 0 ? (
                  <div className="space-y-4">
                    {shadowITApps.slice(0, 5).map((app) => (
                      <div key={app.id} className="flex items-center justify-between border-b pb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{app.name}</h4>
                            <Badge className={getRiskBadgeColor(app.riskScore)}>
                              {getRiskLabel(app.riskScore)} ({app.riskScore || 0})
                            </Badge>
                          </div>
                          {app.vendor && (
                            <p className="text-sm text-muted-foreground">{app.vendor}</p>
                          )}
                          {app.riskFactors && app.riskFactors.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {app.riskFactors[0]}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/saas-apps?id=${app.id}`}>Review</a>
                        </Button>
                      </div>
                    ))}
                    {shadowITApps.length > 5 && (
                      <Button variant="link" className="w-full" asChild>
                        <a href="/saas-apps?approvalStatus=pending">
                          View all {shadowITApps.length} apps →
                        </a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No Shadow IT detected
                  </p>
                )}
              </CardContent>
            </Card>

            {/* High Risk Apps */}
            <Card>
              <CardHeader>
                <CardTitle>High Risk Applications</CardTitle>
                <CardDescription>Apps with excessive permissions or high risk scores</CardDescription>
              </CardHeader>
              <CardContent>
                {highRiskLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : highRiskApps && highRiskApps.length > 0 ? (
                  <div className="space-y-4">
                    {highRiskApps.slice(0, 5).map((app) => (
                      <div key={app.id} className="flex items-center justify-between border-b pb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{app.name}</h4>
                            <Badge className={getRiskBadgeColor(app.riskScore)}>
                              {app.riskScore || 0}
                            </Badge>
                          </div>
                          {app.vendor && (
                            <p className="text-sm text-muted-foreground">{app.vendor}</p>
                          )}
                          {app.riskFactors && app.riskFactors.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {app.riskFactors[0]}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/saas-apps?id=${app.id}`}>Review</a>
                        </Button>
                      </div>
                    ))}
                    {highRiskApps.length > 5 && (
                      <Button variant="link" className="w-full" asChild>
                        <a href="/saas-apps">View all {highRiskApps.length} apps →</a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No high-risk apps found
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sync Status */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Identity Provider Sync Status</CardTitle>
              <CardDescription>Monitor discovery sync from connected identity providers</CardDescription>
            </CardHeader>
            <CardContent>
              {syncStatusLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : syncStatus && syncStatus.providers.length > 0 ? (
                <div className="space-y-4">
                  {syncStatus.providers.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between border-b pb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium">{provider.name}</h4>
                          <Badge variant="outline">{provider.type.toUpperCase()}</Badge>

                          {provider.isCurrentlySyncing && (
                            <Badge className="bg-blue-100 text-blue-800">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              Syncing
                            </Badge>
                          )}
                          {provider.syncStatus === 'error' && (
                            <Badge className="bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                          {provider.syncStatus === 'idle' && provider.syncEnabled && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{provider.totalApps} apps</span>
                          <span>{provider.totalUsers} users</span>
                          {provider.lastSyncAt && (
                            <span>
                              Last sync: {new Date(provider.lastSyncAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {provider.syncError && (
                          <p className="text-xs text-red-600 mt-1">{provider.syncError}</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncProvider(provider.id)}
                        disabled={provider.isCurrentlySyncing || syncingProviders.has(provider.id)}
                      >
                        {provider.isCurrentlySyncing || syncingProviders.has(provider.id) ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Now
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No identity providers configured.
                  <Button variant="link" asChild>
                    <a href="/identity-providers">Add Identity Provider →</a>
                  </Button>
                </p>
              )}
            </CardContent>
          </Card>
        </main>

        <FloatingAIAssistant />
      </div>
    </div>
  );
}
