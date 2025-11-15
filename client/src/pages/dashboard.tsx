import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { AIRecommendations } from "@/components/dashboard/ai-recommendations";
import { WorldMap } from "@/components/dashboard/world-map";
import { DraggableTileWrapper } from "@/components/dashboard/draggable-tile-wrapper";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToWindowEdges } from '@dnd-kit/modifiers';

const AI_NO_DATA_MESSAGE = "No meaningful recommendations can be generated because your organization does not have enough ITAM data.";

interface DashboardTile {
  id: string;
  title: string;
  component: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  width?: number;
  height?: number;
  section?: string;
}
import { HardwareTile } from "@/components/dashboard/individual-tiles/hardware-tile";
import { SoftwareTile } from "@/components/dashboard/individual-tiles/software-tile";
import { PeripheralsTile } from "@/components/dashboard/individual-tiles/peripherals-tile";
import { OthersTile } from "@/components/dashboard/individual-tiles/others-tile";
import { UnusedHardwareTile } from "@/components/dashboard/individual-tiles/unused-hardware-tile";
import { UnusedLicensesTile } from "@/components/dashboard/individual-tiles/unused-licenses-tile";
import { ExpiringItemsTile } from "@/components/dashboard/individual-tiles/expiring-items-tile";
import { ComplianceRiskTile } from "@/components/dashboard/individual-tiles/compliance-risk-tile";
import { RecentActivitiesTile } from "@/components/dashboard/individual-tiles/recent-activities-tile";
import { Button } from "@/components/ui/button";
import { authenticatedRequest } from "@/lib/auth";
import type { Recommendation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";

// Create dashboard tiles for draggable system
function createDashboardTiles(
  metrics: any,
  recommendations: Recommendation[] | undefined,
  handleNavigateToAssets: (type?: string, category?: string) => void,
  handleViewAllRecommendations: () => void,
  handleViewRecommendation: (id: string) => void,
  navigate: any
): DashboardTile[] {
  return [
    // Asset Overview Section
    {
      id: 'hardware-tile',
      title: 'Hardware Assets',
      section: 'asset-overview',
      defaultPosition: { x: 0, y: 120 },
      width: 336,
      height: 180,
      component: <HardwareTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
    },
    {
      id: 'software-tile',
      title: 'Software Assets',
      section: 'asset-overview',
      defaultPosition: { x: 324, y: 120 },
      width: 336,
      height: 180,
      component: <SoftwareTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
    },
    {
      id: 'peripherals-tile',
      title: 'Peripheral Devices',
      section: 'asset-overview',
      defaultPosition: { x: 648, y: 120 },
      width: 336,
      height: 180,
      component: <PeripheralsTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
    },
    {
      id: 'others-tile',
      title: 'Other Assets',
      section: 'asset-overview',
      defaultPosition: { x: 972, y: 120 },
      width: 336,
      height: 180,
      component: <OthersTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
    },
    
    // Asset Lifecycle Section
    {
      id: 'deployed-assets',
      title: 'Deployed Assets',
      section: 'lifecycle',
      defaultPosition: { x: 0, y: 320 },
      width: 336,
      height: 112,
      component: (
        <div className="bg-gradient-to-br from-surface/70 to-surface-light/70 backdrop-blur-md rounded-xl border border-white/10 p-4 h-full flex items-center justify-between hover:shadow-card-hover transition-all duration-300 group" data-testid="card-deployed-assets">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Deployed</p>
            <p className="text-3xl font-display font-bold text-status-success" data-testid="count-deployed">
              {metrics?.assetStatusCounts?.deployed || 0}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-gradient-success flex items-center justify-center shadow-glow group-hover:shadow-glow-strong transition-all">
            <div className="w-3 h-3 rounded-full bg-white"></div>
          </div>
        </div>
      )
    },
    {
      id: 'in-stock-assets',
      title: 'In Stock Assets',
      section: 'lifecycle',
      defaultPosition: { x: 344, y: 320 },
      width: 336,
      height: 112,
      component: (
        <div className="bg-gradient-to-br from-surface/70 to-surface-light/70 backdrop-blur-md rounded-xl border border-white/10 p-4 h-full flex items-center justify-between hover:shadow-card-hover transition-all duration-300 group" data-testid="card-in-stock-assets">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">In Stock</p>
            <p className="text-3xl font-display font-bold text-brand-primary" data-testid="count-in-stock">
              {metrics?.assetStatusCounts?.inStock || 0}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow group-hover:shadow-glow-strong transition-all">
            <div className="w-3 h-3 rounded-full bg-white"></div>
          </div>
        </div>
      )
    },
    {
      id: 'in-repair-assets',
      title: 'In Repair Assets',
      section: 'lifecycle',
      defaultPosition: { x: 688, y: 320 },
      width: 336,
      height: 112,
      component: (
        <div className="bg-gradient-to-br from-surface/70 to-surface-light/70 backdrop-blur-md rounded-xl border border-white/10 p-4 h-full flex items-center justify-between hover:shadow-card-hover transition-all duration-300 group" data-testid="card-in-repair-assets">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">In Repair</p>
            <p className="text-3xl font-display font-bold text-status-warning" data-testid="count-in-repair">
              {metrics?.assetStatusCounts?.inRepair || 0}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-gradient-warning flex items-center justify-center shadow-glow group-hover:shadow-glow-strong transition-all">
            <div className="w-3 h-3 rounded-full bg-white"></div>
          </div>
        </div>
      )
    },
    {
      id: 'retired-assets',
      title: 'Retired Assets',
      section: 'lifecycle',
      defaultPosition: { x: 1032, y: 320 },
      width: 336,
      height: 112,
      component: (
        <div className="bg-gradient-to-br from-surface/70 to-surface-light/70 backdrop-blur-md rounded-xl border border-white/10 p-4 h-full flex items-center justify-between hover:shadow-card-hover transition-all duration-300 group" data-testid="card-retired-assets">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Retired</p>
            <p className="text-3xl font-display font-bold text-text-muted" data-testid="count-retired">
              {metrics?.assetStatusCounts?.retired || 0}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-lighter border border-white/10 flex items-center justify-center group-hover:shadow-card transition-all">
            <div className="w-3 h-3 rounded-full bg-text-muted"></div>
          </div>
        </div>
      )
    },
    
    // Expiring Warranties & Licenses
    {
      id: 'expiring-warranties',
      title: 'Expiring Warranties',
      section: 'expiring',
      defaultPosition: { x: 0, y: 500 },
      width: 688,
      height: 300,
      component: (
        <div className="bg-card rounded-lg border h-full" data-testid="card-expiring-warranties">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-yellow-600 mr-2"></div>
              <p className="text-sm font-medium text-foreground">Hardware Warranties</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {metrics?.itamInsights?.expiringItems?.warranties?.length || 0} expiring
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {metrics?.itamInsights?.expiringItems?.warranties?.length > 0 ? (
              metrics.itamInsights.expiringItems.warranties.map((item: any) => (
                <div
                  key={item.id}
                  className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  data-testid={`expiring-warranty-${item.id}`}
                  onClick={() => navigate(`/assets?selectedId=${item.id}`)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-yellow-600 font-medium ml-2">
                      {(() => {
                        const date = item.expiryDate || item.warrantyExpiry || item.amcExpiry;
                        return date ? new Date(date).toLocaleDateString() : 'No date';
                      })()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {item.manufacturer} {item.model} • {item.category}
                  </p>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Serial: {item.serialNumber || 'N/A'}</span>
                    <span>Purchase: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-muted-foreground">
                      {item.assignedUser || item.location || 'Unassigned'}
                    </p>
                    <p className="text-xs text-yellow-600">{item.contractType}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No warranties expiring in next 30 days
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'expiring-licenses',
      title: 'Expiring Licenses',
      section: 'expiring',
      defaultPosition: { x: 704, y: 500 },
      width: 688,
      height: 300,
      component: (
        <div className="bg-card rounded-lg border h-full" data-testid="card-expiring-licenses">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-600 mr-2"></div>
              <p className="text-sm font-medium text-foreground">Software Licenses</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {metrics?.itamInsights?.expiringItems?.licenses?.length || 0} expiring
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {metrics?.itamInsights?.expiringItems?.licenses?.length > 0 ? (
              metrics.itamInsights.expiringItems.licenses.map((item: any) => (
                <div
                  key={item.id}
                  className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  data-testid={`expiring-license-${item.id}`}
                  onClick={() => navigate(`/software?selectedId=${item.id}`)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-red-600 font-medium ml-2">
                      {(() => {
                        const date = item.expiryDate || item.renewalDate;
                        return date ? new Date(date).toLocaleDateString() : 'No date';
                      })()}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {item.vendor} v{item.version} • {item.totalLicenses} licenses
                  </p>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Cost: ${item.costPerLicense || 0}/license</span>
                    <span>Purchase: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-muted-foreground">
                      License Key: {item.licenseKey || 'N/A'}
                    </p>
                    <p className="text-xs text-red-600">{item.contractType}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No licenses expiring in next 30 days
              </div>
            )}
          </div>
        </div>
      )
    },
    
    // ITAM Insights Section
    {
      id: 'unused-hardware',
      title: 'Unused Hardware',
      section: 'insights',
      defaultPosition: { x: 0, y: 820 },
      width: 336,
      height: 180,
      component: <UnusedHardwareTile metrics={metrics} />
    },
    {
      id: 'unused-licenses',
      title: 'Unused Licenses',
      section: 'insights',
      defaultPosition: { x: 348, y: 820 },
      width: 336,
      height: 180,
      component: <UnusedLicensesTile metrics={metrics} />
    },
    {
      id: 'expiring-items',
      title: 'Expiring Items Summary',
      section: 'insights',
      defaultPosition: { x: 696, y: 820 },
      width: 336,
      height: 180,
      component: <ExpiringItemsTile metrics={metrics} />
    },
    {
      id: 'compliance-risk',
      title: 'Compliance Risk',
      section: 'insights',
      defaultPosition: { x: 1044, y: 820 },
      width: 336,
      height: 180,
      component: <ComplianceRiskTile metrics={metrics} />
    },
    
    // Activities Section
    {
      id: 'recent-activities',
      title: 'Recent Activities',
      section: 'activities',
      defaultPosition: { x: 0, y: 1040 },
      width: 688,
      height: 320,
      component: <RecentActivitiesTile metrics={metrics} />
    },
    {
      id: 'ai-recommendations',
      title: 'AI Recommendations',
      section: 'activities',
      defaultPosition: { x: 696, y: 1040 },
      width: 688,
      height: 320,
      component: (
        <AIRecommendations
          recommendations={recommendations || []}
          onViewAll={handleViewAllRecommendations}
          onViewRecommendation={handleViewRecommendation}
        />
      )
    },
    
    // Global Distribution
    {
      id: 'world-map',
      title: 'Global Asset Distribution',
      section: 'visual',
      defaultPosition: { x: 0, y: 1400 },
      width: 1392,
      height: 380,
      component: (
        <div className="bg-card rounded-lg border p-3 h-full">
          <WorldMap />
        </div>
      )
    }
  ];
}


export default function Dashboard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);
  const [isDragMode, setIsDragMode] = useState(false);
  const [tilePositions, setTilePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [aiNoDataMessage, setAiNoDataMessage] = useState("");

  // Load positions from localStorage on mount
  useEffect(() => {
    const savedPositions = localStorage.getItem('dashboard-tile-positions-v1');
    if (savedPositions) {
      try {
        const positions = JSON.parse(savedPositions);
        setTilePositions(positions);
      } catch (error) {
        console.error('Failed to parse saved tile positions:', error);
      }
    }
  }, []);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Add small distance to prevent accidental drags
      },
    })
  );

  // Handle drag end - store new position
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    
    if (delta.x !== 0 || delta.y !== 0) {
      const tileId = active.id as string;
      
      setTilePositions(prev => {
        const currentPosition = prev[tileId] || { x: 0, y: 0 };
        const newPosition = {
          x: currentPosition.x + delta.x,
          y: currentPosition.y + delta.y,
        };
        
        const updatedPositions = {
          ...prev,
          [tileId]: newPosition,
        };
        
        // Persist to localStorage with the updated state
        localStorage.setItem('dashboard-tile-positions-v1', JSON.stringify(updatedPositions));
        
        return updatedPositions;
      });
    }
  };

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/dashboard/metrics"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/dashboard/metrics");
      return response.json();
    },
  });

  // Fetch AI recommendations
  const { data: recommendations = [] } = useQuery({
    queryKey: ["/api/ai/recommendations", "pending"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/ai/recommendations?status=pending");
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to load AI recommendations");
      }
      return response.json();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to load AI insights",
        description: error?.message || "Something went wrong while loading recommendations.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if ((recommendations || []).length > 0) {
      setAiNoDataMessage("");
    }
  }, [recommendations.length]);

  const generateAiRecommendationsMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedRequest("POST", "/api/ai/recommendations/run");
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to generate AI recommendations");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.status === "no-data") {
        setAiNoDataMessage(data.message || AI_NO_DATA_MESSAGE);
        toast({
          title: "Insufficient data",
          description: data.message || AI_NO_DATA_MESSAGE,
        });
        return;
      }
      setAiNoDataMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/ai/recommendations"] });
      toast({
        title: "AI insights refreshed",
        description: "New optimization recommendations are ready.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error?.message || "Unable to generate AI recommendations right now.",
        variant: "destructive",
      });
    },
  });

  const handleViewAllRecommendations = () => {
    navigate("/recommendations");
  };

  const handleViewRecommendation = (id: string) => {
    navigate(`/recommendations?id=${id}`);
  };

  const handleGenerateAiRecommendations = () => {
    if (!permissions.canGenerateAIRecommendations) {
      toast({
        title: "Insufficient permissions",
        description: "Only admins can generate new AI recommendations.",
        variant: "destructive",
      });
      return;
    }
    generateAiRecommendationsMutation.mutate();
  };

  const handleNavigateToAssets = (type?: string, category?: string) => {
    if (!type) return;
    if (category) {
      navigate(`/assets?type=${type}&category=${category}`);
    } else {
      navigate(`/assets?type=${type}`);
    }
  };

  if (metricsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background page-enter">
      <Sidebar />
      
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar
          title="ITAM Dashboard"
          description="Comprehensive IT Asset Management with Lifecycle Insights, Unused Asset Detection & Compliance Monitoring"
          showDragToggle={true}
          isDragMode={isDragMode}
          onToggleDragMode={() => setIsDragMode(!isDragMode)}
          onResetAll={() => {
            // Clear tile positions from state and localStorage
            setTilePositions({});
            localStorage.removeItem('dashboard-tile-positions-v1');
            // Also remove old key if it exists
            localStorage.removeItem('dashboard-layout-v1');
          }}
        />
        
        
        {/* Unified Layout with Optional Drag Functionality */}
        {metrics && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToWindowEdges]}
          >
            <div className="w-full max-w-[1440px] mx-auto px-6 py-6 box-border overflow-hidden">
              
                {/* Asset Overview Section */}
            <div className="mb-8" data-testid="section-asset-overview">
              <div className="mb-6" data-testid="heading-asset-overview">
                <h2 className="text-lg font-semibold mb-1 gradient-text">Asset Overview</h2>
                <p className="text-xs text-muted-foreground">Hardware, Software, Peripherals and Other Assets</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <DraggableTileWrapper isDragMode={isDragMode} tileId="hardware-tile" position={tilePositions["hardware-tile"]}>
                  <HardwareTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="software-tile" position={tilePositions["software-tile"]}>
                  <SoftwareTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="peripherals-tile" position={tilePositions["peripherals-tile"]}>
                  <PeripheralsTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="others-tile" position={tilePositions["others-tile"]}>
                  <OthersTile metrics={metrics} onNavigateToAssets={handleNavigateToAssets} />
                </DraggableTileWrapper>
              </div>
            </div>

            {/* Asset Lifecycle Section */}
            <div className="mb-8" data-testid="section-asset-lifecycle">
              <div className="mb-6" data-testid="heading-asset-lifecycle">
                <h2 className="text-lg font-semibold mb-1 gradient-text">Asset Lifecycle</h2>
                <p className="text-xs text-muted-foreground">Asset Status Distribution and Lifecycle Management</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <DraggableTileWrapper isDragMode={isDragMode} tileId="deployed-assets" position={tilePositions["deployed-assets"]}>
                  <div className="bg-card rounded-lg border p-3 h-28 flex items-center justify-between hover:shadow-sm transition-shadow box-border" data-testid="card-deployed-assets">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Deployed</p>
                      <p className="text-xl font-bold text-green-600" data-testid="count-deployed">
                        {metrics?.assetStatusCounts?.deployed || 0}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-green-600"></div>
                    </div>
                  </div>
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="in-stock-assets" position={tilePositions["in-stock-assets"]}>
                  <div className="bg-card rounded-lg border p-3 h-28 flex items-center justify-between hover:shadow-sm transition-shadow box-border" data-testid="card-in-stock-assets">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">In Stock</p>
                      <p className="text-xl font-bold text-blue-600" data-testid="count-in-stock">
                        {metrics?.assetStatusCounts?.inStock || 0}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    </div>
                  </div>
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="in-repair-assets" position={tilePositions["in-repair-assets"]}>
                  <div className="bg-card rounded-lg border p-3 h-28 flex items-center justify-between hover:shadow-sm transition-shadow box-border" data-testid="card-in-repair-assets">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">In Repair</p>
                      <p className="text-xl font-bold text-orange-600" data-testid="count-in-repair">
                        {metrics?.assetStatusCounts?.inRepair || 0}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-orange-600"></div>
                    </div>
                  </div>
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="retired-assets" position={tilePositions["retired-assets"]}>
                  <div className="bg-card rounded-lg border p-3 h-28 flex items-center justify-between hover:shadow-sm transition-shadow box-border" data-testid="card-retired-assets">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Retired</p>
                      <p className="text-xl font-bold text-gray-600" data-testid="count-retired">
                        {metrics?.assetStatusCounts?.retired || 0}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-gray-600"></div>
                    </div>
                  </div>
                </DraggableTileWrapper>
              </div>
            </div>

            {/* Expiring Warranties & Licenses Section */}
            <div className="mb-8" data-testid="section-expiring-items">
              <div className="mb-6" data-testid="heading-expiring-items">
                <h2 className="text-lg font-semibold mb-1 gradient-text">Expiring Warranties & Licenses</h2>
                <p className="text-xs text-muted-foreground">Upcoming Hardware Warranty and Software License Expirations</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="min-w-0 max-w-full">
                  <div className="bg-card rounded-lg border h-[300px] box-border" data-testid="card-expiring-warranties">
                    <div className="flex items-center justify-between p-3 border-b">
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-yellow-600 mr-2"></div>
                        <p className="text-sm font-medium text-foreground">Hardware Warranties</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {metrics?.itamInsights?.expiringItems?.warranties?.length || 0} expiring
                      </span>
                    </div>
                    <div className="max-h-[248px] overflow-y-auto">
                      {metrics?.itamInsights?.expiringItems?.warranties?.length > 0 ? (
                        metrics.itamInsights.expiringItems.warranties.map((item: any) => (
                          <div
                            key={item.id}
                            className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                            data-testid={`expiring-warranty-${item.id}`}
                            onClick={() => navigate(`/assets?selectedId=${item.id}`)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-yellow-600 font-medium ml-2">
                                {(() => {
                                  const date = item.expiryDate || item.warrantyExpiry || item.amcExpiry;
                                  return date ? new Date(date).toLocaleDateString() : 'No date';
                                })()}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {item.manufacturer} {item.model} • {item.category}
                            </p>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                              <span>Serial: {item.serialNumber || 'N/A'}</span>
                              <span>Purchase: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <p className="text-xs text-muted-foreground">
                                {item.assignedUser || item.location || 'Unassigned'}
                              </p>
                              <p className="text-xs text-yellow-600">{item.contractType}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No warranties expiring in next 30 days
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 max-w-full">
                  <div className="bg-card rounded-lg border h-[300px] box-border" data-testid="card-expiring-licenses">
                    <div className="flex items-center justify-between p-3 border-b">
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-red-600 mr-2"></div>
                        <p className="text-sm font-medium text-foreground">Software Licenses</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {metrics?.itamInsights?.expiringItems?.licenses?.length || 0} expiring
                      </span>
                    </div>
                    <div className="max-h-[248px] overflow-y-auto">
                      {metrics?.itamInsights?.expiringItems?.licenses?.length > 0 ? (
                        metrics.itamInsights.expiringItems.licenses.map((item: any) => (
                          <div
                            key={item.id}
                            className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                            data-testid={`expiring-license-${item.id}`}
                            onClick={() => navigate(`/assets?selectedId=${item.id}`)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-red-600 font-medium ml-2">
                                {(() => {
                                  const date = item.expiryDate || item.renewalDate;
                                  return date ? new Date(date).toLocaleDateString() : 'No date';
                                })()}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {item.vendor} v{item.version} • {item.totalLicenses} licenses
                            </p>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                              <span>Cost: ${item.costPerLicense || 0}/license</span>
                              <span>Purchase: {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <p className="text-xs text-muted-foreground">
                                License Key: {item.licenseKey || 'N/A'}
                              </p>
                              <p className="text-xs text-red-600">{item.contractType}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No licenses expiring in next 30 days
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Activities Section */}
            <div className="mb-8" data-testid="section-activities">
              <div className="mb-6" data-testid="heading-activities">
                <h2 className="text-lg font-semibold mb-1 gradient-text">Activities</h2>
                <p className="text-xs text-muted-foreground">Recent Activities and AI-Powered Recommendations</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <DraggableTileWrapper isDragMode={isDragMode} tileId="recent-activities" position={tilePositions["recent-activities"]}>
                  <RecentActivitiesTile metrics={metrics} />
                </DraggableTileWrapper>
                <DraggableTileWrapper isDragMode={isDragMode} tileId="ai-recommendations" position={tilePositions["ai-recommendations"]}>
                  <AIRecommendations
                    recommendations={recommendations || []}
                    onViewAll={handleViewAllRecommendations}
                    onViewRecommendation={handleViewRecommendation}
                    onGenerate={permissions.canGenerateAIRecommendations ? handleGenerateAiRecommendations : undefined}
                    isGenerating={generateAiRecommendationsMutation.isPending}
                    noDataMessage={aiNoDataMessage}
                  />
                </DraggableTileWrapper>
              </div>
            </div>

            {/* Global Distribution Section */}
            <div className="mb-8" data-testid="section-global-distribution">
              <div className="mb-6" data-testid="heading-global-distribution">
                <h2 className="text-lg font-semibold mb-1 gradient-text">Global Distribution</h2>
                <p className="text-xs text-muted-foreground">Worldwide Asset Location and Regional Overview</p>
              </div>
              <DraggableTileWrapper isDragMode={isDragMode} tileId="world-map" position={tilePositions["world-map"]}>
                <div className="bg-card rounded-lg border p-3 box-border">
                  <WorldMap />
                </div>
              </DraggableTileWrapper>
            </div>
            </div>
          </DndContext>
        )}
      </main>
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />
    </div>
  );
}
