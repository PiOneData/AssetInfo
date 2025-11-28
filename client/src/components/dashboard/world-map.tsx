import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { authenticatedRequest } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogOverlay } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Package, Navigation, Eye, Calendar, DollarSign, User } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type AssetRecord = Record<string, any> & {
  id?: string;
  name?: string;
  softwareName?: string;
  type?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  vendorName?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
  assignedUserEmployeeId?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  renewalDate?: string;
  purchaseCost?: string | number;
  country?: string;
  state?: string;
  city?: string;
  location?: string;
};

interface AssetLocationData {
  country: string;
  asset_count: number;
  coordinates?: [number, number];
}

interface LocationCoordinates {
  [key: string]: {
    lat: number;
    lng: number;
    type?: "country" | "state" | "city";
  };
}

interface LocalityData {
  id: string;
  name: string;
  asset_count: number;
  coordinates?: [number, number];
}

interface CityData {
  id: string;
  name: string;
  asset_count: number;
  coordinates?: [number, number];
  localities: LocalityData[];
}

interface StateData {
  id: string;
  name: string;
  asset_count: number;
  coordinates?: [number, number];
  cities: CityData[];
}

interface CountryData {
  id: string;
  name: string;
  asset_count: number;
  coordinates?: [number, number];
  states: StateData[];
}

interface HierarchicalLocationData {
  countries: CountryData[];
}

interface LocationScope {
  id: string;
  country: string;
  state: string;
  city: string;
  coordinates?: [number, number];
  assetCount?: number;
}

interface CategoryCounts {
  total: number;
  Hardware: number;
  Software: number;
  Peripherals: number;
  Others: number;
}

interface SummaryModalState {
  open: boolean;
  loading: boolean;
  location?: LocationScope;
  counts?: CategoryCounts;
  error?: string;
}

interface DetailModalState {
  open: boolean;
  loading: boolean;
  location?: LocationScope;
  assets: AssetRecord[];
  error?: string;
}

const CATEGORY_KEYS = ["Hardware", "Software", "Peripherals", "Others"] as const;
const DEFAULT_COUNTS: CategoryCounts = { total: 0, Hardware: 0, Software: 0, Peripherals: 0, Others: 0 };

let DefaultIcon = L.divIcon({
  html: `<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [20, 20],
  className: "custom-div-icon",
});

L.Marker.prototype.options.icon = DefaultIcon;

const sanitizeSegment = (value?: string) => {
  const trimmed = (value ?? "unknown").trim().toLowerCase();
  const clean = trimmed.replace(/[^a-z0-9]+/g, "-");
  return clean || "unknown";
};

const buildLocationSlug = (country: string, state?: string, city?: string) => {
  return [country, state, city].filter(Boolean).map((segment) => sanitizeSegment(segment)).join("__");
};

const getMarkerColor = (count: number): string => {
  if (count >= 10) return "#dc2626";
  if (count >= 5) return "#ea580c";
  if (count >= 3) return "#ca8a04";
  if (count >= 2) return "#16a34a";
  return "#3b82f6";
};

const createCustomMarker = (count: number) => {
  const color = getMarkerColor(count);
  const size = Math.max(32, Math.min(52, 32 + count * 2));
  const fontSize = count > 99 ? "11px" : count > 9 ? "13px" : "15px";

  return L.divIcon({
    html: `<div class="marker-inner" style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 4px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: ${fontSize};
      line-height: 1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      cursor: pointer;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: "custom-marker-icon",
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "N/A";
  }
};

const formatCurrency = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "N/A";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "N/A";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
  } catch {
    return "N/A";
  }
};

const normalizeCategoryCounts = (payload: any): CategoryCounts => {
  if (!payload) return { ...DEFAULT_COUNTS };
  const source =
    payload.counts ||
    payload.categories ||
    payload.countsByCategory ||
    payload.categoryCounts ||
    payload.data ||
    {};

  const normalized: CategoryCounts = {
    total:
      Number(payload.total ?? payload.totalAssets ?? payload.assetCount ?? payload.count ?? 0) ||
      0,
    Hardware: Number(source.Hardware ?? source.hardware ?? source.H ?? 0) || 0,
    Software: Number(source.Software ?? source.software ?? source.S ?? 0) || 0,
    Peripherals:
      Number(
        source.Peripherals ??
          source.peripherals ??
          source.Peripheral ??
          source.peripheral ??
          0,
      ) || 0,
    Others: Number(source.Others ?? source.others ?? source.other ?? 0) || 0,
  };

  const computedTotal =
    normalized.Hardware + normalized.Software + normalized.Peripherals + normalized.Others;
  normalized.total = Math.max(normalized.total, computedTotal);
  return normalized;
};

