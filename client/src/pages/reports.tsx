import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/layout/layout";
import { ReportGenerator, type ReportHistoryEntry } from "@/components/dashboard/report-generator";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  User, 
  Clock,
  TrendingUp,
  Filter,
  History,
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { exportReportToExcel } from "@/lib/report-export";

const RECENT_REPORTS_KEY = "recent-reports";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress: string | null;
  userAgent: string | null;
  beforeState: any;
  afterState: any;
  description: string;
  tenantId: string;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export default function Reports() {
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    action: "",
    resourceType: "",
    userId: "",
    startDate: "",
    endDate: "",
  });
  const pageSize = 20;

  // Fetch dashboard metrics for ReportGenerator
  const { data: metrics } = useQuery({
    queryKey: ["/api/dashboard/metrics"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch audit logs for Activity Logs tab
  const { data: logsData, isLoading: logsLoading } = useQuery<AuditLogsResponse>({
    queryKey: [
      "/api/audit-logs",
      currentPage,
      filters.action,
      filters.resourceType,
      filters.userId,
      filters.startDate,
      filters.endDate,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((currentPage - 1) * pageSize).toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.resourceType && { resourceType: filters.resourceType }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });
      
      const response = await authenticatedRequest("GET", `/api/audit-logs?${params}`);
      return response.json();
    },
    enabled: permissions.canViewReports,
  });

  const [recentReports, setRecentReports] = useState<ReportHistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_REPORTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [redownloadId, setRedownloadId] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'hardware':
        return '🖥️';
      case 'software':
        return '💻';
      case 'peripheral':
        return '⌨️';
      default:
        return '📊';
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'hardware':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'software':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'peripheral':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const filterValue = value === "all" ? "" : value;
    setFilters(prev => ({ ...prev, [key]: filterValue }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      action: "",
      resourceType: "",
      userId: "",
      startDate: "",
      endDate: "",
    });
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes("login") || action.includes("signup")) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    if (action.includes("create")) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    if (action.includes("update")) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    if (action.includes("delete")) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
  };

  const toastSuccess = (title: string, description?: string) => {
    toast({
      title,
      description,
    });
  };

  const toastError = (title: string, description?: string) => {
    toast({
      title,
      description: description || "Please try again.",
      variant: "destructive",
    });
  };

  const handleReportGenerated = (entry: ReportHistoryEntry) => {
    setRecentReports((prev) => {
      const next = [entry, ...prev.filter((report) => report.id !== entry.id)].slice(0, 10);
      localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleRedownload = async (report: ReportHistoryEntry) => {
    if (!report.params?.fields?.length) {
      toastError("Cannot re-download", "Missing report configuration.");
      return;
    }

    setRedownloadId(report.id);
    try {
      const params = new URLSearchParams({
        fields: report.params.fields.join(","),
        type: report.params.type || "all",
      });

      const response = await authenticatedRequest("GET", `/api/assets/report?${params}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to download report");
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("No data available for this report");
      }

      const filename = `${report.name
        .toLowerCase()
        .replace(/\\s+/g, "-")}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.xlsx`;

      exportReportToExcel(data, filename);
      toastSuccess("Report downloaded", `${report.name} downloaded successfully.`);
    } catch (error: any) {
      toastError("Download failed", error?.message);
    } finally {
      setRedownloadId(null);
    }
  };

  const reportsThisMonth = recentReports.filter((report) => {
    const generatedDate = new Date(report.generatedAt);
    const now = new Date();
    return (
      generatedDate.getMonth() === now.getMonth() &&
      generatedDate.getFullYear() === now.getFullYear()
    );
  }).length;
  const totalReports = recentReports.length;
  const totalContributors = new Set(
    recentReports.map((report) => report.generatedBy || "Unknown")
  ).size;

  if (!permissions.canViewReports) {
    return (
      <Layout title="Reports & Activity Logs" description="Generate custom reports and monitor system activity">
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardHeader>
              <CardTitle>Access restricted</CardTitle>
              <CardDescription>Only admins can view reports.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Reports & Activity Logs" description="Generate custom reports and monitor system activity">
      <div className="flex-1 space-y-6 p-4 pt-6 page-enter">
        {/* Page Header */}
        <div className="flex items-center justify-between space-y-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="page-title-reports">Reports & Activity</h2>
            <p className="text-muted-foreground">
              Generate custom reports and monitor system activity logs
            </p>
          </div>
        </div>

        <Tabs defaultValue="reports" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reports" data-testid="tab-reports">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="w-4 h-4 mr-2" />
              Activity Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Report Generator - Full width on mobile, 2/3 on large screens */}
              <div className="lg:col-span-2">
                <ReportGenerator metrics={metrics} onReportGenerated={handleReportGenerated} />
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Report Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">This Month</span>
                      </div>
                      <span className="font-medium" data-testid="stats-this-month">{reportsThisMonth}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-600" />
                        <span className="text-sm">Total Reports</span>
                      </div>
                      <span className="font-medium" data-testid="stats-total-reports">{totalReports}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-purple-600" />
                        <span className="text-sm">Contributors</span>
                      </div>
                      <span className="font-medium" data-testid="stats-contributors">{totalContributors}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Recent Reports Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Recent Reports
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Your recently generated reports and downloads
                </div>
              </CardHeader>
              <CardContent>
                {recentReports.length === 0 ? (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No reports generated yet</p>
                    <p className="text-sm text-muted-foreground">Generate your first report using the form above</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {recentReports.map((report) => (
                        <div 
                          key={report.id} 
                          className="border rounded-lg p-4 space-y-3"
                          data-testid={`report-item-${report.id}`}
                        >
                          {/* Report Header */}
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getTypeIcon(report.type)}</span>
                                <h4 className="font-medium" data-testid={`report-name-${report.id}`}>
                                  {report.name}
                                </h4>
                                <Badge variant="outline" className={getTypeBadgeColor(report.type)}>
                                  {report.type === 'all' ? 'All Assets' : report.type}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {report.recordCount ?? 0} records • {formatFileSize(report.size ?? 0)}
                              </p>
                            </div>
                            <Button
                              variant="outline" 
                              size="sm"
                              className="flex items-center gap-1"
                              data-testid={`button-redownload-${report.id}`}
                              disabled={redownloadId === report.id}
                              onClick={() => handleRedownload(report)}
                            >
                              {redownloadId === report.id ? (
                                <>
                                  <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <Download className="h-3 w-3" />
                                  Re-download
                                </>
                              )}
                            </Button>
                          </div>

                          {/* Report Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Generated:</span>
                              <span data-testid={`report-date-${report.id}`}>
                                {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">By:</span>
                              <span data-testid={`report-user-${report.id}`}>{report.generatedBy}</span>
                            </div>
                          </div>

                          {/* Fields Preview */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                              <Filter className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Fields ({report.fields?.length ?? 0}):</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(report.fields ?? []).slice(0, 4).map((field) => (
                                <Badge 
                                  key={field} 
                                  variant="secondary" 
                                  className="text-xs"
                                  data-testid={`report-field-${report.id}-${field}`}
                                >
                                  {field}
                                </Badge>
                              ))}
                              {(report.fields?.length ?? 0) > 4 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{(report.fields?.length ?? 0) - 4} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            {/* Filters Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Filter className="w-5 h-5 mr-2" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="action-filter">Action</Label>
                    <Select value={filters.action || "all"} onValueChange={(value) => handleFilterChange("action", value)}>
                      <SelectTrigger data-testid="filter-action">
                        <SelectValue placeholder="All actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        <SelectItem value="login">Login</SelectItem>
                        <SelectItem value="signup">Signup</SelectItem>
                        <SelectItem value="asset_create">Asset Create</SelectItem>
                        <SelectItem value="asset_update">Asset Update</SelectItem>
                        <SelectItem value="asset_delete">Asset Delete</SelectItem>
                        <SelectItem value="license_create">License Create</SelectItem>
                        <SelectItem value="user_invite">User Invite</SelectItem>
                        <SelectItem value="user_role_update">Role Update</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="resource-filter">Resource Type</Label>
                    <Select value={filters.resourceType || "all"} onValueChange={(value) => handleFilterChange("resourceType", value)}>
                      <SelectTrigger data-testid="filter-resource-type">
                        <SelectValue placeholder="All resources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All resources</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="software_license">Software License</SelectItem>
                        <SelectItem value="ticket">Ticket</SelectItem>
                        <SelectItem value="invitation">Invitation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange("startDate", e.target.value)}
                      data-testid="filter-start-date"
                    />
                  </div>

                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange("endDate", e.target.value)}
                      data-testid="filter-end-date"
                    />
                  </div>

                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      onClick={clearFilters}
                      className="w-full"
                      data-testid="button-clear-filters"
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  Activity Logs
                  {logsData && (
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                      {logsData.pagination.total} total entries
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : logsData?.logs.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No activity logs found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No activities match your current filters.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      {logsData?.logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                          data-testid={`log-entry-${log.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <Badge className={getActionBadgeColor(log.action)}>
                                {log.action.replace(/_/g, " ").toUpperCase()}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">
                                {log.description}
                              </span>
                            </div>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center">
                                <User className="w-3 h-3 mr-1" />
                                {log.userEmail} ({log.userRole})
                              </span>
                              <span className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {formatDate(log.createdAt)}
                              </span>
                              {log.ipAddress && (
                                <span>IP: {log.ipAddress}</span>
                              )}
                              {log.resourceType && (
                                <span>Resource: {log.resourceType}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {logsData && logsData.pagination.total > pageSize && (
                      <div className="flex items-center justify-between mt-6">
                        <div className="text-sm text-muted-foreground">
                          Showing {((currentPage - 1) * pageSize) + 1} to{" "}
                          {Math.min(currentPage * pageSize, logsData.pagination.total)} of{" "}
                          {logsData.pagination.total} results
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            disabled={!logsData.pagination.hasMore}
                            data-testid="button-next-page"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />
    </Layout>
  );
}
