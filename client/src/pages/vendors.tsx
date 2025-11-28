import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { CalendarDays, Building2, Mail, Phone, Plus, Search, Edit, Trash2, Eye, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const CONTRACT_TYPE_OPTIONS = ["Annual", "Monthly", "One-time"] as const;
type ContractTypeOption = typeof CONTRACT_TYPE_OPTIONS[number];

const vendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.date().optional(),
  contractEndDate: z.date().optional(),
  contractValue: z.string()
    .min(1, "Contract value is required")
    .refine((val) => !Number.isNaN(Number(val)), "Contract value must be a number")
    .refine((val) => Number(val) >= 0, "Contract value must be greater than or equal to 0"),
  contractType: z.enum(CONTRACT_TYPE_OPTIONS, { required_error: "Contract type is required" }),
  notes: z.string().optional(),
});

type VendorData = z.infer<typeof vendorSchema>;

interface Vendor {
  id: string;
  value: string;
  description?: string;
  metadata?: {
    email?: string;
    phone?: string;
    contactPerson?: string;
    address?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    contractValue?: number;
    contractType?: ContractTypeOption;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_VENDOR_FORM_VALUES: VendorData = {
  name: "",
  email: "",
  phone: "",
  contactPerson: "",
  address: "",
  contractStartDate: undefined,
  contractEndDate: undefined,
  contractValue: "",
  contractType: undefined,
  notes: "",
};

const mapVendorToFormValues = (vendor?: Vendor | null): VendorData => {
  if (!vendor) return { ...DEFAULT_VENDOR_FORM_VALUES };
  return {
    name: vendor.value || "",
    email: vendor.metadata?.email || "",
    phone: vendor.metadata?.phone || "",
    contactPerson: vendor.metadata?.contactPerson || "",
    address: vendor.metadata?.address || "",
    contractStartDate: vendor.metadata?.contractStartDate
      ? new Date(vendor.metadata.contractStartDate)
      : undefined,
    contractEndDate: vendor.metadata?.contractEndDate
      ? new Date(vendor.metadata.contractEndDate)
      : undefined,
    contractValue:
      vendor.metadata?.contractValue !== undefined ? String(vendor.metadata.contractValue) : "",
    contractType: vendor.metadata?.contractType,
    notes: vendor.description || "",
  };
};

function AddVendorForm({
  onSuccess,
  onCancel,
  editingVendor,
  initialValues,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  editingVendor?: Vendor;
  initialValues: VendorData;
}) {
  const { toast } = useToast();
  const [isContractStartOpen, setIsContractStartOpen] = useState(false);
  const [isContractEndOpen, setIsContractEndOpen] = useState(false);

  const sanitizeField = (value?: string) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  };
  
  const form = useForm<VendorData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const createVendor = useMutation({
    mutationFn: async (data: VendorData) => {
      const payload = {
        name: data.name.trim(),
        contactPerson: sanitizeField(data.contactPerson),
        email: sanitizeField(data.email),
        phone: sanitizeField(data.phone),
        address: sanitizeField(data.address),
        contractStartDate: data.contractStartDate?.toISOString(),
        contractEndDate: data.contractEndDate?.toISOString(),
        contractValue: Number(data.contractValue),
        contractType: data.contractType,
        notes: sanitizeField(data.notes),
      };

      const endpoint = editingVendor ? `/api/vendors/${editingVendor.id}` : "/api/vendors";
      const method = editingVendor ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: editingVendor ? "Vendor updated!" : "Vendor created!",
        description: editingVendor 
          ? "The vendor information has been updated successfully."
          : "A new vendor has been added to your database.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      console.error("Vendor creation/update error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${editingVendor ? 'update' : 'create'} vendor. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VendorData) => {
    createVendor.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter vendor name" {...field} data-testid="input-vendor-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="contactPerson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person</FormLabel>
                <FormControl>
                  <Input placeholder="Enter contact person name" {...field} data-testid="input-contact-person" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input placeholder="vendor@example.com" type="email" {...field} data-testid="input-vendor-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input placeholder="+1 (555) 123-4567" {...field} data-testid="input-vendor-phone" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter vendor address" {...field} data-testid="input-vendor-address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contractStartDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Start Date</FormLabel>
                <Popover open={isContractStartOpen} onOpenChange={setIsContractStartOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="input-contract-start-date"
                      >
                        {field.value ? format(field.value, "PPP") : "Select start date"}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        if (date) {
                          setIsContractStartOpen(false);
                        }
                      }}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="contractEndDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract End Date</FormLabel>
                <Popover open={isContractEndOpen} onOpenChange={setIsContractEndOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="input-contract-end-date"
                      >
                        {field.value ? format(field.value, "PPP") : "Select end date"}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        if (date) {
                          setIsContractEndOpen(false);
                        }
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contractValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Value *</FormLabel>
                <FormControl>
                  <div className="flex">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="1000"
                      className="rounded-r-none"
                      {...field}
                      data-testid="input-contract-value"
                    />
                    <span className="inline-flex items-center rounded-r-md border border-l-0 px-3 text-sm text-muted-foreground">
                      $
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="contractType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Type *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="input-contract-type">
                      <SelectValue placeholder="Select contract type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTRACT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes about the vendor" {...field} data-testid="input-vendor-notes" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-vendor"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createVendor.isPending}
            data-testid="button-save-vendor"
          >
            {createVendor.isPending ? "Saving..." : editingVendor ? "Update Vendor" : "Create Vendor"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function Vendors() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorFormValues, setVendorFormValues] = useState<VendorData>(DEFAULT_VENDOR_FORM_VALUES);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewVendor, setViewVendor] = useState<Vendor | null>(null);
  const [isViewLoading, setIsViewLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const isNewVendor = window.location.pathname === "/vendors/new";

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
    if (!permissions.canEditVendors) {
      setShowAddForm(false);
      setEditingVendor(null);
    }
  }, [permissions.canEditVendors]);

  useEffect(() => {
    if (isNewVendor) {
      if (permissions.canEditVendors) {
        setShowAddForm(true);
      } else {
        toast({
          title: "Insufficient permissions",
          description: "Only admins and IT managers can create or edit vendors.",
          variant: "destructive",
        });
        setLocation("/vendors");
      }
    }
  }, [isNewVendor, permissions.canEditVendors, setLocation, toast]);

  const fetchVendorById = async (id: string) => {
    const response = await authenticatedRequest("GET", `/api/vendors/${id}`);
    return response.json();
  };

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/vendors");
      return response.json();
    },
    enabled: permissions.canViewVendors,
  });

  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/vendors/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Vendor deleted!",
        description: "The vendor has been removed from your database.",
      });
    },
    onError: (error: any) => {
      console.error("Vendor deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatContractValue = (value?: number | string) => {
    if (value === undefined || value === null) return null;
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numericValue)) {
      return `${value}$`;
    }
    return `${numericValue.toLocaleString()}$`;
  };

  const formatDateDisplay = (value?: string) => {
    if (!value) return "—";
    try {
      return format(new Date(value), "PPP");
    } catch {
      return value;
    }
  };

  const filteredVendors = vendors?.filter((vendor: Vendor) =>
    vendor.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.metadata?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.metadata?.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const contractExpiringVendors = filteredVendors.filter((vendor: Vendor) => {
    if (!vendor.metadata?.contractEndDate) return false;
    const endDate = new Date(vendor.metadata.contractEndDate);
    const now = new Date();
    const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return endDate <= threeMonthsFromNow && endDate >= now;
  });

  const displayVendors = searchParams?.includes("filter=contract-expiring") 
    ? contractExpiringVendors 
    : filteredVendors;

  const handleAddVendor = () => {
    if (!ensurePermission(permissions.canEditVendors, "Only admins and IT managers can create or edit vendors.")) {
      return;
    }
    setEditingVendor(null);
    setVendorFormValues({ ...DEFAULT_VENDOR_FORM_VALUES });
    setShowAddForm(true);
    if (!isNewVendor) {
      setLocation("/vendors/new");
    }
  };

  const handleEditVendor = async (vendor: Vendor) => {
    if (!ensurePermission(permissions.canEditVendors, "Only admins and IT managers can create or edit vendors.")) {
      return;
    }
    setEditingVendor(vendor);
    setVendorFormValues(mapVendorToFormValues(vendor));
    setShowAddForm(true);

    try {
      const vendorData = await fetchVendorById(vendor.id);
      setEditingVendor(vendorData);
      setVendorFormValues(mapVendorToFormValues(vendorData));
    } catch (error: any) {
      console.error("Failed to load vendor", error);
      toast({
        title: "Unable to load vendor",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingVendor(null);
    setVendorFormValues({ ...DEFAULT_VENDOR_FORM_VALUES });
    if (isNewVendor) {
      setLocation("/vendors");
    }
  };

  const handleViewVendor = async (vendorId: string) => {
    setIsViewDialogOpen(true);
    setIsViewLoading(true);
    setViewVendor(null);
    try {
      const vendorData = await fetchVendorById(vendorId);
      setViewVendor(vendorData);
    } catch (error: any) {
      console.error("Failed to load vendor", error);
      toast({
        title: "Unable to load vendor",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setIsViewDialogOpen(false);
    } finally {
      setIsViewLoading(false);
    }
  };

  const closeViewDialog = () => {
    setIsViewDialogOpen(false);
    setViewVendor(null);
  };

  const getContractStatus = (vendor: Vendor) => {
    if (!vendor.metadata?.contractEndDate) return null;
    
    const endDate = new Date(vendor.metadata.contractEndDate);
    const now = new Date();
    
    if (endDate < now) {
      return { status: "expired", label: "Expired", variant: "destructive" as const };
    } else if (endDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) {
      return { status: "expiring-soon", label: "Expiring Soon", variant: "destructive" as const };
    } else if (endDate <= new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)) {
      return { status: "expiring", label: "Expiring", variant: "secondary" as const };
    } else {
      return { status: "active", label: "Active", variant: "default" as const };
    }
  };

  if (!permissions.canViewVendors) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 md:ml-64 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardHeader>
              <CardTitle>Access restricted</CardTitle>
              <CardDescription>Technicians cannot view vendor information.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  if (showAddForm) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        
        <main className="flex-1 md:ml-64 overflow-auto">
          <TopBar 
            title={editingVendor ? "Edit Vendor" : "Add New Vendor"}
            description={editingVendor 
              ? "Update vendor information and contract details"
              : "Add a new vendor to your system with contract information"
            }
            showAddButton={false}
          />
            <div className="p-6">
              <div className="max-w-4xl mx-auto">
                <Card>
                  <CardContent className="pt-6">
                    <AddVendorForm
                      onSuccess={handleCloseForm}
                      onCancel={handleCloseForm}
                      editingVendor={editingVendor || undefined}
                      initialValues={vendorFormValues}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background page-enter">
      <Sidebar />
      
      <main className="flex-1 md:ml-64 overflow-auto">
        <TopBar 
          title={searchParams?.includes("filter=contract-expiring") ? "Contract Renewals" : "Vendors Management"}
          description={searchParams?.includes("filter=contract-expiring") 
            ? "Vendors with contracts expiring within 3 months" 
            : "Manage your vendor relationships and contracts"
          }
          showAddButton={permissions.canEditVendors}
          addButtonText="Add Vendor"
          onAddClick={permissions.canEditVendors ? handleAddVendor : undefined}
        />
          <div className="p-6">
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-vendors"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">Loading vendors...</div>
              </div>
            ) : displayVendors.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No vendors found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm 
                      ? "No vendors match your search criteria" 
                      : searchParams?.includes("filter=contract-expiring")
                      ? "No vendors have contracts expiring soon"
                      : "Get started by adding your first vendor"
                    }
                  </p>
                  {!searchTerm && !searchParams?.includes("filter=contract-expiring") && (
                    <Button onClick={handleAddVendor} data-testid="button-add-first-vendor">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Vendor
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayVendors.map((vendor: Vendor) => {
                  const contractStatus = getContractStatus(vendor);
                  
                  return (
                    <Card key={vendor.id} data-testid={`card-vendor-${vendor.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-muted-foreground" />
                              {vendor.value}
                            </CardTitle>
                            {vendor.metadata?.contactPerson && (
                              <CardDescription>Contact: {vendor.metadata.contactPerson}</CardDescription>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewVendor(vendor.id)}
                              data-testid={`button-view-vendor-${vendor.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {permissions.canEditVendors && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditVendor(vendor)}
                                data-testid={`button-edit-vendor-${vendor.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {permissions.canDeleteVendors && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`button-delete-vendor-${vendor.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{vendor.value}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      if (!ensurePermission(permissions.canDeleteVendors, "Only admins can delete vendors.")) {
                                        return;
                                      }
                                      deleteVendor.mutate(vendor.id);
                                    }}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {vendor.metadata?.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-4 h-4" />
                            {vendor.metadata.email}
                          </div>
                        )}
                        
                        {vendor.metadata?.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-4 h-4" />
                            {vendor.metadata.phone}
                          </div>
                        )}

                        {vendor.metadata?.contractEndDate && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CalendarDays className="w-4 h-4" />
                              Contract expires {format(new Date(vendor.metadata.contractEndDate), "MMM d, yyyy")}
                            </div>
                            {contractStatus && (
                              <Badge variant={contractStatus.variant} className="text-xs">
                                {contractStatus.label}
                              </Badge>
                            )}
                          </div>
                        )}

                        {formatContractValue(vendor.metadata?.contractValue) && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Value:</span> {formatContractValue(vendor.metadata?.contractValue)}
                          </div>
                        )}

                        {vendor.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {vendor.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
      </main>
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />

      <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeViewDialog();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewVendor?.value || "Vendor Details"}</DialogTitle>
            <DialogDescription>Full vendor profile and contract information</DialogDescription>
          </DialogHeader>
          {isViewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : viewVendor ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contact Person</p>
                  <p className="font-medium">{viewVendor.metadata?.contactPerson || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Email</p>
                  <p className="font-medium">{viewVendor.metadata?.email || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Phone</p>
                  <p className="font-medium">{viewVendor.metadata?.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Address</p>
                  <p className="font-medium">{viewVendor.metadata?.address || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Start</p>
                  <p className="font-medium">{formatDateDisplay(viewVendor.metadata?.contractStartDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract End</p>
                  <p className="font-medium">{formatDateDisplay(viewVendor.metadata?.contractEndDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Type</p>
                  <p className="font-medium">{viewVendor.metadata?.contractType || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Value</p>
                  <p className="font-medium">{formatContractValue(viewVendor.metadata?.contractValue) || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {viewVendor.description || "No notes provided."}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load vendor details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