const computeCountsFromAssets = (assets: AssetRecord[]): CategoryCounts => {
  const counts = { ...DEFAULT_COUNTS };
  counts.total = assets.length;
  assets.forEach((asset) => {
    const type = (asset.type ?? "").toString().toLowerCase();
    if (type === "hardware") counts.Hardware += 1;
    else if (type === "software") counts.Software += 1;
    else if (type === "peripherals" || type === "peripheral") counts.Peripherals += 1;
    else counts.Others += 1;
  });
  return counts;
};

const filterAssetsByLocation = (assets: AssetRecord[], location: LocationScope): AssetRecord[] => {
  const matches = (value?: string, target?: string) => {
    const normalizedValue = (value ?? "").trim().toLowerCase();
    const normalizedTarget = (target ?? "").trim().toLowerCase();
    return normalizedValue === normalizedTarget;
  };

  return assets.filter(
    (asset) =>
      matches(asset.country, location.country) &&
      matches(asset.state, location.state) &&
      matches(asset.city, location.city),
  );
};

const formatLocationLabel = (location?: LocationScope) => {
  if (!location) return "";
  return [location.city, location.state, location.country].filter(Boolean).join(", ");
};

const formatAssetLocation = (asset: AssetRecord) => {
  return [asset.city, asset.state, asset.country].filter(Boolean).join(", ") || "N/A";
};

