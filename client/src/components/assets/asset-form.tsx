import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { insertAssetSchema, insertMasterDataSchema } from "@shared/schema";
import type { Asset, InsertAsset, MasterData } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { LocationSelector } from "@/components/ui/location-selector";


const assetFormSchema = insertAssetSchema.extend({
  tenantId: z.string().optional(), // Make tenantId optional for form validation
  purchaseDate: z.string().optional(),
  purchaseCost: z.coerce.number().min(0, "Purchase cost must be zero or greater").optional().or(z.undefined()),
  warrantyExpiry: z.string().optional(),
  renewalDate: z.string().optional(),
  vendorEmail: z.string().email("Please enter a valid email address (e.g., vendor@company.com)").optional().or(z.literal("")).or(z.undefined()),
  vendorPhone: z.string().regex(/^[\+]?[\d\s\-\(\)]*$/, "Please enter a valid phone number (e.g., +1-555-123-4567)").optional().or(z.literal("")).or(z.undefined()),
  companyGstNumber: z.string().optional().or(z.literal("")).or(z.undefined()),
  // Geographic location fields
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  // Enhanced validation for required fields
  name: z.string().min(1, "Asset name is required").min(3, "Asset name must be at least 3 characters").max(100, "Asset name must not exceed 100 characters"),
  serialNumber: z.string().optional().refine(val => !val || val.length >= 3, {
    message: "Serial number must be at least 3 characters if provided"
  }),
}).superRefine((data, ctx) => {
  // Enhanced date validation logic
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  };

  const purchaseDate = parseDate(data.purchaseDate || "");
  const warrantyExpiry = parseDate(data.warrantyExpiry || "");
  const renewalDate = parseDate(data.renewalDate || "");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Purchase date validation
  if (purchaseDate) {
    const maxFutureDate = new Date();
    maxFutureDate.setDate(today.getDate() + 30);
    
    if (purchaseDate > maxFutureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase date cannot be more than 30 days in the future",
        path: ["purchaseDate"],
      });
    }

    const minDate = new Date(1990, 0, 1);
    if (purchaseDate < minDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase date cannot be earlier than January 1, 1990",
        path: ["purchaseDate"],
      });
    }
  }

  // Warranty expiry validation
  if (warrantyExpiry && purchaseDate) {
    if (warrantyExpiry <= purchaseDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Warranty expiry date must be after the purchase date",
        path: ["warrantyExpiry"],
      });
    }

    // Reasonable warranty period check (max 10 years)
    const maxWarranty = new Date(purchaseDate);
    maxWarranty.setFullYear(purchaseDate.getFullYear() + 10);
    if (warrantyExpiry > maxWarranty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Warranty period seems unusually long (max 10 years recommended)",
        path: ["warrantyExpiry"],
      });
    }
  }

  // Hardware-specific validation
  if (data.type === 'Hardware' && !data.serialNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Serial number is required for hardware assets for warranty and tracking",
      path: ["serialNumber"],
    });
  }

  // Software-specific validation with enhanced checks
  if (data.type === 'Software') {
    if (!data.softwareName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Software name is required (e.g., Microsoft Office, Adobe Photoshop)",
        path: ["softwareName"],
      });
    }
    if (!data.version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Version is required for software tracking (e.g., 2024, v12.5, CC 2023)",
        path: ["version"],
      });
    }
    if (!data.licenseType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "License type is required (Perpetual, Subscription, or Volume)",
        path: ["licenseType"],
      });
    }
    if (!data.licenseKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "License key is required for software asset management and compliance",
        path: ["licenseKey"],
      });
    }

    // Enhanced license validation with proper coercion
    const usedLicenses = Number(data.usedLicenses);
    if (isNaN(usedLicenses) || usedLicenses < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Used licenses must be a valid number (0 or greater)",
        path: ["usedLicenses"],
      });
    }

    // Reasonable license limits (check unconditionally)
    if (!isNaN(usedLicenses) && usedLicenses > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Used licenses count seems unusually high (max 10,000). Please verify.",
        path: ["usedLicenses"],
      });
    }

    if (!data.renewalDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Renewal date is required for license compliance tracking",
        path: ["renewalDate"],
      });
    }

    // Renewal date validation for software
    if (renewalDate) {
      if (renewalDate <= today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Renewal date should be in the future. Past renewal dates may indicate expired licenses.",
          path: ["renewalDate"],
        });
      }

      // Max 5 years renewal period
      const maxRenewal = new Date();
      maxRenewal.setFullYear(today.getFullYear() + 5);
      if (renewalDate > maxRenewal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Renewal date seems unusually far in the future (max 5 years recommended)",
          path: ["renewalDate"],
        });
      }
    }
  }

  // Enhanced cost validation
  if (data.purchaseCost !== undefined && data.purchaseCost !== null) {
    if (data.purchaseCost > 1000000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase cost seems unusually high. Please verify the amount is correct.",
        path: ["purchaseCost"],
      });
    }
    // Cost validation now handled at field level with min(1) requirement
  }

  // Asset type-specific location validation
  if (data.type === 'Hardware' && data.status === 'deployed') {
    if (!data.country) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country is required for deployed hardware assets",
        path: ["country"],
      });
    }
    // Note: Assigned user recommendation is now handled as helper text, not blocking validation
  }
});

