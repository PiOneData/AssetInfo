import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { DeviceSoftware } from "@/components/assets/DeviceSoftware";
import { SoftwareDevices } from "@/components/assets/SoftwareDevices";
import { AssetAnalytics } from "@/components/assets/AssetAnalytics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@/hooks/use-search";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { AssetForm } from "@/components/assets/asset-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui-custom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authenticatedRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { Laptop, Monitor, Code, Edit, Eye, Trash2, Search, Upload, Download, FileText, AlertCircle, CheckCircle, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Settings, Calendar, DollarSign, Package, MapPin, User, Hash, Building, Wrench, Mail, BadgeCheck } from "lucide-react";
import type { Asset, InsertAsset } from "@shared/schema";
import { AssetTypeEnum } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import useSyncHeartbeat from "@/hooks/useSyncHeartbeat";
import { EnrollmentLinkCard } from "@/components/EnrollmentLinkCard";

// Column visibility state
interface ColumnVisibility {
  name: boolean;
  serialNumber: boolean;
  model: boolean;
  manufacturer: boolean;
  category: boolean;
  type: boolean;
  status: boolean;
  // Hardware-specific (OpenAudit/Device Info)
  ipAddress: boolean;
  hostname: boolean;
  osName: boolean;
  osVersion: boolean;
  lastSeen: boolean;
  // Software-specific
  version: boolean;
  licenseType: boolean;
  licenseKey: boolean;
  renewalDate: boolean;
  // Location & Assignment
  location: boolean;
  assignedUserName: boolean;
  assignedUserEmail: boolean;
  assignedUserEmployeeId: boolean;
  // Purchase Info
  purchaseDate: boolean;
  warrantyExpiry: boolean;
  purchaseCost: boolean;
  actions: boolean;
}

// Enhanced Assets Table Component
interface EnhancedAssetsTableProps {
  assets: Asset[];
  isLoading: boolean;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onViewAsset: (asset: Asset) => void; 
  canEditAssets: boolean;
  canDeleteAssets: boolean;
}