function MapController({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  return null;
}

export function WorldMap() {
  const [, setLocation] = useLocation();
  const [locationData, setLocationData] = useState<AssetLocationData[]>([]);
  const [hierarchicalData, setHierarchicalData] = useState<HierarchicalLocationData>({
    countries: [],
  });
  const [availableCoordinates, setAvailableCoordinates] = useState<LocationCoordinates>({});
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [initialViewSet, setInitialViewSet] = useState(false);
  const assetsWithLocationRef = useRef<AssetRecord[]>([]);

  const [summaryModal, setSummaryModal] = useState<SummaryModalState>({
    open: false,
    loading: false,
  });
  const [detailModal, setDetailModal] = useState<DetailModalState>({
    open: false,
    loading: false,
    assets: [],
  });

  const { data: assetsData, isLoading: isLoadingAssets } = useQuery({
    queryKey: ["/api/assets"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/assets");
      return response.json();
    },
  });

  const { data: coordinatesData, isLoading: isLoadingCoordinates } = useQuery({
    queryKey: ["/api/geographic/coordinates"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/geographic/coordinates");
      return response.json();
    },
  });

  useEffect(() => {
    if (coordinatesData) {
      setAvailableCoordinates(coordinatesData);
    }
  }, [coordinatesData]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "world-map-z-index";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .world-map-container .leaflet-container,
      .world-map-container .leaflet-pane,
      .world-map-container .leaflet-tile-pane,
      .world-map-container .leaflet-overlay-pane,
      .world-map-container .leaflet-shadow-pane,
      .world-map-container .leaflet-marker-pane,
      .world-map-container .leaflet-popup-pane {
        z-index: 0 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const isModalOpen = summaryModal.open || detailModal.open;

  useEffect(() => {
    let assets: AssetRecord[] = [];
    if (assetsData?.assets && Array.isArray(assetsData.assets)) {
      assets = assetsData.assets;
    } else if (Array.isArray(assetsData)) {
      assets = assetsData;
    } else if (assetsData && typeof assetsData === "object") {
      assets = Object.values(assetsData);
    }

    const assetsWithLocation: AssetRecord[] = [];
    const hardwareAssets = assets.filter(
      (asset) =>
        (asset.type || "").toString().toLowerCase() === "hardware",
    );

    assets.forEach((asset) => {
      let resolvedCountry = asset.country;
      let resolvedState = asset.state;
      let resolvedCity = asset.city;

      if (!resolvedCountry) {
        if ((asset.type || "").toString().toLowerCase() === "software" && hardwareAssets.length) {
          const fallbackHardware = hardwareAssets.find((hw) => hw.country);
          if (fallbackHardware) {
            resolvedCountry = fallbackHardware.country;
            resolvedState = fallbackHardware.state;
            resolvedCity = fallbackHardware.city;
          }
        }
      }

      if (resolvedCountry) {
        assetsWithLocation.push({
          ...asset,
          country: resolvedCountry,
          state: resolvedState || "Unknown State",
          city: resolvedCity || "Unknown City",
        });
      }
    });

    assetsWithLocationRef.current = assetsWithLocation;

    if (!assetsWithLocation.length) {
      setHierarchicalData({ countries: [] });
      setLocationData([]);
      return;
    }

    const countryMap = new Map<string, CountryData>();

    assetsWithLocation.forEach((asset) => {
      const countryName = asset.country ?? "Unknown Country";
      const stateName = asset.state ?? "Unknown State";
      const cityName = asset.city ?? "Unknown City";
      const countryKey = countryName;
      const stateKey = `${countryName},${stateName}`;
      const cityKey = `${countryName},${stateName},${cityName}`;
      const countryId = buildLocationSlug(countryName);
      const stateId = buildLocationSlug(countryName, stateName);
      const cityId = buildLocationSlug(countryName, stateName, cityName);

      if (!countryMap.has(countryName)) {
        const coord = availableCoordinates[countryKey];
        countryMap.set(countryName, {
          id: countryId,
          name: countryName,
          asset_count: 0,
          coordinates: coord ? [coord.lat, coord.lng] : undefined,
          states: [],
        });
      }

      const country = countryMap.get(countryName)!;
      country.asset_count += 1;

      let state = country.states.find((entry) => entry.name === stateName);
      if (!state) {
        const coord = availableCoordinates[stateKey];
        state = {
          id: stateId,
          name: stateName,
          asset_count: 0,
          coordinates: coord ? [coord.lat, coord.lng] : undefined,
          cities: [],
        };
        country.states.push(state);
      }
      state.asset_count += 1;

      let city = state.cities.find((entry) => entry.name === cityName);
      if (!city) {
        const coord = availableCoordinates[cityKey];
        city = {
          id: cityId,
          name: cityName,
          asset_count: 0,
          coordinates: coord ? [coord.lat, coord.lng] : undefined,
          localities: [],
        };
        state.cities.push(city);
      }
      city.asset_count += 1;
    });

    const countries = Array.from(countryMap.values())
      .map((country) => ({
        ...country,
        states: country.states
          .map((state) => ({
            ...state,
            cities: state.cities.sort((a, b) => b.asset_count - a.asset_count),
          }))
          .sort((a, b) => b.asset_count - a.asset_count),
      }))
      .sort((a, b) => b.asset_count - a.asset_count);

    setHierarchicalData({ countries });
    setLocationData(
      countries.map((country) => ({
        country: country.name,
        asset_count: country.asset_count,
        coordinates: country.coordinates,
      })),
    );

    if (!initialViewSet && countries.length && mapInstance) {
      const top = countries[0];
      if (top.coordinates) {
        mapInstance.setView(top.coordinates, 5, { animate: true, duration: 1.5 });
        setInitialViewSet(true);
      }
    }
  }, [assetsData, availableCoordinates, initialViewSet, mapInstance]);

  const locationList = useMemo(() => {
    return hierarchicalData.countries.flatMap((country) =>
      country.states.flatMap((state) =>
        state.cities.map((city) => ({
          country,
          state,
          city,
          key: `${country.id}-${state.id}-${city.id}`,
        })),
      ),
    );
  }, [hierarchicalData]);

  const zoomToLocation = (scope: LocationScope) => {
    if (!mapInstance || !scope.coordinates) return;
    mapInstance.flyTo(scope.coordinates, 12, { animate: true, duration: 1.2 });
  };

  const handleLocationSummary = async (location: LocationScope) => {
    setDetailModal((prev) =>
      prev.open
        ? {
            ...prev,
            open: false,
            loading: false,
            assets: [],
            error: undefined,
            location: undefined,
          }
        : prev,
    );

    setSummaryModal({
      open: true,
      loading: true,
      location,
      counts: undefined,
      error: undefined,
    });

    try {
      const response = await authenticatedRequest(
        "GET",
        `/api/assets/location/${encodeURIComponent(location.id)}`,
      );
      if (!response.ok) {
        throw new Error("Unable to load asset summary");
      }

      const data = await response.json();
      setSummaryModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              counts: normalizeCategoryCounts(data),
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      const fallback = filterAssetsByLocation(assetsWithLocationRef.current, location);
      setSummaryModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              counts: computeCountsFromAssets(fallback),
              error: "Unable to reach the server. Showing cached counts.",
            }
          : prev,
      );
    }
  };

  const handleViewAllAssets = async () => {
    if (!summaryModal.location) return;
    const location = summaryModal.location;

    setSummaryModal((prev) =>
      prev
        ? {
            ...prev,
            open: false,
          }
        : prev,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    setDetailModal({
      open: true,
      loading: true,
      location,
      assets: [],
      error: undefined,
    });

    try {
      const response = await authenticatedRequest(
        "GET",
        `/api/assets/location/${encodeURIComponent(location.id)}/all`,
      );
      if (!response.ok) {
        throw new Error("Unable to load assets");
      }

      const payload = await response.json();
      const assets = Array.isArray(payload?.assets)
        ? payload.assets
        : Array.isArray(payload)
          ? payload
          : payload?.data ?? [];
      const filtered = filterAssetsByLocation(assets, location);
      const finalAssets = filtered.length
        ? filtered
        : filterAssetsByLocation(assetsWithLocationRef.current, location);

      setDetailModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              assets: finalAssets,
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      const fallback = filterAssetsByLocation(assetsWithLocationRef.current, location);
      setDetailModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              assets: fallback,
              error: "Unable to load live data. Showing cached assets.",
            }
          : prev,
      );
    }
  };

  const closeSummaryModal = () => {
    setSummaryModal({
      open: false,
      loading: false,
    });
  };

  const closeDetailModal = () => {
    setDetailModal((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const navigateToUserProfile = async (
    email?: string,
    employeeId?: string,
    userId?: string,
  ) => {
    try {
      if (employeeId) {
        setLocation(`/users/${employeeId}`);
        return;
      }

      if (email) {
        const response = await authenticatedRequest(
          "GET",
          `/api/users/find?email=${encodeURIComponent(email)}`,
        );
        if (response.ok) {
          const user = await response.json();
          const userIdentifier = user.userID || user.id;
          setLocation(`/users/${userIdentifier}`);
          return;
        }
      }

      if (userId) {
        const response = await authenticatedRequest("GET", `/api/users/${userId}`);
        if (response.ok) {
          const user = await response.json();
          const userIdentifier = user.userID || user.id;
          setLocation(`/users/${userIdentifier}`);
          return;
        }
      }
    } catch (error) {
      console.error("Error navigating to user profile:", error);
    }
  };

  const groupedAssets = useMemo(() => {
    const groups: Record<string, AssetRecord[]> = {
      Hardware: [],
      Software: [],
      Peripherals: [],
      Others: [],
    };

    detailModal.assets.forEach((asset) => {
      const type = (asset.type || "").toString().toLowerCase();
      if (type === "hardware") {
        groups.Hardware.push(asset);
      } else if (type === "software") {
        groups.Software.push(asset);
      } else if (type === "peripherals" || type === "peripheral") {
        groups.Peripherals.push(asset);
      } else {
        groups.Others.push(asset);
      }
    });

    return groups;
  }, [detailModal.assets]);

  if (isLoadingAssets || isLoadingCoordinates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MapPin className="h-5 w-5" />
            <span>Asset Distribution Map</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] bg-muted rounded-lg flex items-center justify-center">
            <div className="text-muted-foreground">Loading map...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getEmptyMessage = (section: string) => {
    switch (section) {
      case "Hardware":
        return "No hardware assets in this location.";
      case "Software":
        return "No software assets in this location.";
      case "Peripherals":
        return "No peripheral assets in this location.";
      case "Others":
        return "No other assets in this location.";
      default:
        return `No ${section.toLowerCase()} assets in this location.`;
    }
  };

  const renderHardwareLikeSection = (label: string, data: AssetRecord[]) => (
    <Card key={label} className="bg-muted/40 border-muted-foreground/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{label}</span>
          <Badge variant="secondary" className="bg-primary/20">
            {data.length} {data.length === 1 ? "asset" : "assets"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Asset Name, Serial, Model, Manufacturer, Category, Type, Status, Location, Assignment, and
          Procurement details
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length ? (
          <div className="rounded-md border border-muted-foreground/20 overflow-x-auto">
            <Table className="min-w-[1600px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Name</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Assigned Email</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead>Warranty Expiry</TableHead>
                  <TableHead>Purchase Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((asset, index) => (
                  <TableRow key={asset.id ?? `${label}-${index}`}>
                    <TableCell>{asset.name || "N/A"}</TableCell>
                    <TableCell className="font-mono text-xs">{asset.serialNumber || "N/A"}</TableCell>
                    <TableCell>{asset.model || "N/A"}</TableCell>
                    <TableCell>{asset.manufacturer || "N/A"}</TableCell>
                    <TableCell>{asset.category || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {asset.type || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          asset.status === "deployed"
                            ? "default"
                            : asset.status === "in-stock"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {asset.status || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatAssetLocation(asset)}</TableCell>
                    <TableCell>
                      {asset.assignedUserName ? (
                        <button
                          className="text-primary hover:underline flex items-center gap-1"
                          onClick={() =>
                            navigateToUserProfile(
                              asset.assignedUserEmail,
                              asset.assignedUserEmployeeId,
                              asset.assignedUserId,
                            )
                          }
                        >
                          <User className="h-3 w-3" />
                          {asset.assignedUserName}
                        </button>
                      ) : (
                        "Unassigned"
                      )}
                    </TableCell>
                    <TableCell>
                      {asset.assignedUserEmail ? (
                        <a
                          href={`mailto:${asset.assignedUserEmail}`}
                          className="text-primary hover:underline break-all"
                        >
                          {asset.assignedUserEmail}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      {asset.assignedUserEmployeeId ? (
                        <a
                          href={`#/employee/${asset.assignedUserEmployeeId}`}
                          className="text-primary hover:underline font-mono"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateToUserProfile(
                              asset.assignedUserEmail,
                              asset.assignedUserEmployeeId,
                              asset.assignedUserId,
                            );
                          }}
                        >
                          {asset.assignedUserEmployeeId}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(asset.purchaseDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(asset.warrantyExpiry)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(asset.purchaseCost)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">{getEmptyMessage(label)}</div>
        )}
      </CardContent>
    </Card>
  );

  const renderSoftwareSection = (data: AssetRecord[]) => (
    <Card className="bg-muted/40 border-muted-foreground/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Software</span>
          <Badge variant="secondary" className="bg-primary/20">
            {data.length} {data.length === 1 ? "asset" : "assets"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Software Name, Version, License, Vendor, Assignment, Status, Lifecycle, and Cost
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length ? (
          <div className="rounded-md border border-muted-foreground/20 overflow-x-auto">
            <Table className="min-w-[1600px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Software Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>License Key / Type</TableHead>
                  <TableHead>Vendor / Publisher</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Assigned Email</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead>Expiry / Renewal</TableHead>
                  <TableHead>Purchase Cost</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((asset, index) => (
                  <TableRow key={asset.id ?? `software-${index}`}>
                    <TableCell>{asset.softwareName || asset.name || "N/A"}</TableCell>
                    <TableCell>{asset.version || "N/A"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {asset.licenseKey || asset.licenseType || "N/A"}
                    </TableCell>
                    <TableCell>{asset.vendorName || asset.manufacturer || "N/A"}</TableCell>
                    <TableCell>{asset.category || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {asset.type || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          asset.status === "installed"
                            ? "default"
                            : asset.status === "expired"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-xs capitalize"
                      >
                        {asset.status || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {asset.assignedUserName ? (
                        <button
                          className="text-primary hover:underline flex items-center gap-1"
                          onClick={() =>
                            navigateToUserProfile(
                              asset.assignedUserEmail,
                              asset.assignedUserEmployeeId,
                              asset.assignedUserId,
                            )
                          }
                        >
                          <User className="h-3 w-3" />
                          {asset.assignedUserName}
                        </button>
                      ) : (
                        "Unassigned"
                      )}
                    </TableCell>
                    <TableCell>
                      {asset.assignedUserEmail ? (
                        <a
                          href={`mailto:${asset.assignedUserEmail}`}
                          className="text-primary hover:underline break-all"
                        >
                          {asset.assignedUserEmail}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      {asset.assignedUserEmployeeId ? (
                        <a
                          href={`#/employee/${asset.assignedUserEmployeeId}`}
                          className="text-primary hover:underline font-mono"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateToUserProfile(
                              asset.assignedUserEmail,
                              asset.assignedUserEmployeeId,
                              asset.assignedUserId,
                            );
                          }}
                        >
                          {asset.assignedUserEmployeeId}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(asset.purchaseDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(asset.renewalDate ?? asset.warrantyExpiry)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(asset.purchaseCost)}
                      </div>
                    </TableCell>
                    <TableCell>{formatAssetLocation(asset)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">{getEmptyMessage("Software")}</div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2" data-testid="heading-world-map">
            <MapPin className="h-5 w-5" />
            <span>Global Asset Distribution</span>
          </CardTitle>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4" />
              <span>
                {locationData.reduce((sum, loc) => sum + loc.asset_count, 0)} assets across{" "}
                {locationData.length} locations
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 h-[400px]">
            <div className="w-80 flex-shrink-0">
              <div className="h-full border rounded-lg bg-muted/30">
                <div className="p-3 border-b">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Navigation className="h-4 w-4" />
                    Locations with Assets
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">Click to zoom, tap count for summary</p>
                </div>
                <ScrollArea className="h-[340px] p-2">
                  <div className="space-y-1">
                    {locationList.length ? (
                      locationList.map(({ country, state, city, key }) => {
                        const locationScope: LocationScope = {
                          id: city.id,
                          country: country.name,
                          state: state.name,
                          city: city.name,
                          coordinates: city.coordinates ?? state.coordinates ?? country.coordinates,
                          assetCount: city.asset_count,
                        };

                        return (
                          <Button
                            key={key}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between h-auto p-2 pr-10 text-left hover:bg-muted"
                            onClick={() => zoomToLocation(locationScope)}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              <span className="text-xs truncate" title={`${country.name} › ${state.name} › ${city.name}`}>
                                {country.name} › {state.name} › {city.name}
                              </span>
                            </div>
                            <span
                              className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 text-[11px] font-semibold rounded-full shadow-sm bg-[color:var(--badge-background)] text-[color:var(--badge-text-color)] cursor-pointer border border-[color:var(--badge-border-color)] leading-tight"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleLocationSummary(locationScope);
                              }}
                            >
                              {city.asset_count}
                            </span>
                          </Button>
                        );
                      })
                    ) : (
                      <div className="text-center text-xs text-muted-foreground py-4">
                        No locations with coordinates available.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div
              className="flex-1 rounded-lg overflow-hidden border relative z-0 world-map-container"
              data-testid="map-container"
              style={{ pointerEvents: isModalOpen ? "none" : "auto" }}
            >
              <MapContainer
                center={[20, 0]}
                zoom={3}
                style={{ height: "100%", width: "100%", zIndex: 1000 }}
                data-testid="leaflet-map"
              >
                <MapController onMapReady={setMapInstance} />
                <TileLayer
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {hierarchicalData.countries.flatMap((country) =>
                  country.states.flatMap((state) => {
                    const cityMarkers = state.cities.filter((city) => city.coordinates);
                    if (cityMarkers.length) {
                      return cityMarkers.map((city) => {
                        const scope: LocationScope = {
                          id: city.id,
                          country: country.name,
                          state: state.name,
                          city: city.name,
                          coordinates: city.coordinates,
                          assetCount: city.asset_count,
                        };
                        return (
                          <Marker
                            key={`city-${country.id}-${state.id}-${city.id}`}
                            position={city.coordinates!}
                            icon={createCustomMarker(city.asset_count)}
                            eventHandlers={{
                              click: () => {
                                zoomToLocation(scope);
                                handleLocationSummary(scope);
                              },
                            }}
                          />
                        );
                      });
                    }

                    if (state.coordinates) {
                      const scope: LocationScope = {
                        id: state.id,
                        country: country.name,
                        state: state.name,
                        city: "",
                        coordinates: state.coordinates,
                        assetCount: state.asset_count,
                      };
                      return (
                        <Marker
                          key={`state-${country.id}-${state.id}`}
                          position={state.coordinates}
                          icon={createCustomMarker(state.asset_count)}
                          eventHandlers={{
                            click: () => {
                              zoomToLocation(scope);
                              handleLocationSummary(scope);
                            },
                          }}
                        />
                      );
                    }

                    if (country.coordinates) {
                      const scope: LocationScope = {
                        id: country.id,
                        country: country.name,
                        state: "",
                        city: "",
                        coordinates: country.coordinates,
                        assetCount: country.asset_count,
                      };
                      return (
                        <Marker
                          key={`country-${country.id}`}
                          position={country.coordinates}
                          icon={createCustomMarker(country.asset_count)}
                          eventHandlers={{
                            click: () => {
                              zoomToLocation(scope);
                              handleLocationSummary(scope);
                            },
                          }}
                        />
                      );
                    }

                    return null;
                  }),
                )}
              </MapContainer>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Asset Count Legend</h4>
            <div className="flex flex-wrap items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                <span>1 asset</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                <span>2 assets</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#ca8a04" }} />
                <span>3-4 assets</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#ea580c" }} />
                <span>5-9 assets</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#dc2626" }} />
                <span>10+ assets</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={summaryModal.open} onOpenChange={(open) => !open && closeSummaryModal()}>
        <DialogOverlay className="fixed inset-0 bg-black/70 z-[2050]" />
        <DialogContent className="max-w-md w-[90vw] bg-background border border-muted/50 shadow-2xl z-[2100] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg">Asset Count Summary</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {summaryModal.location ? (
                <>Assets currently assigned to {formatLocationLabel(summaryModal.location)}</>
              ) : (
                "Select a marker to view a summary."
              )}
            </DialogDescription>
          </DialogHeader>
          {summaryModal.location && (
            <div className="space-y-3 overflow-y-auto max-h-[65vh] pr-1">
              <div className="grid gap-2">
                <Card className="bg-muted/40 border-muted-foreground/30">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Assets</p>
                      <p className="text-base font-semibold">
                        {summaryModal.counts?.total ?? summaryModal.location.assetCount ?? 0}
                      </p>
                    </div>
                    <Badge variant="outline">{summaryModal.location.assetCount ?? 0}</Badge>
                  </CardContent>
                </Card>
                {CATEGORY_KEYS.map((category) => (
                  <Card key={category} className="bg-muted/30 border-muted-foreground/20">
                    <CardContent className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{category}</p>
                        <p className="font-semibold">
                          {summaryModal.counts ? summaryModal.counts[category] : "—"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        {summaryModal.counts ? summaryModal.counts[category] : "…"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={handleViewAllAssets}
                disabled={summaryModal.loading || detailModal.loading}
              >
                <Eye className="h-4 w-4 mr-2" />
                View All Assets
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailModal.open} onOpenChange={(open) => !open && closeDetailModal()}>
        <DialogOverlay className="fixed inset-0 bg-black/70 z-[2150]" />
        <DialogContent className="max-w-6xl w-[95vw] bg-background border border-muted/50 shadow-2xl z-[2200] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Detailed Asset List</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {detailModal.location
                ? `Assets deployed in ${formatLocationLabel(detailModal.location)}`
                : "Select a marker to view assets."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-4">
            {detailModal.loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading assets…</div>
            ) : detailModal.assets.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                No assets found for {formatLocationLabel(detailModal.location)}.
              </div>
            ) : (
              <div className="space-y-6">
                {renderHardwareLikeSection("Hardware", groupedAssets.Hardware)}
                {renderSoftwareSection(groupedAssets.Software)}
                {renderHardwareLikeSection("Peripherals", groupedAssets.Peripherals)}
                {renderHardwareLikeSection("Others", groupedAssets.Others)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