type AssetFormData = z.infer<typeof assetFormSchema>;

interface ComboSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  type: string;
  placeholder: string;
  label: string;
  dataTestId: string;
}

function ComboSelect({ value, onValueChange, type, placeholder, label, dataTestId }: ComboSelectProps) {
  const [open, setOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newValue, setNewValue] = useState("");
  const { toast } = useToast();

  const { data: masterData = [], isLoading, error } = useQuery<MasterData[]>({
    queryKey: ['/api/master', type],
  });

  const addMasterDataMutation = useMutation<MasterData, Error, { type: string; value: string }>({
    mutationFn: async (data: { type: string; value: string }) => {
      const response = await authenticatedRequest("POST", `/api/master`, data);
      return response.json() as Promise<MasterData>;
    },
    onSuccess: (newMasterData: MasterData) => {
      queryClient.setQueryData<MasterData[]>(
        ['/api/master', type],
        (old = []) => {
          const exists = old.some((item) => item.id === newMasterData.id);
          return exists ? old : [...old, newMasterData];
        }
      );
      queryClient.invalidateQueries({ queryKey: ['/api/master', type] });
      onValueChange(newMasterData.value);
      setShowAddDialog(false);
      setNewValue("");
      setOpen(false);
      toast({
        title: "Added successfully",
        description: `New ${label.toLowerCase()} has been added.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || `Failed to add ${label.toLowerCase()}. You might not have permission to add new items.`,
        variant: "destructive",
      });
    },
  });

  const handleAddNew = () => {
    if (newValue.trim()) {
      addMasterDataMutation.mutate({ type, value: newValue.trim() });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid={dataTestId}
          >
            {value ? value : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
            <CommandEmpty>
              <div className="p-2">
                <p>No {label.toLowerCase()} found.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setShowAddDialog(true)}
                  data-testid={`button-add-new-${type}`}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new {label.toLowerCase()}
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {masterData.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  data-testid={`option-${type}-${item.value}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.value}
                </CommandItem>
              ))}
              {masterData.length > 0 && (
                <CommandItem onSelect={() => setShowAddDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add new {label.toLowerCase()}
                </CommandItem>
              )}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-value">New {label}</Label>
              <Input
                id="new-value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={`Enter new ${label.toLowerCase()}`}
                data-testid={`input-new-${type}`}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setNewValue("");
                }}
                data-testid={`button-cancel-${type}`}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddNew}
                disabled={!newValue.trim() || addMasterDataMutation.isPending}
                data-testid={`button-save-${type}`}
              >
                {addMasterDataMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AssetFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<InsertAsset, 'tenantId'>) => void;
  asset?: Asset;
  isLoading?: boolean;
}