function EnhancedAssetsTable({ assets, isLoading, onEditAsset, onDeleteAsset, onViewAsset, canEditAssets, canDeleteAssets }: EnhancedAssetsTableProps) {
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [, setLocation] = useLocation();

  // Function to navigate to user profile by user ID, email, or employee ID
  const navigateToUserProfile = async (email?: string, employeeId?: string, userId?: string) => {
    try {
      // If we have an employee ID (numeric User ID), use it directly
      if (employeeId) {
        setLocation(`/users/${employeeId}`);
        return;
      }

      // If we have email, look up the user to get their numeric User ID
      if (email) {
        const queryParam = `email=${encodeURIComponent(email)}`;
        const response = await authenticatedRequest('GET', `/api/users/find?${queryParam}`);
        if (response.ok) {
          const user = await response.json();
          // Use numeric User ID if available, otherwise fall back to UUID
          const userIdentifier = user.userID || user.id;
          setLocation(`/users/${userIdentifier}`);
        } else if (response.status === 404) {
          alert('User profile not found. This user may not have been created in the system yet.');
        } else {
          alert('Unable to load user profile. Please try again.');
        }
        return;
      }

      // If we only have UUID (legacy), look up the user to get their numeric ID
      if (userId) {
        const response = await authenticatedRequest('GET', `/api/users/${userId}`);
        if (response.ok) {
          const user = await response.json();
          // Use numeric User ID if available, otherwise fall back to UUID
          const userIdentifier = user.userID || user.id;
          setLocation(`/users/${userIdentifier}`);
        } else if (response.status === 404) {
          alert('User profile not found.');
        } else {
          alert('Unable to load user profile. Please try again.');
        }
        return;
      }

      console.error('No valid identifier provided for user lookup');
    } catch (error) {
      console.error('Error finding user:', error);
      alert('Unable to load user profile. Please try again.');
    }
  };
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [dateRanges, setDateRanges] = useState<Record<string, { from?: Date; to?: Date }>>({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    name: true,
    serialNumber: true,
    model: true,
    manufacturer: true,
    category: true,
    type: true,
    status: true,
    // Hardware-specific
    ipAddress: true,
    hostname: true,
    osName: true,
    osVersion: false,
    lastSeen: false,
    // Software-specific
    version: true,
  licenseType: true,
  licenseKey: false, // Hidden by default for security
  renewalDate: true,
  // Location & Assignment
  location: true,
    assignedUserName: true,
    assignedUserEmail: true,
    assignedUserEmployeeId: true,
    // Purchase Info
    purchaseDate: true,
    warrantyExpiry: true,
    purchaseCost: true,
    actions: true,
  });

  // Sort and filter assets
  const processedAssets = useMemo(() => {
    let filtered = [...assets];

    // Apply column-specific searches
    Object.entries(columnSearch).forEach(([field, searchTerm]) => {
      if (searchTerm.trim()) {
        filtered = filtered.filter((asset: any) => {
          let value = asset[field];
          
          // Handle OpenAudit specification fields
          if (field === 'ipAddress') {
            value = asset.specifications?.openaudit?.ip;
          } else if (field === 'hostname') {
            value = asset.specifications?.openaudit?.hostname;
          } else if (field === 'osName') {
            value = asset.specifications?.openaudit?.os?.name;
          } else if (field === 'osVersion') {
            value = asset.specifications?.openaudit?.os?.version;
          }
          
          if (value === null || value === undefined) return false;
          
          // Handle numeric filtering for purchase cost
          if (field === 'purchaseCost') {
            const minCost = parseFloat(searchTerm);
            if (!isNaN(minCost)) {
              const assetCost = typeof value === 'string' ? parseFloat(value) : value;
              return !isNaN(assetCost) && assetCost >= minCost;
            }
          }
          
          // Handle string matching for all other fields
          return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        });
      }
    });

    // Apply date range filters
    Object.entries(dateRanges).forEach(([field, range]) => {
      if (range.from || range.to) {
        filtered = filtered.filter((asset: any) => {
          const assetDate = asset[field] ? new Date(asset[field]) : null;
          if (!assetDate) return false;
          
          if (range.from && assetDate < range.from) return false;
          if (range.to && assetDate > range.to) return false;
          return true;
        });
      }
    });

    // Sort assets
    filtered.sort((a: any, b: any) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      let comparison = 0;
      
      // Handle numeric fields
      if (sortField === 'purchaseCost') {
        const aNum = typeof aValue === 'string' ? parseFloat(aValue) : aValue;
        const bNum = typeof bValue === 'string' ? parseFloat(bValue) : bValue;
        comparison = (isNaN(aNum) ? 0 : aNum) - (isNaN(bNum) ? 0 : bNum);
      }
      // Handle date fields
      else if (sortField === 'purchaseDate' || sortField === 'warrantyExpiry' || sortField === 'createdAt' || sortField === 'updatedAt') {
        const aDate = new Date(aValue);
        const bDate = new Date(bValue);
        comparison = aDate.getTime() - bDate.getTime();
      }
      // Handle other numeric fields like usedLicenses
      else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      }
      // Handle dates that are already Date objects
      else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      }
      // Handle strings
      else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      }
      // Fallback to string comparison
      else {
        comparison = String(aValue).localeCompare(String(bValue));
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [assets, sortField, sortDirection, columnSearch, dateRanges]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleColumnSearch = (field: string, value: string) => {
    setColumnSearch(prev => ({ ...prev, [field]: value }));
  };

  const handleDateRangeChange = (field: string, from?: Date, to?: Date) => {
    setDateRanges(prev => ({ ...prev, [field]: { from, to } }));
  };

  const getAssetIcon = (type: string, category?: string) => {
    if (type === 'Hardware') {
      switch (category?.toLowerCase()) {
        case 'laptop': return Laptop;
        case 'desktop': case 'pc': return Monitor;
        case 'server': return Building;
        case 'tablet': return Laptop;
        case 'mobile phone': case 'phone': return Laptop;
        default: return Monitor;
      }
    }
    if (type === 'Software') return Code;
    if (type === 'Peripherals') return Wrench;
    return Package;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'deployed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100';
      case 'in-stock': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-100';
      case 'in-repair': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-100';
      case 'disposed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-100';
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return ArrowUpDown;
    return sortDirection === 'asc' ? ArrowUp : ArrowDown;
  };

  const formatCurrency = (value: string | number | null) => {
    if (!value && value !== 0) return 'N/A';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(numValue) ? 'N/A' : `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A';
    try {
      return format(new Date(date), 'MMM dd, yyyy');
    } catch {
      return 'Invalid Date';
    }
  };

const visibleColumns = Object.entries(columnVisibility)
  .filter(([_, visible]) => visible)
  .map(([key]) => key);
const columnCount = visibleColumns.length;
const totalColumnCount = columnCount + 1; // include View Devices column

  // Group assets by type
  const groupedAssets = useMemo(() => {
    const hardware = processedAssets.filter((a: Asset) => a.type === 'Hardware');
    const software = processedAssets.filter((a: Asset) => a.type === 'Software');
    const peripherals = processedAssets.filter((a: Asset) => a.type === 'Peripherals');
    const others = processedAssets.filter((a: Asset) => a.type === 'Others');
    
    return { hardware, software, peripherals, others };
  }, [processedAssets]);

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">Loading assets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Column Visibility Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {processedAssets.length} of {assets.length} assets
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-column-settings">
              <Settings className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-2">
              <h4 className="font-medium">Show/Hide Columns</h4>
              {Object.entries(columnVisibility).map(([key, visible]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`column-${key}`}
                    checked={visible}
                    onCheckedChange={(checked) =>
                      setColumnVisibility(prev => ({ ...prev, [key]: !!checked }))
                    }
                    data-testid={`checkbox-column-${key}`}
                  />
                  <label htmlFor={`column-${key}`} className="text-sm capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Enhanced Assets Table */}
      <div className="bg-gradient-to-br from-surface/70 to-surface-light/70 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[rgba(20,25,45,0.8)] backdrop-blur-sm border-b border-white/[0.08]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(0,0,0,0)), rgba(20,25,45,0.8)' }}>
              <tr>
                {columnVisibility.name && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[200px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent text-text-primary hover:text-brand-primary transition-colors"
                        onClick={() => handleSort('name')}
                        data-testid="sort-name"
                      >
                        <User className="h-4 w-4 mr-1" />
                        Asset Name
                        {React.createElement(getSortIcon('name'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search names..."
                      value={columnSearch.name || ''}
                      onChange={(e) => handleColumnSearch('name', e.target.value)}
                      className="mt-1 h-7 text-xs bg-surface-light/50 border-white/10 text-text-primary placeholder:text-text-muted"
                      data-testid="search-name"
                    />
                  </th>
                )}
                
                {columnVisibility.serialNumber && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[140px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('serialNumber')}
                        data-testid="sort-serialNumber"
                      >
                        <Hash className="h-4 w-4 mr-1" />
                        Serial Number
                        {React.createElement(getSortIcon('serialNumber'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search serial..."
                      value={columnSearch.serialNumber || ''}
                      onChange={(e) => handleColumnSearch('serialNumber', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-serialNumber"
                    />
                  </th>
                )}

                {columnVisibility.model && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('model')}
                        data-testid="sort-model"
                      >
                        <Package className="h-4 w-4 mr-1" />
                        Model
                        {React.createElement(getSortIcon('model'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search model..."
                      value={columnSearch.model || ''}
                      onChange={(e) => handleColumnSearch('model', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-model"
                    />
                  </th>
                )}

                {columnVisibility.manufacturer && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[130px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('manufacturer')}
                        data-testid="sort-manufacturer"
                      >
                        <Building className="h-4 w-4 mr-1" />
                        Manufacturer
                        {React.createElement(getSortIcon('manufacturer'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search manufacturer..."
                      value={columnSearch.manufacturer || ''}
                      onChange={(e) => handleColumnSearch('manufacturer', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-manufacturer"
                    />
                  </th>
                )}

                {columnVisibility.category && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[100px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('category')}
                        data-testid="sort-category"
                      >
                        <Package className="h-4 w-4 mr-1" />
                        Category
                        {React.createElement(getSortIcon('category'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search category..."
                      value={columnSearch.category || ''}
                      onChange={(e) => handleColumnSearch('category', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-category"
                    />
                  </th>
                )}

                {columnVisibility.type && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[100px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('type')}
                        data-testid="sort-type"
                      >
                        <Package className="h-4 w-4 mr-1" />
                        Type
                        {React.createElement(getSortIcon('type'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Select value={columnSearch.type || 'all'} onValueChange={(value) => handleColumnSearch('type', value === 'all' ? '' : value)}>
                      <SelectTrigger className="mt-1 h-7 text-xs" data-testid="filter-type">
                        <SelectValue placeholder="Filter type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Hardware">Hardware</SelectItem>
                        <SelectItem value="Software">Software</SelectItem>
                        <SelectItem value="Peripherals">Peripherals</SelectItem>
                        <SelectItem value="Others">Others</SelectItem>
                      </SelectContent>
                    </Select>
                  </th>
                )}

                {columnVisibility.status && (
                  <th className="text-left py-3 px-4 font-medium text-[#E5E7EB] text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium font-[500] hover:bg-transparent"
                        onClick={() => handleSort('status')}
                        data-testid="sort-status"
                      >
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Status
                        {React.createElement(getSortIcon('status'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Select value={columnSearch.status || 'all'} onValueChange={(value) => handleColumnSearch('status', value === 'all' ? '' : value)}>
                      <SelectTrigger className="mt-1 h-7 text-xs" data-testid="filter-status">
                        <SelectValue placeholder="Filter status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="deployed">Deployed</SelectItem>
                        <SelectItem value="in-stock">In Stock</SelectItem>
                        <SelectItem value="in-repair">In Repair</SelectItem>
                        <SelectItem value="disposed">Disposed</SelectItem>
                      </SelectContent>
                    </Select>
                  </th>
                )}

                {/* Software-specific columns - only show if there are Software assets */}
                {columnVisibility.version && processedAssets.some((a: any) => a.type === "Software") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[100px]">
                    <div className="flex items-center space-x-2">
                      <Code className="h-4 w-4 mr-1" />
                      <span>Version</span>
                    </div>
                    <Input
                      placeholder="Search version..."
                      value={columnSearch.version || ''}
                      onChange={(e) => handleColumnSearch('version', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-version"
                    />
                  </th>
                )}

                {columnVisibility.licenseType && processedAssets.some((a: any) => a.type === "Software") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Code className="h-4 w-4 mr-1" />
                      <span>License Type</span>
                    </div>
                    <Input
                      placeholder="Search license..."
                      value={columnSearch.licenseType || ''}
                      onChange={(e) => handleColumnSearch('licenseType', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-licenseType"
                    />
                  </th>
                )}

                {columnVisibility.licenseKey && processedAssets.some((a: any) => a.type === "Software") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[150px]">
                    <div className="flex items-center space-x-2">
                      <Code className="h-4 w-4 mr-1" />
                      <span>License Key</span>
                    </div>
                    <Input
                      placeholder="Search key..."
                      value={columnSearch.licenseKey || ''}
                      onChange={(e) => handleColumnSearch('licenseKey', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-licenseKey"
                    />
                  </th>
                )}

                {columnVisibility.renewalDate && processedAssets.some((a: any) => a.type === "Software") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>Renewal Date</span>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="mt-1 h-7 text-xs justify-start" data-testid="filter-renewalDate">
                          <Calendar className="h-3 w-3 mr-1" />
                          Date Range
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="range"
                          selected={{
                            from: dateRanges.renewalDate?.from,
                            to: dateRanges.renewalDate?.to,
                          }}
                          onSelect={(range) => 
                            handleDateRangeChange('renewalDate', range?.from, range?.to)
                          }
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </th>
                )}

                {columnVisibility.viewDevices && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                    View Devices
                  </th>
                )}

                {/* Hardware-specific columns - only show if there are Hardware assets */}
                {columnVisibility.ipAddress && processedAssets.some((a: any) => a.type === "Hardware") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[130px]">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 mr-1" />
                      <span>IP Address</span>
                    </div>
                    <Input
                      placeholder="Search IP..."
                      value={columnSearch.ipAddress || ''}
                      onChange={(e) => handleColumnSearch('ipAddress', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-ipAddress"
                    />
                  </th>
                )}

                {columnVisibility.hostname && processedAssets.some((a: any) => a.type === "Hardware") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[150px]">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 mr-1" />
                      <span>Hostname</span>
                    </div>
                    <Input
                      placeholder="Search hostname..."
                      value={columnSearch.hostname || ''}
                      onChange={(e) => handleColumnSearch('hostname', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-hostname"
                    />
                  </th>
                )}

                {columnVisibility.osName && processedAssets.some((a: any) => a.type === "Hardware") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 mr-1" />
                      <span>OS</span>
                    </div>
                    <Input
                      placeholder="Search OS..."
                      value={columnSearch.osName || ''}
                      onChange={(e) => handleColumnSearch('osName', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-osName"
                    />
                  </th>
                )}

                {columnVisibility.osVersion && processedAssets.some((a: any) => a.type === "Hardware") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[100px]">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4 mr-1" />
                      <span>OS Version</span>
                    </div>
                    <Input
                      placeholder="Search version..."
                      value={columnSearch.osVersion || ''}
                      onChange={(e) => handleColumnSearch('osVersion', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-osVersion"
                    />
                  </th>
                )}

                {columnVisibility.lastSeen && processedAssets.some((a: any) => a.type === "Hardware") && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[150px]">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>Last Seen</span>
                    </div>
                  </th>
                )}

                {columnVisibility.location && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('location')}
                        data-testid="sort-location"
                      >
                        <MapPin className="h-4 w-4 mr-1" />
                        Location
                        {React.createElement(getSortIcon('location'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search location..."
                      value={columnSearch.location || ''}
                      onChange={(e) => handleColumnSearch('location', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-location"
                    />
                  </th>
                )}

                {columnVisibility.assignedUserName && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('assignedUserName')}
                        data-testid="sort-assignedUserName"
                      >
                        <User className="h-4 w-4 mr-1" />
                        Assigned To
                        {React.createElement(getSortIcon('assignedUserName'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search assigned..."
                      value={columnSearch.assignedUserName || ''}
                      onChange={(e) => handleColumnSearch('assignedUserName', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-assignedUserName"
                    />
                  </th>
                )}

                {columnVisibility.assignedUserEmail && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[180px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('assignedUserEmail')}
                        data-testid="sort-assignedUserEmail"
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Email ID
                        {React.createElement(getSortIcon('assignedUserEmail'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search email..."
                      value={columnSearch.assignedUserEmail || ''}
                      onChange={(e) => handleColumnSearch('assignedUserEmail', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-assignedUserEmail"
                    />
                  </th>
                )}

                {columnVisibility.assignedUserEmployeeId && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('assignedUserEmployeeId')}
                        data-testid="sort-assignedUserEmployeeId"
                      >
                        <BadgeCheck className="h-4 w-4 mr-1" />
                        Employee ID
                        {React.createElement(getSortIcon('assignedUserEmployeeId'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Search ID..."
                      value={columnSearch.assignedUserEmployeeId || ''}
                      onChange={(e) => handleColumnSearch('assignedUserEmployeeId', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-assignedUserEmployeeId"
                    />
                  </th>
                )}

                {columnVisibility.purchaseDate && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('purchaseDate')}
                        data-testid="sort-purchaseDate"
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Purchase Date
                        {React.createElement(getSortIcon('purchaseDate'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="mt-1 h-7 text-xs justify-start" data-testid="filter-purchaseDate">
                          <Calendar className="h-3 w-3 mr-1" />
                          Date Range
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="range"
                          selected={{
                            from: dateRanges.purchaseDate?.from,
                            to: dateRanges.purchaseDate?.to,
                          }}
                          onSelect={(range) => 
                            handleDateRangeChange('purchaseDate', range?.from, range?.to)
                          }
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </th>
                )}

                {columnVisibility.warrantyExpiry && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('warrantyExpiry')}
                        data-testid="sort-warrantyExpiry"
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Warranty Expiry
                        {React.createElement(getSortIcon('warrantyExpiry'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="mt-1 h-7 text-xs justify-start" data-testid="filter-warrantyExpiry">
                          <Calendar className="h-3 w-3 mr-1" />
                          Date Range
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="range"
                          selected={{
                            from: dateRanges.warrantyExpiry?.from,
                            to: dateRanges.warrantyExpiry?.to,
                          }}
                          onSelect={(range) => 
                            handleDateRangeChange('warrantyExpiry', range?.from, range?.to)
                          }
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </th>
                )}

                {columnVisibility.purchaseCost && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[120px]">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium hover:bg-transparent"
                        onClick={() => handleSort('purchaseCost')}
                        data-testid="sort-purchaseCost"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Purchase Cost
                        {React.createElement(getSortIcon('purchaseCost'), { className: "h-3 w-3 ml-1" })}
                      </Button>
                    </div>
                    <Input
                      placeholder="Min cost..."
                      type="number"
                      value={columnSearch.purchaseCost || ''}
                      onChange={(e) => handleColumnSearch('purchaseCost', e.target.value)}
                      className="mt-1 h-7 text-xs"
                      data-testid="search-purchaseCost"
                    />
                  </th>
                )}

                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm min-w-[140px]">
                  <div className="flex items-center space-x-2">
                    <Monitor className="h-4 w-4 mr-1" />
                    View Devices
                  </div>
                </th>

                {columnVisibility.actions && (
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm w-24">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {processedAssets.map((asset: Asset) => {
                const Icon = getAssetIcon(asset.type, asset.category || undefined);
                
                return (
                  <tr 
                    key={asset.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-primary/5 transition-all duration-150 ease-out group"
                    data-testid={`asset-row-${asset.id}`}
                  >
                    {columnVisibility.name && (
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-surface-lighter rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-primary group-hover:shadow-glow transition-all duration-300">
                            <Icon className="text-text-secondary group-hover:text-white h-4 w-4 transition-colors duration-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => onViewAsset(asset)}
                              className="font-medium text-foreground truncate text-left hover:underline"
                              title={asset.name}
                              data-testid={`button-view-${asset.id}`}
                            >
                              {asset.name}
                            </button>
                          </div>
                        </div>
                      </td>
                    )}
                    
                    {columnVisibility.serialNumber && (
                      <td className="py-3 px-4">
                        <span className="text-foreground font-mono text-sm" data-testid={`text-serial-${asset.id}`}>
                          {asset.serialNumber || "N/A"}
                        </span>
                      </td>
                    )}

                    {columnVisibility.model && (
                      <td className="py-3 px-4">
                        <span className="text-foreground" data-testid={`text-model-${asset.id}`}>
                          {asset.model || "N/A"}
                        </span>
                      </td>
                    )}

                    {columnVisibility.manufacturer && (
                      <td className="py-3 px-4">
                        <span className="text-foreground" data-testid={`text-manufacturer-${asset.id}`}>
                          {asset.manufacturer || "N/A"}
                        </span>
                      </td>
                    )}

                    {columnVisibility.category && (
                      <td className="py-3 px-4">
                        <span className="text-foreground capitalize" data-testid={`text-category-${asset.id}`}>
                          {asset.category || "N/A"}
                        </span>
                      </td>
                    )}

                    {columnVisibility.type && (
                      <td className="py-3 px-4">
                        <span className="text-foreground" data-testid={`text-type-${asset.id}`}>
                          {asset.type}
                        </span>
                      </td>
                    )}

                    {columnVisibility.status && (
                      <td className="py-3 px-4">
                        <StatusBadge 
                          variant={
                            asset.status === 'deployed' ? 'success' : 
                            asset.status === 'in-stock' ? 'info' :
                            asset.status === 'in-repair' ? 'warning' :
                            asset.status === 'disposed' ? 'danger' : 'default'
                          }
                          glow
                          data-testid={`badge-status-${asset.id}`}
                        >
                          {asset.status.replace('-', ' ')}
                        </StatusBadge>
                      </td>
                    )}

                    {/* Software-specific columns - show for all rows but only populate for Software */}
                    {columnVisibility.version && processedAssets.some((a: any) => a.type === "Software") && (
                      <td className="py-3 px-4">
                        {asset.type === "Software" ? (
                          <span className="text-foreground text-sm" data-testid={`text-version-${asset.id}`}>
                            {asset.version || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.licenseType && processedAssets.some((a: any) => a.type === "Software") && (
                      <td className="py-3 px-4">
                        {asset.type === "Software" ? (
                          <span className="text-foreground capitalize" data-testid={`text-license-type-${asset.id}`}>
                            {asset.licenseType || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.licenseKey && processedAssets.some((a: any) => a.type === "Software") && (
                      <td className="py-3 px-4">
                        {asset.type === "Software" ? (
                          <span className="text-foreground font-mono text-xs" data-testid={`text-license-key-${asset.id}`}>
                            {asset.licenseKey ? "••••••••" : "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.renewalDate && processedAssets.some((a: any) => a.type === "Software") && (
                      <td className="py-3 px-4">
                        {asset.type === "Software" ? (
                          <span className="text-foreground text-sm" data-testid={`text-renewal-${asset.id}`}>
                            {formatDate(asset.renewalDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {/* Hardware-specific columns - show for all rows but only populate for Hardware */}
                    {columnVisibility.ipAddress && processedAssets.some((a: any) => a.type === "Hardware") && (
                      <td className="py-3 px-4">
                        {asset.type === "Hardware" ? (
                          <span className="text-foreground font-mono text-sm" data-testid={`text-ip-${asset.id}`}>
                            {(asset.specifications as any)?.openaudit?.ip || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.hostname && processedAssets.some((a: any) => a.type === "Hardware") && (
                      <td className="py-3 px-4">
                        {asset.type === "Hardware" ? (
                          <span className="text-foreground font-medium" data-testid={`text-hostname-${asset.id}`}>
                            {(asset.specifications as any)?.openaudit?.hostname || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.osName && processedAssets.some((a: any) => a.type === "Hardware") && (
                      <td className="py-3 px-4">
                        {asset.type === "Hardware" ? (
                          <span className="text-foreground" data-testid={`text-os-${asset.id}`}>
                            {(asset.specifications as any)?.openaudit?.os?.name || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.osVersion && processedAssets.some((a: any) => a.type === "Hardware") && (
                      <td className="py-3 px-4">
                        {asset.type === "Hardware" ? (
                          <span className="text-foreground text-sm" data-testid={`text-os-version-${asset.id}`}>
                            {(asset.specifications as any)?.openaudit?.os?.version || "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.lastSeen && processedAssets.some((a: any) => a.type === "Hardware") && (
                      <td className="py-3 px-4">
                        {asset.type === "Hardware" ? (
                          <span className="text-foreground text-sm" data-testid={`text-last-seen-${asset.id}`}>
                            {(asset.specifications as any)?.openaudit?.lastSeen 
                              ? new Date((asset.specifications as any).openaudit.lastSeen).toLocaleString()
                              : "N/A"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                    )}

                    {columnVisibility.location && (
                      <td className="py-3 px-4">
                        <span className="text-foreground" data-testid={`text-location-${asset.id}`}>
                          {asset.city && asset.state && asset.country ? 
                            `${asset.city}, ${asset.state}, ${asset.country}` : 
                            asset.location || "N/A"}
                        </span>
                      </td>
                    )}

                    {columnVisibility.assignedUserName && (
                      <td className="py-3 px-4">
                        {asset.assignedUserName ? (
                          <span 
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer underline" 
                            data-testid={`link-assigned-${asset.id}`}
                            onClick={() => navigateToUserProfile(asset.assignedUserEmail || undefined, asset.assignedUserEmployeeId || undefined, asset.assignedUserId || undefined)}
                          >
                            {asset.assignedUserName}
                          </span>
                        ) : (
                          <span className="text-foreground" data-testid={`text-assigned-${asset.id}`}>
                            Unassigned
                          </span>
                        )}
                      </td>
                    )}

                    {columnVisibility.assignedUserEmail && (
                      <td className="py-3 px-4">
                        {asset.assignedUserEmail ? (
                          <span 
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer underline" 
                            data-testid={`link-email-${asset.id}`}
                            onClick={() => navigateToUserProfile(asset.assignedUserEmail || undefined, asset.assignedUserEmployeeId || undefined, asset.assignedUserId || undefined)}
                          >
                            {asset.assignedUserEmail}
                          </span>
                        ) : (
                          <span className="text-foreground" data-testid={`text-email-${asset.id}`}>
                            N/A
                          </span>
                        )}
                      </td>
                    )}

                    {columnVisibility.assignedUserEmployeeId && (
                      <td className="py-3 px-4">
                        {asset.assignedUserEmployeeId ? (
                          <span 
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer underline font-mono text-sm" 
                            data-testid={`link-employee-id-${asset.id}`}
                            onClick={() => navigateToUserProfile(asset.assignedUserEmail || undefined, asset.assignedUserEmployeeId || undefined, asset.assignedUserId || undefined)}
                          >
                            {asset.assignedUserEmployeeId}
                          </span>
                        ) : (
                          <span className="text-foreground font-mono text-sm" data-testid={`text-employee-id-${asset.id}`}>
                            N/A
                          </span>
                        )}
                      </td>
                    )}

                    {columnVisibility.purchaseDate && (
                      <td className="py-3 px-4">
                        <span className="text-foreground text-sm" data-testid={`text-purchase-date-${asset.id}`}>
                          {formatDate(asset.purchaseDate)}
                        </span>
                      </td>
                    )}

                    {columnVisibility.warrantyExpiry && (
                      <td className="py-3 px-4">
                        <span 
                          className={`text-sm ${
                            asset.warrantyExpiry && new Date(asset.warrantyExpiry) < new Date() 
                              ? 'text-red-600' 
                              : 'text-foreground'
                          }`}
                          data-testid={`text-warranty-${asset.id}`}
                        >
                          {formatDate(asset.warrantyExpiry)}
                        </span>
                      </td>
                    )}

                    {columnVisibility.purchaseCost && (
                      <td className="py-3 px-4">
                        <span className="text-foreground font-medium" data-testid={`text-cost-${asset.id}`}>
                          {formatCurrency(asset.purchaseCost)}
                        </span>
                      </td>
                    )}

                    <td className="py-3 px-4 text-center">
                      {asset.type === "Software" ? (
                        <div className="flex justify-center">
                          <SoftwareDevices softwareId={asset.id} softwareName={asset.name} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>

                    {columnVisibility.actions && (
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewAsset(asset)}
                            data-testid={`button-view-action-${asset.id}`}
                            title="View details"
                          >
                            <Eye className="h-4 w-4 action-icon" />
                          </Button>
                          {canEditAssets && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEditAsset(asset)}
                              data-testid={`button-edit-${asset.id}`}
                            >
                              <Edit className="h-4 w-4 action-icon" />
                            </Button>
                          )}
                          {canDeleteAssets && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDeleteAsset(asset.id)}
                              data-testid={`button-delete-${asset.id}`}
                            >
                              <Trash2 className="h-4 w-4 action-icon text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              
              {processedAssets.length === 0 && (
                <tr>
                  <td colSpan={totalColumnCount} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center space-y-2">
                      <Monitor className="h-12 w-12 text-muted-foreground/50" />
                      <p>No assets found</p>
                      <p className="text-sm">
                        Try adjusting your search filters or column filters
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Assets() {
  useSyncHeartbeat();      // auto-refresh asset table when backend syncs

  const search = useSearch();
  const [location, setLocation] = useLocation();
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  // Detect if we're in "new" mode and auto-open the form
  useEffect(() => {
    if (location === '/assets/new') {
      if (permissions.canManageAssets) {
        setIsAssetFormOpen(true);
      } else {
        toast({
          title: "Insufficient permissions",
          description: "You can view assets but cannot create or edit them.",
          variant: "destructive",
        });
        setLocation('/assets');
      }
    }
  }, [location, permissions.canManageAssets, setLocation, toast]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const ensurePermission = (can: boolean, description: string) => {
    if (can) return true;
    toast({
      title: "Insufficient permissions",
      description,
      variant: "destructive",
    });
    return false;
  };

  useEffect(() => {
    if (!permissions.canManageAssets) {
      setIsAssetFormOpen(false);
      setEditingAsset(undefined);
    }
    if (!permissions.canBulkUploadAssets) {
      setIsBulkUploadOpen(false);
    }
  }, [permissions.canManageAssets, permissions.canBulkUploadAssets]);


  // Initialize filters based on URL parameters
  // Main /assets route shows ALL assets, only subsection routes filter by type
  useEffect(() => {
    const urlParams = new URLSearchParams(search);
    const typeParam = urlParams.get('type');
    const categoryParam = urlParams.get('category');
    
    // Only apply type filtering if a valid type parameter is explicitly provided
    // This ensures /assets shows all items, while /assets?type=Hardware filters to hardware
    if (typeParam && AssetTypeEnum.safeParse(typeParam).success) {
      setTypeFilter(typeParam);
    } else {
      // Default to showing all assets (no type filtering)
      setTypeFilter("all");
    }
    
    // Only apply category filtering if a category parameter is explicitly provided
    if (categoryParam && categoryParam.trim()) {
      setCategoryFilter(categoryParam);
    } else {
      // Default to showing all categories
      setCategoryFilter("all");
    }
  }, [search]);

  // Fetch assets
  // Debounce search term to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["/api/assets", typeFilter, statusFilter, categoryFilter],
    queryFn: async () => {
      console.log('[Assets.tsx] Fetching assets with filters:', { typeFilter, statusFilter, categoryFilter });
      
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      
      const url = `/api/assets?${params}`;
      console.log('[Assets.tsx] Fetching from:', url);
      
      const response = await authenticatedRequest("GET", url);
      const data = await response.json();
      
      console.log('[Assets.tsx] Assets received:', {
        count: data.length,
        tenantIdHeader: response.headers.get('X-Tenant-Id'),
        sampleAssets: data.slice(0, 3).map((a: any) => ({ name: a.name, id: a.id, tenantId: a.tenantId }))
      });
      
      return data;
    },
  });

  // Log assets whenever they change
  useEffect(() => {
    console.log('[Assets.tsx] Assets state updated:', {
      count: assets.length,
      isLoading,
      assets: assets.slice(0, 3).map(a => ({ name: a.name, id: a.id }))
    });
  }, [assets, isLoading]);

  // Get dynamic page title based on filter
  const getPageTitle = () => {
    const urlParams = new URLSearchParams(search);
    const categoryParam = urlParams.get('category');
    
    if (categoryParam) {
      // Create title from category (e.g., "pc" -> "PC Assets")
      const categoryName = categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1).replace('-', ' ');
      return `${categoryName} Assets`;
    }
    
    switch (typeFilter) {
      case 'Hardware': return 'Hardware Assets';
      case 'Software': return 'Software Assets'; 
      case 'Peripherals': return 'Peripheral Assets';
      case 'Others': return 'Other Assets';
      default: return 'Assets';
    }
  };

  const getPageDescription = () => {
    const urlParams = new URLSearchParams(search);
    const categoryParam = urlParams.get('category');
    
    if (categoryParam) {
      const categoryDescriptions: Record<string, string> = {
        'pc': 'Manage desktop computers and workstations',
        'laptop': 'Manage portable computers and notebooks',
        'server': 'Manage server hardware and infrastructure',
        'rack': 'Manage server racks and data center equipment',
        'mobile': 'Manage mobile phones and cellular devices',
        'tablet': 'Manage tablets and portable touch devices',
        'printer': 'Manage printing devices and equipment',
        '3d-printer': 'Manage 3D printing equipment',
        'scanner': 'Manage scanning devices and equipment',
        'mouse': 'Manage computer mice and pointing devices',
        'router': 'Manage network routing equipment',
        'switch': 'Manage network switching equipment',
        'hub': 'Manage network hub equipment',
        'cctv': 'Manage CCTV cameras and surveillance equipment',
        'access-control': 'Manage access control hardware and systems'
      };
      return categoryDescriptions[categoryParam] || 'Manage specific asset category';
    }
    
    switch (typeFilter) {
      case 'Hardware': return 'Manage hardware assets like laptops, desktops, and servers';
      case 'Software': return 'Manage software licenses and applications';
      case 'Peripherals': return 'Manage peripheral devices like printers and accessories';
      case 'Others': return 'Manage other miscellaneous assets';
      default: return 'Manage your IT assets and equipment';
    }
  };

  // Handle view and selectedId URL parameters to auto-open device details drawer
  useEffect(() => {
    const urlParams = new URLSearchParams(search);
    const viewId = urlParams.get('view');
    const selectedId = urlParams.get('selectedId');
    
    // Support both 'view' and 'selectedId' parameters
    const assetId = viewId || selectedId;
    
    if (assetId && assets && assets.length > 0) {
      // Find the asset with this ID
      const assetToView = assets.find((a: Asset) => a.id === assetId);
      if (assetToView) {
        setViewingAsset(assetToView);
        setIsViewDrawerOpen(true);
      }
    }
  }, [search, assets]);

  // Create asset mutation
  const createAssetMutation = useMutation({
    mutationFn: async (assetData: InsertAsset) => {
      console.log("Creating asset with data:", assetData);
      try {
        const response = await authenticatedRequest("POST", "/api/assets", assetData);
        console.log("Create asset response status:", response.status);
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error("API Error Response:", errorData);
          throw new Error(`API Error ${response.status}: ${errorData}`);
        }
        
        const result = await response.json();
        console.log("Create asset response data:", result);
        return result;
      } catch (error) {
        console.error("Request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Asset creation successful:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      setIsAssetFormOpen(false);
      setEditingAsset(undefined);
      toast({
        title: "Asset created",
        description: "The asset has been created successfully.",
      });
    },
    onError: (error) => {
      console.error("Asset creation failed:", error);
      let errorMessage = "Failed to create asset. Please try again.";
      
      if (error.message.includes("Authentication expired") || error.message.includes("No authentication token")) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.message.includes("400")) {
        errorMessage = "Please check all required fields are filled correctly.";
      } else if (error.message.includes("401")) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (error.message.includes("422")) {
        errorMessage = "Invalid data provided. Please check your inputs.";
      } else if (error.message.includes("500")) {
        errorMessage = "Server error. Please try again later.";
      }
      
      toast({
        title: "Asset Creation Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // If it's an auth error, close the form to prevent confusion
      if (error.message.includes("401") || error.message.includes("Authentication")) {
        setIsAssetFormOpen(false);
        setEditingAsset(undefined);
      }
    },
  });

  // Update asset mutation
  const updateAssetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAsset> }) => {
      const response = await authenticatedRequest("PUT", `/api/assets/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      setIsAssetFormOpen(false);
      setEditingAsset(undefined);
      toast({
        title: "Asset updated",
        description: "The asset has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update asset. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      await authenticatedRequest("DELETE", `/api/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Asset deleted",
        description: "The asset has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete asset. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddAsset = () => {
    if (!ensurePermission(permissions.canManageAssets, "You can view assets but cannot create or edit them.")) {
      return;
    }
    setEditingAsset(undefined);
    setIsAssetFormOpen(true);
  };

  const handleEditAsset = (asset: Asset) => {
    if (!ensurePermission(permissions.canManageAssets, "You can view assets but cannot create or edit them.")) {
      return;
    }
    setEditingAsset(asset);
    setIsAssetFormOpen(true);
  };

  // Opens the drawer to view asset details
  const handleViewAsset = (asset: Asset) => {
    setViewingAsset(asset);
    setIsViewDrawerOpen(true);
  };


  const handleAssetSubmit = (assetData: Omit<InsertAsset, 'tenantId'> | InsertAsset) => {
    if (!ensurePermission(permissions.canManageAssets, "You do not have permission to save asset changes.")) {
      setIsAssetFormOpen(false);
      return;
    }
    console.log("handleAssetSubmit called with:", assetData);
    console.log("editingAsset:", editingAsset);
    if (editingAsset) {
      console.log("Updating existing asset");
      updateAssetMutation.mutate({ id: editingAsset.id, data: assetData as InsertAsset });
    } else {
      console.log("Creating new asset");
      createAssetMutation.mutate(assetData as InsertAsset);
    }
  };

  const handleDeleteAsset = (id: string) => {
    if (!ensurePermission(permissions.canDeleteAssets, "Only administrators can delete assets.")) {
      return;
    }
    if (confirm("Are you sure you want to delete this asset?")) {
      deleteAssetMutation.mutate(id);
    }
  };

  // Handle search functionality - triggers immediate search and focuses input
  const handleSearch = () => {
    // If there's a search term, immediately trigger the search by updating debounced term
    if (searchTerm.trim()) {
      setDebouncedSearchTerm(searchTerm.trim());
    }
    searchInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Prevent form submission and immediately trigger search
      e.preventDefault();
      handleSearch();
    }
  };

  // Clear search - immediately clear both terms for instant UX
  const handleClearSearch = () => {
    setSearchTerm("");
    setDebouncedSearchTerm(""); // Immediately clear search results
    searchInputRef.current?.focus();
  };

  // Bulk upload functions
  const handleBulkUpload = () => {
    if (!ensurePermission(permissions.canBulkUploadAssets, "Bulk upload is available only for asset managers.")) {
      return;
    }
    setIsBulkUploadOpen(true);
    setUploadFile(null);
    setUploadResults(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast({
          title: "Invalid file type",
          description: "Please select a CSV file.",
          variant: "destructive",
        });
        return;
      }
      setUploadFile(file);
      setUploadResults(null);
    }
  };

  const validateFile = async () => {
    if (!uploadFile) return;

    setIsValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await authenticatedRequest(
        "POST", 
        "/api/assets/bulk/upload?validateOnly=true", 
        formData
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Validation failed" }));
        throw new Error(errorData.message || "Validation failed");
      }

      const results = await response.json();
      setUploadResults(results);
    } catch (error) {
      toast({
        title: "Validation failed",
        description: error instanceof Error ? error.message : "Failed to validate the CSV file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const importAssets = async (mode: 'partial' | 'atomic' = 'partial') => {
    if (!uploadFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await authenticatedRequest(
        "POST", 
        `/api/assets/bulk/upload?mode=${mode}`, 
        formData
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Import failed" }));
        throw new Error(errorData.message || "Import failed");
      }

      const results = await response.json();
      
      if (results.summary.inserted > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
        
        toast({
          title: "Import successful",
          description: `Successfully imported ${results.summary.inserted} assets.`,
        });
        
        setIsBulkUploadOpen(false);
        setUploadFile(null);
        setUploadResults(null);
      } else {
        setUploadResults(results);
        toast({
          title: "No assets imported",
          description: results.message || "No valid assets found to import.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await authenticatedRequest("GET", "/api/assets/bulk/template");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Download failed" }));
        throw new Error(errorData.message || "Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'asset_template_with_samples.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getAssetIcon = (type: string, category?: string) => {
    if (type === "software") return Code;
    if (category === "laptop") return Laptop;
    return Monitor;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "deployed":
        return "status-deployed";
      case "in-stock":
        return "status-in-stock";
      case "in-repair":
        return "status-in-repair";
      case "disposed":
        return "status-disposed";
      default:
        return "status-in-stock";
    }
  };

  // Apply client-side search filter across all columns
  const filteredAssets = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return assets;
    }

    const searchTerm = debouncedSearchTerm.toLowerCase();
    return assets.filter((asset: Asset) => {
      // Extract OpenAudit data from specifications
      const specs = (asset.specifications as any)?.openaudit;
      
      // Search across all visible columns in the table
      const searchableFields = [
        asset.name,
        asset.serialNumber,
        asset.manufacturer,
        asset.model,
        asset.type,
        asset.status,
        asset.category,
        // OpenAudit fields
        specs?.ip,
        specs?.hostname,
        specs?.os?.name,
        specs?.os?.version,
        // Other fields
        asset.vendorName,
        asset.vendorEmail,
        asset.vendorPhone,
        asset.companyName,
        asset.companyGstNumber,
        asset.location,
        asset.assignedUserName,
        asset.assignedUserEmail,
        asset.assignedUserEmployeeId,
        asset.purchaseCost?.toString()
      ];

      // Check if any field contains the search term
      return searchableFields.some(field => 
        field && field.toLowerCase().includes(searchTerm)
      );
    });
  }, [assets, debouncedSearchTerm]);

  if (isLoading) {
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
          title={getPageTitle()}
          description={getPageDescription()}
          onAddClick={permissions.canManageAssets ? handleAddAsset : undefined}
          showAddButton={permissions.canManageAssets}
          addButtonText="Add Asset"
          onBulkUploadClick={permissions.canBulkUploadAssets ? handleBulkUpload : undefined}
        />
        
        <div className="p-6">
          {/* Enrollment Card - Add Devices */}
          {permissions.canViewEnrollmentLink && (
            <div className="mb-6">
              <EnrollmentLinkCard />
            </div>
          )}

          {/* Asset Analytics Dashboard */}
          <AssetAnalytics assets={filteredAssets} />

          {/* Active Search Indicator */}
          {debouncedSearchTerm && (
            <div className="mb-4">
              <div className="inline-flex items-center bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                <span>Searching for: "{debouncedSearchTerm}"</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="ml-2 text-primary hover:text-primary/80 focus:outline-none"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          
          {/* Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1 max-w-md">
                <button
                  type="button"
                  onClick={handleSearch}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
                  data-testid="button-search"
                  title="Search assets"
                  aria-label="Search assets"
                >
                  <Search className="h-4 w-4" />
                </button>
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search assets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10"
                  data-testid="input-search-assets"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-1 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
                    data-testid="button-clear-search"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40" data-testid="select-type-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Hardware">Hardware</SelectItem>
                  <SelectItem value="Software">Software</SelectItem>
                  <SelectItem value="Peripherals">Peripherals</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in-stock">In Stock</SelectItem>
                  <SelectItem value="deployed">Deployed</SelectItem>
                  <SelectItem value="in-repair">In Repair</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Enhanced Assets Table */}
          <EnhancedAssetsTable
            assets={filteredAssets}
            isLoading={isLoading}
            onEditAsset={handleEditAsset}
            onDeleteAsset={handleDeleteAsset}
            onViewAsset={handleViewAsset}
            canEditAssets={permissions.canManageAssets}
            canDeleteAssets={permissions.canDeleteAssets}
          />
        </div>
      </main>

      <Drawer open={isViewDrawerOpen} onOpenChange={setIsViewDrawerOpen}>
        <DrawerContent className="max-w-3xl mx-auto">
          <DrawerHeader>
            <DrawerTitle>
              {viewingAsset?.name ?? "Asset"}
            </DrawerTitle>
            <DrawerDescription>
              {viewingAsset?.type} {viewingAsset?.category ? `• ${viewingAsset.category}` : ""}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-6 pb-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                {viewingAsset?.type === "Hardware" && (
                  <TabsTrigger value="software">Software</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Serial Number</div>
                    <div className="font-medium">{viewingAsset?.serialNumber || "N/A"}</div>
                  </div>
                <div>
                  <div className="text-muted-foreground">Model</div>
                  <div className="font-medium">{viewingAsset?.model || "N/A"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Manufacturer</div>
                  <div className="font-medium">{viewingAsset?.manufacturer || "N/A"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-medium">{viewingAsset?.status || "N/A"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Location</div>
                  <div className="font-medium">
                    {viewingAsset?.city && viewingAsset?.state && viewingAsset?.country
                      ? `${viewingAsset.city}, ${viewingAsset.state}, ${viewingAsset.country}`
                      : (viewingAsset?.location || "N/A")}
                  </div>
                </div>
              </div>
            </TabsContent>

            {viewingAsset?.type === "Hardware" && (
              <TabsContent value="software" className="mt-4">
                {viewingAsset ? (
                  <DeviceSoftware
                    assetId={viewingAsset.id}
                    tenantId={(viewingAsset as any).tenantId}
                    canAssignSoftware={permissions.isAdmin || permissions.isSuperAdmin || permissions.isItManager}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">No asset selected.</div>
                )}
              </TabsContent>
            )}
          </Tabs>

          <div className="mt-6 flex justify-end">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
      
      {permissions.canManageAssets && (
        <AssetForm
          isOpen={isAssetFormOpen}
          onClose={() => {
            setIsAssetFormOpen(false);
            setEditingAsset(undefined);
          }}
          onSubmit={handleAssetSubmit}
          asset={editingAsset}
          isLoading={createAssetMutation.isPending || updateAssetMutation.isPending}
        />
      )}

      {/* Bulk Upload Modal */}
      {permissions.canBulkUploadAssets && (
      <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Assets</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="download" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="download">Download Template</TabsTrigger>
              <TabsTrigger value="upload">Upload CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="download" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Step 1: Download Template</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download a comprehensive CSV template with sample data showing all asset types (hardware, software, peripherals) and statuses.
                  </p>
                  
                  <Button 
                    variant="outline" 
                    onClick={downloadTemplate}
                    data-testid="button-download-template"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Template with Samples
                  </Button>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Step 2: Customize Your Data</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Template includes sample data for:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• <strong>Hardware:</strong> Laptops, desktops with deployed/in-stock status</li>
                      <li>• <strong>Software:</strong> Applications with subscription/perpetual licenses</li>
                      <li>• <strong>Peripherals:</strong> Printers, accessories with all statuses</li>
                    </ul>
                    
                    <h4 className="font-medium mb-2 mt-4">Key Guidelines:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Replace sample data with your actual asset information</li>
                      <li>• Keep the same column headers (do not modify)</li>
                      <li>• Required fields: <strong>name, type, status</strong></li>
                      <li>• Date format: <strong>YYYY-MM-DD</strong> (e.g., 2024-01-15)</li>
                      <li>• Software assets should include software_name and version</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Step 3: Upload Your CSV</h3>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="bulk-upload-file"
                      data-testid="input-bulk-file"
                    />
                    <label htmlFor="bulk-upload-file" className="cursor-pointer">
                      <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-2">Choose CSV file</p>
                      <p className="text-sm text-muted-foreground">
                        Click to select your completed CSV file (max 5MB, 5000 rows)
                      </p>
                    </label>
                  </div>

                  {uploadFile && (
                    <div className="mt-4">
                      <Alert>
                        <FileText className="h-4 w-4" />
                        <AlertDescription>
                          Selected file: <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        </AlertDescription>
                      </Alert>

                      <div className="flex gap-2 mt-4">
                        <Button 
                          onClick={validateFile} 
                          disabled={isValidating}
                          data-testid="button-validate"
                        >
                          {isValidating ? "Validating..." : "Validate File"}
                        </Button>
                        
                        {uploadResults && uploadResults.summary.valid > 0 && (
                          <>
                            <Button 
                              onClick={() => importAssets('partial')} 
                              disabled={isUploading}
                              data-testid="button-import-partial"
                            >
                              {isUploading ? "Importing..." : "Import Valid Assets"}
                            </Button>
                            
                            {uploadResults.summary.invalid === 0 && (
                              <Button 
                                onClick={() => importAssets('atomic')} 
                                disabled={isUploading}
                                variant="outline"
                                data-testid="button-import-all"
                              >
                                Import All (Atomic)
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {uploadResults && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-muted p-3 rounded-lg text-center">
                          <div className="text-2xl font-bold">{uploadResults.summary.total}</div>
                          <div className="text-sm text-muted-foreground">Total Rows</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg text-center">
                          <div className="text-2xl font-bold text-green-600">{uploadResults.summary.valid}</div>
                          <div className="text-sm text-muted-foreground">Valid</div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-950 p-3 rounded-lg text-center">
                          <div className="text-2xl font-bold text-red-600">{uploadResults.summary.invalid}</div>
                          <div className="text-sm text-muted-foreground">Invalid</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg text-center">
                          <div className="text-2xl font-bold text-blue-600">{uploadResults.summary.inserted || 0}</div>
                          <div className="text-sm text-muted-foreground">Imported</div>
                        </div>
                      </div>

                      {uploadResults.rows && uploadResults.rows.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="max-h-60 overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 sticky top-0">
                                <tr>
                                  <th className="text-left py-2 px-3">Row</th>
                                  <th className="text-left py-2 px-3">Status</th>
                                  <th className="text-left py-2 px-3">Issues</th>
                                </tr>
                              </thead>
                              <tbody>
                                {uploadResults.rows.map((row: any, index: number) => (
                                  <tr key={index} className="border-t">
                                    <td className="py-2 px-3">{row.rowNumber}</td>
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-1">
                                        {row.status === 'valid' ? (
                                          <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-red-600" />
                                        )}
                                        <span className={row.status === 'valid' ? 'text-green-600' : 'text-red-600'}>
                                          {row.status}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3">
                                      {row.errors?.length > 0 && (
                                        <div className="text-red-600 text-xs">
                                          {row.errors.join(', ')}
                                        </div>
                                      )}
                                      {row.warnings?.length > 0 && (
                                        <div className="text-yellow-600 text-xs">
                                          {row.warnings.join(', ')}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      )}
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />
    </div>
  );
}
