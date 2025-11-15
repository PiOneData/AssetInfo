import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { authenticatedRequest } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { Download, FileSpreadsheet, Filter, Lock } from "lucide-react";
import { exportReportToExcel } from "@/lib/report-export";

export interface ReportHistoryEntry {
  id: string;
  name: string;
  type: string;
  fields: string[];
  generatedAt: string;
  generatedBy: string;
  recordCount: number;
  size: number;
  params?: {
    type: string;
    fields: string[];
  };
}

interface ReportGeneratorProps {
  metrics: any;
  onReportGenerated?: (entry: ReportHistoryEntry) => void;
}

export function ReportGenerator({ metrics, onReportGenerated }: ReportGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [assetType, setAssetType] = useState<string>("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Available fields for selection with role requirements
  const availableFields = [
    { id: "name", label: "Asset Name", category: "basic" },
    { id: "type", label: "Asset Type", category: "basic" },
    { id: "category", label: "Category", category: "basic" },
    { id: "status", label: "Status", category: "basic" },
    { id: "serialNumber", label: "Serial Number", category: "basic" },
    { id: "manufacturer", label: "Manufacturer", category: "details" },
    { id: "model", label: "Model", category: "details" },
    { id: "location", label: "Location", category: "details" },
    { id: "assignedTo", label: "Assigned To", category: "assignment" },
    { id: "assignedDate", label: "Assigned Date", category: "assignment" },
    { id: "purchaseDate", label: "Purchase Date", category: "financial", requiredRole: "manager" },
    { id: "purchasePrice", label: "Purchase Price", category: "financial", requiredRole: "manager" },
    { id: "warrantyExpiry", label: "Warranty Expiry", category: "warranty" },
    { id: "amcExpiry", label: "AMC Expiry", category: "warranty" },
    { id: "specifications", label: "Specifications", category: "technical" },
    { id: "notes", label: "Notes", category: "other" },
    { id: "createdAt", label: "Created Date", category: "other" },
    { id: "updatedAt", label: "Last Updated", category: "other" }
  ];

  // Helper function to check if user has required role
  const hasRequiredRole = (requiredRole?: string): boolean => {
    if (!requiredRole) return true;
    const userRole = user?.role;
    if (requiredRole === "manager") {
      return userRole === "manager" || userRole === "admin";
    }
    if (requiredRole === "admin") {
      return userRole === "admin";
    }
    return true;
  };

  // Filter fields based on user role
  const accessibleFields = availableFields.filter(field => hasRequiredRole(field.requiredRole));

  const fieldCategories = [
    { id: "basic", label: "Basic Information", fields: accessibleFields.filter(f => f.category === "basic") },
    { id: "details", label: "Asset Details", fields: accessibleFields.filter(f => f.category === "details") },
    { id: "assignment", label: "Assignment Info", fields: accessibleFields.filter(f => f.category === "assignment") },
    { id: "financial", label: "Financial Data", fields: accessibleFields.filter(f => f.category === "financial") },
    { id: "warranty", label: "Warranty & AMC", fields: accessibleFields.filter(f => f.category === "warranty") },
    { id: "technical", label: "Technical Details", fields: accessibleFields.filter(f => f.category === "technical") },
    { id: "other", label: "Other", fields: accessibleFields.filter(f => f.category === "other") }
  ].filter(category => category.fields.length > 0); // Only show categories with accessible fields

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleSelectAll = () => {
    setSelectedFields(accessibleFields.map(field => field.id));
  };

  const handleSelectNone = () => {
    setSelectedFields([]);
  };

  const handleSelectBasic = () => {
    const basicFields = accessibleFields.filter(field => field.category === "basic").map(field => field.id);
    setSelectedFields(basicFields);
  };

  const generateReport = async () => {
    if (selectedFields.length === 0) {
      toast({
        title: "No fields selected",
        description: "Please select at least one field to include in the report.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Fetch report data from backend
      const params = new URLSearchParams({
        fields: selectedFields.join(','),
        type: assetType
      });

      const response = await authenticatedRequest("GET", `/api/assets/report?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const reportData = await response.json();

      if (!reportData || reportData.length === 0) {
        toast({
          title: "No data found",
          description: "No assets found matching the selected criteria.",
          variant: "destructive"
        });
        return;
      }

      // Create Excel file
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `assets-report-${timestamp}.xlsx`;

      exportReportToExcel(reportData, filename);

      toast({
        title: "Report generated successfully",
        description: `Downloaded ${filename} with ${reportData.length} records.`
      });

      const metadata: ReportHistoryEntry = {
        id: (globalThis.crypto?.randomUUID?.() ?? Date.now().toString()),
        name: `${assetType === "all" ? "All Assets" : `${assetType.charAt(0).toUpperCase()}${assetType.slice(1)}`} Report`,
        type: assetType,
        fields: selectedFields,
        generatedAt: new Date().toISOString(),
        generatedBy: user
          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Unknown"
          : "Unknown",
        recordCount: reportData.length,
        size: new TextEncoder().encode(JSON.stringify(reportData)).length,
        params: {
          type: assetType,
          fields: selectedFields,
        },
      };

      onReportGenerated?.(metadata);

      setIsOpen(false);
    } catch (error: any) {
      console.error('Report generation error:', error);
      
      const errorMessage = error?.message || "There was an error generating the report. Please try again.";
      
      toast({
        title: "Report generation failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Generate Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Create custom Excel reports with the fields you need. Choose specific asset types and data fields for detailed analysis.
        </p>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" data-testid="button-generate-report">
              <Download className="h-4 w-4 mr-2" />
              Generate Excel Report
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Generate Custom Report
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Asset Type Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assets</SelectItem>
                    <SelectItem value="hardware">Hardware</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="peripheral">Peripherals</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Field Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Select Fields to Include</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectBasic}
                      data-testid="button-select-basic"
                    >
                      Basic Fields
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      data-testid="button-select-all"
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectNone}
                      data-testid="button-select-none"
                    >
                      Select None
                    </Button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  Selected: {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''}
                </div>

                {/* Field Categories */}
                <div className="space-y-4 max-h-60 overflow-y-auto">
                  {fieldCategories.map(category => (
                    <div key={category.id} className="space-y-2">
                      <h4 className="font-medium text-sm text-foreground">{category.label}</h4>
                      <div className="grid grid-cols-2 gap-2 pl-4">
                        {category.fields.map(field => (
                          <div key={field.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={field.id}
                              checked={selectedFields.includes(field.id)}
                              onCheckedChange={() => handleFieldToggle(field.id)}
                              data-testid={`checkbox-field-${field.id}`}
                            />
                            <Label
                              htmlFor={field.id}
                              className="text-sm font-normal cursor-pointer flex items-center gap-2"
                            >
                              {field.label}
                              {field.requiredRole && (
                                <Badge variant="outline" className="text-xs">
                                  <Lock className="h-3 w-3 mr-1" />
                                  {field.requiredRole}
                                </Badge>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  data-testid="button-cancel-report"
                >
                  Cancel
                </Button>
                <Button
                  onClick={generateReport}
                  disabled={isGenerating || selectedFields.length === 0}
                  className={isGenerating ? "cursor-not-allowed opacity-50" : ""}
                  data-testid="button-download-report"
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Generating...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Download Excel Report
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