export function AssetForm({ isOpen, onClose, onSubmit, asset, isLoading }: AssetFormProps) {
  const [showReview, setShowReview] = useState(false);
  const [reviewData, setReviewData] = useState<AssetFormData | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: asset ? {
      name: asset.name,
      type: asset.type,
      category: asset.category || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      status: asset.status,
      location: asset.location || "", // Legacy field, keep for migration
      country: asset.country || "",
      state: asset.state || "",
      city: asset.city || "",
      assignedUserName: asset.assignedUserName || "",
      assignedUserEmail: asset.assignedUserEmail || "",
      assignedUserEmployeeId: asset.assignedUserEmployeeId || "",
      purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : "",
      purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : undefined,
      warrantyExpiry: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toISOString().split('T')[0] : "",
      // Software-specific fields
      softwareName: asset.softwareName || "",
      version: asset.version || "",
      licenseType: asset.licenseType || "",
      licenseKey: asset.licenseKey || "",
      usedLicenses: asset.usedLicenses || 0,
      renewalDate: asset.renewalDate ? new Date(asset.renewalDate).toISOString().split('T')[0] : "",
      notes: asset.notes || "",
      vendorName: asset.vendorName || "",
      vendorEmail: asset.vendorEmail || "",
      vendorPhone: asset.vendorPhone || "",
      companyName: asset.companyName || "",
      companyGstNumber: asset.companyGstNumber || "",
    } : {
      name: "",
      type: "Hardware",
      status: "in-stock",
      category: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      location: "",
      assignedUserName: "",
      assignedUserEmail: "",
      assignedUserEmployeeId: "",
      purchaseDate: "",
      purchaseCost: undefined,
      warrantyExpiry: "",
      softwareName: "",
      version: "",
      licenseType: "",
      licenseKey: "",
      usedLicenses: 0,
      renewalDate: "",
      notes: "",
      vendorName: "",
      vendorEmail: "",
      vendorPhone: "",
      companyName: "",
      companyGstNumber: "",
      tenantId: "", // Add tenantId to default values
    },
  });

  // Reset form when asset prop changes (for edit mode)
  useEffect(() => {
    if (asset) {
      // Pre-fill form with existing asset data
      reset({
        name: asset.name,
        type: asset.type,
        category: asset.category || "",
        manufacturer: asset.manufacturer || "",
        model: asset.model || "",
        serialNumber: asset.serialNumber || "",
        status: asset.status,
        location: asset.location || "", // Legacy field, keep for migration
      country: asset.country || "",
      state: asset.state || "",
      city: asset.city || "",
        assignedUserName: asset.assignedUserName || "",
        assignedUserEmail: asset.assignedUserEmail || "",
        assignedUserEmployeeId: asset.assignedUserEmployeeId || "",
        purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : "",
        purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : undefined,
        warrantyExpiry: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toISOString().split('T')[0] : "",
        // Software-specific fields
        softwareName: asset.softwareName || "",
        version: asset.version || "",
        licenseType: asset.licenseType || "",
        licenseKey: asset.licenseKey || "",
        usedLicenses: asset.usedLicenses || 0,
        renewalDate: asset.renewalDate ? new Date(asset.renewalDate).toISOString().split('T')[0] : "",
        notes: asset.notes || "",
        vendorName: asset.vendorName || "",
        vendorEmail: asset.vendorEmail || "",
        vendorPhone: asset.vendorPhone || "",
        companyName: asset.companyName || "",
        companyGstNumber: asset.companyGstNumber || "",
        tenantId: "", // Add tenantId to form data
      });
    } else {
      // Reset to empty form for create mode
      reset({
        name: "",
        type: "",
        status: "",
        category: "",
        manufacturer: "",
        model: "",
        serialNumber: "",
        location: "",
        assignedUserName: "",
        assignedUserEmail: "",
        assignedUserEmployeeId: "",
        purchaseDate: "",
        purchaseCost: undefined,
        warrantyExpiry: "",
        softwareName: "",
        version: "",
        licenseType: "",
        licenseKey: "",
        usedLicenses: 0,
        renewalDate: "",
        notes: "",
        vendorName: "",
        vendorEmail: "",
        vendorPhone: "",
        companyName: "",
        companyGstNumber: "",
        tenantId: "",
      });
    }
  }, [asset, reset]);

  const handleFormSubmit = (data: AssetFormData) => {
    console.log("Form submission data:", data);
    console.log("Form errors:", errors);
    
    // For edit mode, skip review and submit directly
    if (asset) {
      const { tenantId: _, ...restData } = data;
      const submitData: Omit<InsertAsset, 'tenantId'> = {
        ...restData,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : undefined,
        renewalDate: data.renewalDate ? new Date(data.renewalDate) : undefined,
      };
      console.log("Submitting asset data:", submitData);
      onSubmit(submitData);
      return;
    }
    
    // For create mode, show review step first
    setReviewData(data);
    setShowReview(true);
  };

  const handleProceedWithCreation = () => {
    if (!reviewData) return;
    
    const { tenantId: _, ...restData } = reviewData;
    const submitData: Omit<InsertAsset, 'tenantId'> = {
      ...restData,
      purchaseDate: reviewData.purchaseDate ? new Date(reviewData.purchaseDate) : undefined,
      warrantyExpiry: reviewData.warrantyExpiry ? new Date(reviewData.warrantyExpiry) : undefined,
      renewalDate: reviewData.renewalDate ? new Date(reviewData.renewalDate) : undefined,
    };
    
    console.log("Creating asset after review:", submitData);
    onSubmit(submitData);
    setShowReview(false);
    setReviewData(null);
  };

  const handleBackToEdit = () => {
    setShowReview(false);
    setReviewData(null);
  };

  const handleClose = () => {
    reset();
    setShowReview(false);
    setReviewData(null);
    onClose();
  };

  // Helper functions for dynamic field requirements and hints
  const getFieldHelperText = (fieldName: string, currentType?: string, currentCategory?: string, currentStatus?: string) => {
    switch (fieldName) {
      case 'serialNumber':
        if (currentType === 'Hardware') {
          return 'Required for hardware assets. Used for warranty claims and asset tracking.';
        }
        return 'Optional. If provided, must be at least 3 characters.';
      case 'purchaseDate':
        return 'Date when the asset was purchased. Cannot be more than 30 days in the future.';
      case 'warrantyExpiry':
        return 'Must be after the purchase date. Leave empty if no warranty or warranty unknown.';
      case 'purchaseCost':
        return 'Total cost paid for this asset. Used for depreciation and budgeting calculations.';
      case 'assignedUserName':
        if (currentCategory && ['Laptop', 'Desktop', 'Mobile Phone', 'Tablet'].includes(currentCategory)) {
          return 'Recommended for personal computing devices to track asset responsibility.';
        }
        return 'Name of the person currently using this asset.';
      case 'renewalDate':
        if (currentType === 'Software') {
          return 'Required for software assets. Date when license expires and needs renewal.';
        }
        return 'Date when any recurring cost or license needs to be renewed.';
      case 'usedLicenses':
        return 'Number of licenses currently in use. Cannot exceed total available licenses.';
      case 'category':
        if (currentType === 'Hardware') {
          return 'Required. Examples: Laptop, Desktop, Server, Tablet, Mobile Phone, Printer';
        }
        return 'Classification category for this asset type.';
      case 'manufacturer':
        if (currentType === 'Hardware') {
          return 'Required. Examples: Dell, HP, Lenovo, Apple, Microsoft';
        }
        return 'Company that manufactured this asset.';
      case 'model':
        if (currentType === 'Hardware') {
          return 'Required. Examples: Latitude 5520, ThinkPad T14, MacBook Pro';
        }
        return 'Specific model name or number.';
      case 'softwareName':
        if (currentType === 'Software') {
          return 'Required. Examples: Microsoft Office, Adobe Photoshop, AutoCAD';
        }
        return 'Name of the software application.';
      case 'version':
        if (currentType === 'Software') {
          return 'Required. Examples: 2024, v12.5, CC 2023, Windows 11';
        }
        return 'Version number or identifier.';
      case 'licenseType':
        if (currentType === 'Software') {
          return 'Required. Choose: Perpetual (one-time purchase), Subscription (recurring), or Volume (bulk licensing)';
        }
        return 'Type of license agreement.';
      case 'licenseKey':
        if (currentType === 'Software') {
          return 'Required. Product key or license identifier for activation and compliance.';
        }
        return 'License or activation key.';
      case 'country':
        if (currentType === 'Hardware' && currentStatus === 'deployed') {
          return 'Required for deployed hardware. Select the country where this asset is located.';
        }
        return 'Country where this asset is located.';
      default:
        return '';
    }
  };

  const isFieldRequired = (fieldName: string, currentType?: string, currentStatus?: string, currentCategory?: string): boolean => {
    switch (fieldName) {
      case 'category':
      case 'manufacturer':
      case 'model':
      case 'country':
        return false; // Made optional as per user request
      case 'serialNumber':
        return currentType === 'Hardware';
      case 'softwareName':
      case 'version':
      case 'licenseType':
      case 'licenseKey':
      case 'renewalDate':
        return currentType === 'Software';
      case 'usedLicenses':
        return currentType === 'Software';
      default:
        return false;
    }
  };

  // Watch form values for dynamic field updates
  const watchedType = watch('type');
  const watchedCategory = watch('category');
  const watchedStatus = watch('status');

  const formatUSDValue = (amount?: number | string) => {
    if (amount === null || amount === undefined || amount === "" || Number.isNaN(Number(amount))) {
      return "Not specified";
    }
    return `$${Number(amount).toFixed(2)} USD`;
  };

  const formatFieldValue = (value: any, fieldType?: string): string => {
    if (value === null || value === undefined || value === "") return "Not specified";
    
    if (fieldType === "date" && typeof value === "string") {
      const date = new Date(value);
      return date.toLocaleDateString();
    }
    
    return String(value);
  };

  const renderReviewDialog = () => (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review Asset Details</DialogTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Please review the asset information below before creating the asset.
        </p>
      </DialogHeader>
      
      {reviewData && (
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-foreground border-b pb-2">Basic Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Asset Name:</span>
                <p className="text-foreground" data-testid="text-review-asset-name">{formatFieldValue(reviewData.name)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Type:</span>
                <p className="text-foreground" data-testid="text-review-type">{formatFieldValue(reviewData.type)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Serial Number:</span>
                <p className="text-foreground" data-testid="text-review-serial-number">{formatFieldValue(reviewData.serialNumber)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Category:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.category)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Model:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.model)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Manufacturer:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.manufacturer)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Status:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.status)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Location:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.location)}</p>
              </div>
              <div className="col-span-2">
                <span className="font-medium text-muted-foreground">Assigned User:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.assignedUserName)}</p>
              </div>
            </div>
          </div>

          {/* Financial Information */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-foreground border-b pb-2">Financial Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Purchase Date:</span>
                <p className="text-foreground" data-testid="text-review-purchase-date">{formatFieldValue(reviewData.purchaseDate, "date")}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Purchase Cost:</span>
                <p className="text-foreground" data-testid="text-review-purchase-cost">
                  {formatUSDValue(reviewData.purchaseCost)}
                </p>
              </div>
              <div className="col-span-2">
                <span className="font-medium text-muted-foreground">Warranty Expiry:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.warrantyExpiry, "date")}</p>
              </div>
            </div>
          </div>

          {/* Software Details - only show if type is Software */}
          {reviewData.type === "Software" && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-foreground border-b pb-2">Software Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Software Name:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.softwareName)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Version:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.version)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">License Type:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.licenseType)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Used Licenses:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.usedLicenses)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">License Key:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.licenseKey)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Renewal Date:</span>
                  <p className="text-foreground">{formatFieldValue(reviewData.renewalDate, "date")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Vendor & Company Information */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-foreground border-b pb-2">Vendor & Company Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Vendor Name:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.vendorName)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Vendor Email:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.vendorEmail)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Vendor Phone:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.vendorPhone)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Company Name:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.companyName)}</p>
              </div>
              <div className="col-span-2">
                <span className="font-medium text-muted-foreground">GST Number:</span>
                <p className="text-foreground">{formatFieldValue(reviewData.companyGstNumber)}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {reviewData.notes && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-foreground border-b pb-2">Notes</h3>
              <p className="text-sm text-foreground">{reviewData.notes}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleBackToEdit}
              data-testid="button-back-to-edit"
            >
              Back to Edit
            </Button>
            <Button 
              type="button" 
              onClick={handleProceedWithCreation}
              disabled={isLoading}
              data-testid="button-proceed-creation"
            >
              {isLoading ? "Creating..." : "Proceed with Creation"}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {showReview ? renderReviewDialog() : (
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{asset ? "Edit Asset" : "Add New Asset"}</DialogTitle>
          </DialogHeader>
        
        <form onSubmit={(e) => {
          console.log("Form onSubmit event triggered!");
          console.log("Form validation state:", { isValid: !Object.keys(errors).length });
          console.log("Current form errors:", errors);
          handleSubmit(handleFormSubmit)(e);
        }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">Asset Name *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="e.g., MacBook Pro 16-inch"
                data-testid="input-asset-name"
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="type">Asset Type *</Label>
              <Select 
                value={watch("type")} 
                onValueChange={(value) => setValue("type", value)}
              >
                <SelectTrigger data-testid="select-asset-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hardware">Hardware</SelectItem>
                  <SelectItem value="Software">Software</SelectItem>
                  <SelectItem value="Peripherals">Peripherals</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-red-500 text-sm mt-1">{errors.type.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="serialNumber">
                Serial Number {isFieldRequired('serialNumber', watchedType) && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="serialNumber"
                {...register("serialNumber")}
                placeholder="e.g., A1234567890"
                data-testid="input-serial-number"
              />
              {errors.serialNumber && (
                <p className="text-red-500 text-sm mt-1">{errors.serialNumber.message}</p>
              )}
              {getFieldHelperText('serialNumber', watchedType) && (
                <p className="text-muted-foreground text-xs mt-1">
                  {getFieldHelperText('serialNumber', watchedType)}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="category">
                Category {isFieldRequired('category', watchedType) && <span className="text-red-500">*</span>}
              </Label>
              <ComboSelect
                value={watch("category") || ""}
                onValueChange={(value) => setValue("category", value)}
                type="category"
                placeholder="Select category"
                label="Category"
                dataTestId="select-category"
              />
              {errors.category && (
                <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
              )}
              {getFieldHelperText('category', watchedType) && (
                <p className="text-muted-foreground text-xs mt-1">
                  {getFieldHelperText('category', watchedType)}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="model">
                Model {isFieldRequired('model', watchedType) && <span className="text-red-500">*</span>}
              </Label>
              <ComboSelect
                value={watch("model") || ""}
                onValueChange={(value) => setValue("model", value)}
                type="model"
                placeholder="Select model"
                label="Model"
                dataTestId="select-model"
              />
              {errors.model && (
                <p className="text-red-500 text-sm mt-1">{errors.model.message}</p>
              )}
              {getFieldHelperText('model', watchedType) && (
                <p className="text-muted-foreground text-xs mt-1">
                  {getFieldHelperText('model', watchedType)}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="manufacturer">
                Manufacturer {isFieldRequired('manufacturer', watchedType) && <span className="text-red-500">*</span>}
              </Label>
              <ComboSelect
                value={watch("manufacturer") || ""}
                onValueChange={(value) => setValue("manufacturer", value)}
                type="manufacturer"
                placeholder="Select manufacturer"
                label="Manufacturer"
                dataTestId="select-manufacturer"
              />
              {errors.manufacturer && (
                <p className="text-red-500 text-sm mt-1">{errors.manufacturer.message}</p>
              )}
              {getFieldHelperText('manufacturer', watchedType) && (
                <p className="text-muted-foreground text-xs mt-1">
                  {getFieldHelperText('manufacturer', watchedType)}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={watch("status")} 
                onValueChange={(value) => setValue("status", value)}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-stock">In Stock</SelectItem>
                  <SelectItem value="deployed">Deployed</SelectItem>
                  <SelectItem value="in-repair">In Repair</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <p className="text-red-500 text-sm mt-1">{errors.status.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="purchaseDate">Purchase Date</Label>
              <Input
                id="purchaseDate"
                type="date"
                {...register("purchaseDate")}
                data-testid="input-purchase-date"
              />
            </div>
            
            <div>
              <Label htmlFor="purchaseCost">Purchase Cost</Label>
              <div className="relative">
                <Input
                  id="purchaseCost"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pr-16"
                  {...register("purchaseCost", { 
                    setValueAs: v => v === '' || v == null || Number.isNaN(+v) ? undefined : +v 
                  })}
                  placeholder="0.00"
                  data-testid="input-purchase-cost"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground text-xs font-medium">
                  USD ($)
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enter the amount in USD (US Dollars). Minimum value is $0.00.</p>
              {errors.purchaseCost && (
                <p className="text-red-500 text-sm mt-1">{errors.purchaseCost.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
              <Input
                id="warrantyExpiry"
                type="date"
                {...register("warrantyExpiry")}
                data-testid="input-warranty-expiry"
              />
            </div>
            
            <div className="md:col-span-2">
              {/* Geographic Location Fields - Cascading Dropdowns */}
              <LocationSelector
                country={watch("country")}
                state={watch("state")}
                city={watch("city")}
                onLocationChange={(location) => {
                  if (location.country !== undefined) setValue("country", location.country);
                  if (location.state !== undefined) setValue("state", location.state);
                  if (location.city !== undefined) setValue("city", location.city);
                }}
                dataTestId="location-selector"
              />
            </div>
            
            <div className="md:col-span-2">
              <Label htmlFor="assignedUserName">Assigned User</Label>
              <Input
                id="assignedUserName"
                {...register("assignedUserName")}
                placeholder="e.g., John Smith"
                data-testid="input-assigned-user"
              />
            </div>

            <div>
              <Label htmlFor="assignedUserEmail">Email ID</Label>
              <Input
                id="assignedUserEmail"
                type="email"
                {...register("assignedUserEmail")}
                placeholder="e.g., john.smith@company.com"
                data-testid="input-assigned-user-email"
              />
            </div>

            <div>
              <Label htmlFor="assignedUserEmployeeId">Employee ID</Label>
              <Input
                id="assignedUserEmployeeId"
                {...register("assignedUserEmployeeId")}
                placeholder="e.g., EMP001"
                data-testid="input-assigned-user-employee-id"
              />
            </div>

            {/* Software-specific fields - only show when type is 'Software' */}
            {watch("type") === "Software" && (
              <>
                <div className="md:col-span-2">
                  <h3 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">Software Details</h3>
                </div>
                
                <div>
                  <Label htmlFor="softwareName">Software Name *</Label>
                  <Input
                    id="softwareName"
                    {...register("softwareName")}
                    placeholder="e.g., Microsoft Office 365"
                    data-testid="input-software-name"
                  />
                  {errors.softwareName && (
                    <p className="text-red-500 text-sm mt-1">{errors.softwareName.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="version">Version *</Label>
                  <Input
                    id="version"
                    {...register("version")}
                    placeholder="e.g., 2021, v1.5.3"
                    data-testid="input-version"
                  />
                  {errors.version && (
                    <p className="text-red-500 text-sm mt-1">{errors.version.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="licenseType">License Type *</Label>
                  <Select 
                    value={watch("licenseType") || ""} 
                    onValueChange={(value) => setValue("licenseType", value)}
                  >
                    <SelectTrigger data-testid="select-license-type">
                      <SelectValue placeholder="Select license type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perpetual">Perpetual</SelectItem>
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="volume">Volume</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.licenseType && (
                    <p className="text-red-500 text-sm mt-1">{errors.licenseType.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="licenseKey">License Key *</Label>
                  <Input
                    id="licenseKey"
                    {...register("licenseKey")}
                    placeholder="e.g., ABCD-1234-EFGH-5678"
                    data-testid="input-license-key"
                  />
                  {errors.licenseKey && (
                    <p className="text-red-500 text-sm mt-1">{errors.licenseKey.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="usedLicenses">Used Licenses *</Label>
                  <Input
                    id="usedLicenses"
                    type="number"
                    min="0"
                    {...register("usedLicenses", { 
                      setValueAs: v => v === '' || v == null || Number.isNaN(+v) ? undefined : +v 
                    })}
                    placeholder="0"
                    data-testid="input-used-licenses"
                  />
                  {errors.usedLicenses && (
                    <p className="text-red-500 text-sm mt-1">{errors.usedLicenses.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="renewalDate">Renewal Date *</Label>
                  <Input
                    id="renewalDate"
                    type="date"
                    {...register("renewalDate")}
                    data-testid="input-renewal-date"
                  />
                  {errors.renewalDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.renewalDate.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Vendor Information Section */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">Vendor Information</h3>
            </div>
            
            <div className="md:col-span-2">
              <Label htmlFor="vendorName">Vendor Name</Label>
              <ComboSelect
                value={watch("vendorName") || ""}
                onValueChange={(value) => setValue("vendorName", value)}
                type="vendor"
                placeholder="Select vendor"
                label="Vendor"
                dataTestId="select-vendor-name"
              />
            </div>
            
            <div>
              <Label htmlFor="vendorEmail">Vendor Email</Label>
              <Input
                id="vendorEmail"
                type="email"
                {...register("vendorEmail")}
                placeholder="e.g., business@vendor.com"
                data-testid="input-vendor-email"
              />
              {errors.vendorEmail && (
                <p className="text-red-500 text-sm mt-1">{errors.vendorEmail.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="vendorPhone">Vendor Phone</Label>
              <Input
                id="vendorPhone"
                type="tel"
                {...register("vendorPhone")}
                placeholder="e.g., +1-800-123-4567"
                data-testid="input-vendor-phone"
              />
              {errors.vendorPhone && (
                <p className="text-red-500 text-sm mt-1">{errors.vendorPhone.message}</p>
              )}
            </div>

            {/* Company Information Section */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">Company Information</h3>
            </div>
            
            <div>
              <Label htmlFor="companyName">Company Name</Label>
              <ComboSelect
                value={watch("companyName") || ""}
                onValueChange={(value) => setValue("companyName", value)}
                type="company"
                placeholder="Select company"
                label="Company"
                dataTestId="select-company-name"
              />
            </div>
            
            <div>
              <Label htmlFor="companyGstNumber">GST Number</Label>
              <Input
                id="companyGstNumber"
                {...register("companyGstNumber")}
                placeholder="e.g., 29AABCA1234D1Z5"
                maxLength={15}
                data-testid="input-company-gst"
              />
              {errors.companyGstNumber && (
                <p className="text-red-500 text-sm mt-1">{errors.companyGstNumber.message}</p>
              )}
            </div>
            
            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Additional notes about this asset..."
                className="h-24"
                data-testid="textarea-notes"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              onClick={(e) => {
                console.log("Submit button clicked!");
                console.log("Button type:", e.currentTarget.type);
                console.log("Form errors before submit:", errors);
                // Don't prevent default - let form submission proceed
              }}
              data-testid="button-submit-asset"
            >
              {isLoading ? "Saving..." : asset ? "Update Asset" : "Create Asset"}
            </Button>
          </div>
        </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
