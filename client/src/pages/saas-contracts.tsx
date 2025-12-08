import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { FileText, Search, Edit, Trash2, Eye, Loader2, Calendar as CalendarIcon, DollarSign, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const CONTRACT_STATUS_OPTIONS = ["active", "expired", "cancelled", "pending"] as const;
const BILLING_CYCLE_OPTIONS = ["monthly", "quarterly", "annual", "one-time"] as const;
const PAYMENT_METHOD_OPTIONS = ["credit-card", "invoice", "purchase-order", "ach", "wire"] as const;

type ContractStatus = typeof CONTRACT_STATUS_OPTIONS[number];
type BillingCycle = typeof BILLING_CYCLE_OPTIONS[number];
type PaymentMethod = typeof PAYMENT_METHOD_OPTIONS[number];

const contractSchema = z.object({
  appId: z.string().optional(),
  vendor: z.string().min(1, "Vendor name is required"),
  contractNumber: z.string().optional(),
  status: z.enum(CONTRACT_STATUS_OPTIONS).default("active"),
  startDate: z.date(),
  endDate: z.date(),
  autoRenew: z.boolean().default(false),
  billingCycle: z.enum(BILLING_CYCLE_OPTIONS),
  contractValue: z.number().min(0, "Contract value must be positive"),
  currency: z.string().default("USD"),
  licenseCount: z.number().min(1).optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_OPTIONS).optional(),
  accountManager: z.string().optional(),
  notes: z.string().optional(),
});

type ContractData = z.infer<typeof contractSchema>;

