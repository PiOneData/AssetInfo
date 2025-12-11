/**
 * Phase 5: Role Template Management
 *
 * UI for managing role-based access templates:
 * - Create/edit role templates
 * - Define expected apps per role
 * - Assign templates to users
 * - View pre-built templates
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import {
  Briefcase,
  Plus,
  Edit,
  Trash2,
  Users,
  CheckCircle,
  AppWindow,
} from "lucide-react";

interface RoleTemplate {
  id: string;
  name: string;
  description?: string;
  department?: string;
  level?: string;
  expectedApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    required: boolean;
  }>;
  userCount: number;
  createdAt: string;
}

interface SaasApp {
  id: string;
  name: string;
  category?: string;
}

export default function RoleTemplatesPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const permissions = user ? getRolePermissions(user.role) : {};

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RoleTemplate | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Form state
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [selectedApps, setSelectedApps] = useState<Array<{
    appId: string;
    appName: string;
    accessType: string;
    required: boolean;
  }>>([]);

  // Fetch role templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["role-templates"],
    queryFn: async () => {
      const res = await authenticatedRequest("/api/role-templates");
      return res.templates as RoleTemplate[];
    },
  });

  // Fetch pre-built templates
  const { data: prebuiltTemplates } = useQuery({
    queryKey: ["role-templates-prebuilt"],
    queryFn: async () => {
      const res = await authenticatedRequest("/api/role-templates/prebuilt");
      return res.templates as RoleTemplate[];
    },
  });

  // Fetch SaaS apps for template creation
  const { data: apps } = useQuery({
    queryKey: ["saas-apps-all"],
    queryFn: async () => {
      const res = await authenticatedRequest("/api/saas-apps");
      return res.apps as SaasApp[];
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template: any) => {
      return authenticatedRequest("/api/role-templates", {
        method: "POST",
        body: JSON.stringify(template),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] });
      toast({
        title: "Success",
        description: "Role template created successfully",
      });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, template }: { id: string; template: any }) => {
      return authenticatedRequest(`/api/role-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(template),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] });
      toast({
        title: "Success",
        description: "Role template updated successfully",
      });
      setEditingTemplate(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return authenticatedRequest(`/api/role-templates/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] });
      toast({
        title: "Success",
        description: "Role template deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTemplateName("");
    setTemplateDescription("");
    setDepartment("");
    setLevel("");
    setSelectedApps([]);
  };

  const handleCreateTemplate = () => {
    if (!templateName || selectedApps.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide template name and at least one app",
        variant: "destructive",
      });
      return;
    }

    createTemplateMutation.mutate({
      name: templateName,
      description: templateDescription,
      department,
      level,
      expectedApps: selectedApps,
    });
  };

  const handleUpdateTemplate = () => {
    if (!editingTemplate) return;

    updateTemplateMutation.mutate({
      id: editingTemplate.id,
      template: {
        name: templateName,
        description: templateDescription,
        department,
        level,
        expectedApps: selectedApps,
      },
    });
  };

  const handleEditTemplate = (template: RoleTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setDepartment(template.department || "");
    setLevel(template.level || "");
    setSelectedApps(template.expectedApps);
  };

  const handleAddApp = (appId: string) => {
    const app = apps?.find(a => a.id === appId);
    if (!app) return;

    setSelectedApps([
      ...selectedApps,
      {
        appId: app.id,
        appName: app.name,
        accessType: "user",
        required: true,
      },
    ]);
  };

  const handleRemoveApp = (appId: string) => {
    setSelectedApps(selectedApps.filter(a => a.appId !== appId));
  };

  const handleToggleRequired = (appId: string) => {
    setSelectedApps(
      selectedApps.map(a =>
        a.appId === appId ? { ...a, required: !a.required } : a
      )
    );
  };

  const handleChangeAccessType = (appId: string, accessType: string) => {
    setSelectedApps(
      selectedApps.map(a =>
        a.appId === appId ? { ...a, accessType } : a
      )
    );
  };

  const getRiskBadge = (userCount: number) => {
    if (userCount === 0) return <Badge variant="outline">Unused</Badge>;
    if (userCount < 5) return <Badge variant="secondary">{userCount} users</Badge>;
    return <Badge variant="default">{userCount} users</Badge>;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-8 h-8" />
                  Role Templates
                </h1>
                <p className="text-gray-600 mt-1">
                  Define expected applications per role for privilege drift detection
                </p>
              </div>
              {permissions.canCreateAssets && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Template
                </Button>
              )}
            </div>

            {/* Pre-built Templates */}
            {prebuiltTemplates && prebuiltTemplates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pre-built Templates</CardTitle>
                  <CardDescription>
                    Start with these common role templates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {prebuiltTemplates.map((template) => (
                      <Card key={template.id} className="border-blue-200 bg-blue-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <CardDescription className="text-sm">
                                {template.department} • {template.level}
                              </CardDescription>
                            </div>
                            <Badge variant="secondary">Pre-built</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <AppWindow className="w-4 h-4" />
                            <span>{template.expectedApps.length} apps</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Custom Templates */}
            <Card>
              <CardHeader>
                <CardTitle>Custom Templates</CardTitle>
                <CardDescription>
                  Your organization's role templates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading templates...</div>
                ) : templates && templates.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map((template) => (
                      <Card key={template.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <CardDescription className="text-sm">
                                {template.department && template.level
                                  ? `${template.department} • ${template.level}`
                                  : template.department || template.level || "No department"}
                              </CardDescription>
                            </div>
                            {getRiskBadge(template.userCount)}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <AppWindow className="w-4 h-4" />
                              <span>{template.expectedApps.length} apps</span>
                              <span className="text-gray-400">•</span>
                              <span>
                                {template.expectedApps.filter(a => a.required).length} required
                              </span>
                            </div>
                            {permissions.canEditAssets && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditTemplate(template)}
                                  className="flex-1"
                                >
                                  <Edit className="w-3 h-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No custom templates yet. Create one to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create/Edit Template Dialog */}
      <Dialog
        open={createDialogOpen || editingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Role Template" : "Create Role Template"}
            </DialogTitle>
            <DialogDescription>
              Define the expected applications for this role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Software Engineer"
                />
              </div>
              <div>
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Engineering"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="level">Level</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="mid">Mid-Level</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div>
              <Label>Expected Applications *</Label>
              <div className="mt-2 space-y-2">
                {selectedApps.map((app) => (
                  <div
                    key={app.appId}
                    className="flex items-center gap-2 p-2 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{app.appName}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Select
                          value={app.accessType}
                          onValueChange={(value) =>
                            handleChangeAccessType(app.appId, value)
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant={app.required ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleRequired(app.appId)}
                        >
                          {app.required ? "Required" : "Optional"}
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveApp(app.appId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Select onValueChange={handleAddApp}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add application..." />
                  </SelectTrigger>
                  <SelectContent>
                    {apps
                      ?.filter(
                        (app) => !selectedApps.find((a) => a.appId === app.id)
                      )
                      .map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setEditingTemplate(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
            >
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloatingAIAssistant />
    </div>
  );
}