interface Contract {
  id: string;
  tenantId: string;
  appId?: string;
  vendor: string;
  contractNumber?: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  billingCycle: BillingCycle;
  contractValue: number;
  currency: string;
  licenseCount?: number;
  paymentMethod?: PaymentMethod;
  accountManager?: string;
  notes?: string;
  renewalAlerted: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_FORM_VALUES: ContractData = {
  appId: "",
  vendor: "",
  contractNumber: "",
  status: "active",
  startDate: new Date(),
  endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
  autoRenew: false,
  billingCycle: "annual",
  contractValue: 0,
  currency: "USD",
  licenseCount: undefined,
  paymentMethod: undefined,
  accountManager: "",
  notes: "",
};

function ContractForm({
  onSuccess,
  onCancel,
  editingContract,
  initialValues,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  editingContract?: Contract;
  initialValues: ContractData;
}) {
  const { toast } = useToast();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const form = useForm<ContractData>({
    resolver: zodResolver(contractSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const createOrUpdateContract = useMutation({
    mutationFn: async (data: ContractData) => {
      const payload = {
        ...data,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
      };
      const endpoint = editingContract ? `/api/saas-contracts/${editingContract.id}` : "/api/saas-contracts";
      const method = editingContract ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saas-contracts"] });
      toast({
        title: editingContract ? "Contract updated!" : "Contract created!",
        description: editingContract
          ? "The contract has been updated successfully."
          : "A new contract has been added.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      console.error("Contract mutation error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${editingContract ? 'update' : 'create'} contract.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractData) => {
    createOrUpdateContract.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="vendor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Vendor name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contractNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Number</FormLabel>
                <FormControl>
                  <Input placeholder="CON-2024-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTRACT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date *</FormLabel>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "PPP") : "Select date"}
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
                        if (date) setStartDateOpen(false);
                      }}
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
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date *</FormLabel>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "PPP") : "Select date"}
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
                        if (date) setEndDateOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="billingCycle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Cycle *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cycle" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BILLING_CYCLE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contractValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Value *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="licenseCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License Count</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountManager"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Manager</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="autoRenew"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Auto-renew contract</FormLabel>
                <FormDescription>
                  Automatically renew this contract when it expires
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional contract notes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={createOrUpdateContract.isPending}>
            {createOrUpdateContract.isPending ? "Saving..." : editingContract ? "Update Contract" : "Create Contract"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function SaasContracts() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractFormValues, setContractFormValues] = useState<ContractData>(DEFAULT_FORM_VALUES);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = getRolePermissions(user?.role);

  const isNewContract = window.location.pathname === "/saas-contracts/new";

  // Fetch contracts
  const { data: contracts, isLoading } = useQuery({
    queryKey: ["/api/saas-contracts", selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }
      const url = `/api/saas-contracts${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await authenticatedRequest("GET", url);
      return response.json();
    },
  });

  // Fetch upcoming renewals
  const { data: renewals } = useQuery({
    queryKey: ["/api/saas-contracts/renewals"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/saas-contracts/renewals?days=90");
      return response.json();
    },
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/saas-contracts/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saas-contracts"] });
      toast({
        title: "Contract deleted!",
        description: "The contract has been removed.",
      });
    },
    onError: (error: any) => {
      console.error("Contract deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete contract.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isNewContract) {
      if (permissions.canEditVendors) {
        setShowAddForm(true);
      } else {
        toast({
          title: "Insufficient permissions",
          description: "Only IT managers and admins can create contracts.",
          variant: "destructive",
        });
        setLocation("/saas-contracts");
      }
    }
  }, [isNewContract, permissions.canEditVendors, setLocation, toast]);

  const handleAddContract = () => {
    setEditingContract(null);
    setContractFormValues({ ...DEFAULT_FORM_VALUES });
    setShowAddForm(true);
    if (!isNewContract) {
      setLocation("/saas-contracts/new");
    }
  };

  const handleEditContract = async (contract: Contract) => {
    setEditingContract(contract);
    setContractFormValues({
      appId: contract.appId || "",
      vendor: contract.vendor,
      contractNumber: contract.contractNumber || "",
      status: contract.status,
      startDate: new Date(contract.startDate),
      endDate: new Date(contract.endDate),
      autoRenew: contract.autoRenew,
      billingCycle: contract.billingCycle,
      contractValue: contract.contractValue,
      currency: contract.currency,
      licenseCount: contract.licenseCount,
      paymentMethod: contract.paymentMethod,
      accountManager: contract.accountManager || "",
      notes: contract.notes || "",
    });
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingContract(null);
    setContractFormValues({ ...DEFAULT_FORM_VALUES });
    if (isNewContract) {
      setLocation("/saas-contracts");
    }
  };

  const handleViewContract = (contract: Contract) => {
    setViewContract(contract);
    setIsViewDialogOpen(true);
  };

  const closeViewDialog = () => {
    setIsViewDialogOpen(false);
    setViewContract(null);
  };

  const getStatusBadge = (status: ContractStatus) => {
    const variants = {
      active: { variant: "default" as const, color: "text-green-500" },
      expired: { variant: "destructive" as const, color: "text-red-500" },
      cancelled: { variant: "secondary" as const, color: "text-gray-500" },
      pending: { variant: "secondary" as const, color: "text-yellow-500" },
    };
    const config = variants[status];
    return (
      <Badge variant={config.variant}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getDaysUntilExpiry = (endDate: string) => {
    const days = Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const filteredContracts = contracts?.filter((contract: Contract) =>
    contract.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contract.contractNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (showAddForm) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />

        <main className="flex-1 md:ml-64 overflow-auto">
          <TopBar
            title={editingContract ? "Edit Contract" : "Add New Contract"}
            description={editingContract
              ? "Update contract information and terms"
              : "Add a new SaaS contract to track"
            }
            showAddButton={false}
          />
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <ContractForm
                    onSuccess={handleCloseForm}
                    onCancel={handleCloseForm}
                    editingContract={editingContract || undefined}
                    initialValues={contractFormValues}
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
          title="SaaS Contracts"
          description="Manage software contracts and subscriptions"
          showAddButton={permissions.canEditVendors}
          addButtonText="Add Contract"
          onAddClick={permissions.canEditVendors ? handleAddContract : undefined}
        />
        <div className="p-6">
          {/* Renewals Alert */}
          {renewals && renewals.length > 0 && (
            <Card className="mb-6 border-yellow-500/20 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  {renewals.length} Contract{renewals.length > 1 ? 's' : ''} Expiring Soon
                </CardTitle>
                <CardDescription>
                  Contracts expiring in the next 90 days require attention
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search contracts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Contracts Grid */}
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredContracts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No contracts found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "No contracts match your search criteria"
                    : "Get started by adding your first contract"
                  }
                </p>
                {!searchTerm && permissions.canEditVendors && (
                  <Button onClick={handleAddContract}>
                    Add Your First Contract
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredContracts.map((contract: Contract) => {
                const daysUntilExpiry = getDaysUntilExpiry(contract.endDate);
                const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry > 0;

                return (
                  <Card key={contract.id} className={cn("hover:shadow-lg transition-shadow", isExpiringSoon && "border-yellow-500/20")}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            {contract.vendor}
                          </CardTitle>
                          {contract.contractNumber && (
                            <CardDescription className="mt-1">{contract.contractNumber}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewContract(contract)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {permissions.canEditVendors && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditContract(contract)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Contract</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this contract? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteContract.mutate(contract.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        {getStatusBadge(contract.status)}
                        {isExpiringSoon && (
                          <Badge variant="secondary" className="text-yellow-500 border-yellow-500/20">
                            Expires in {daysUntilExpiry} days
                          </Badge>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        ${contract.contractValue.toLocaleString()} {contract.currency}
                      </div>

                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        {format(new Date(contract.startDate), "MMM d, yyyy")} - {format(new Date(contract.endDate), "MMM d, yyyy")}
                      </div>

                      {contract.licenseCount && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Licenses:</span> {contract.licenseCount}
                        </div>
                      )}

                      {contract.autoRenew && (
                        <Badge variant="outline" className="text-xs">
                          Auto-renew enabled
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <FloatingAIAssistant />

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
        if (!open) closeViewDialog();
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewContract?.vendor || "Contract Details"}</DialogTitle>
            <DialogDescription>Complete contract information</DialogDescription>
          </DialogHeader>
          {viewContract && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Number</p>
                  <p className="font-medium">{viewContract.contractNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(viewContract.status)}</div>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Start Date</p>
                  <p className="font-medium">{format(new Date(viewContract.startDate), "PPP")}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">End Date</p>
                  <p className="font-medium">{format(new Date(viewContract.endDate), "PPP")}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Value</p>
                  <p className="font-medium">${viewContract.contractValue.toLocaleString()} {viewContract.currency}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Billing Cycle</p>
                  <p className="font-medium">{viewContract.billingCycle}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">License Count</p>
                  <p className="font-medium">{viewContract.licenseCount || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Payment Method</p>
                  <p className="font-medium">{viewContract.paymentMethod || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Account Manager</p>
                  <p className="font-medium">{viewContract.accountManager || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Auto-renew</p>
                  <p className="font-medium">{viewContract.autoRenew ? "Yes" : "No"}</p>
                </div>
              </div>

              {viewContract.notes && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{viewContract.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
