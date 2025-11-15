import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { authenticatedRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRolePermissions } from "@/lib/permissions";
import { 
  type UpdateUserProfile, 
  type UpdateUserPreferences, 
  type UpdateOrgSettings,
  type User as UserType,
  type UserPreferences,
  changePasswordSchema
} from "@shared/schema";
import { 
  Settings, 
  User, 
  Bell, 
  Shield, 
  Database, 
  Key,
  Users,
  Building,
  Save,
  AlertTriangle,
  ChevronDown
} from "lucide-react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, tenant, logout } = useAuth();
  const permissions = getRolePermissions(user?.role);

  // Fetch user profile data
  const { data: userProfile, isLoading: userProfileLoading, error: userProfileError } = useQuery<UserType>({
    queryKey: ["/api/users/me"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/users/me");
      return response.json();
    },
  });

  // Fetch user preferences data
  const { data: userPreferences, isLoading: userPreferencesLoading, error: userPreferencesError } = useQuery<UserPreferences>({
    queryKey: ["/api/users/me/preferences"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/users/me/preferences");
      return response.json();
    },
  });

  // Fetch organization settings data  
  const { data: orgSettings, isLoading: orgSettingsLoading, error: orgSettingsError } = useQuery({
    queryKey: ["/api/org/settings"],
    queryFn: async () => {
      const response = await authenticatedRequest("GET", "/api/org/settings");
      return response.json();
    },
    enabled: permissions.canAccessOrgSettings,
  });

  // Local form state
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    department: "",
    jobTitle: "",
    manager: "",
  });

  const [preferencesForm, setPreferencesForm] = useState({
    emailNotifications: false,
    pushNotifications: false,
    aiRecommendationAlerts: false,
    weeklyReports: false,
    assetExpiryAlerts: false,
    theme: "light" as "light" | "dark" | "auto",
    language: "en",
    timezone: "UTC",
    dateFormat: "MM/DD/YYYY",
    itemsPerPage: 25,
  });

  const [orgForm, setOrgForm] = useState({
    name: "",
    timezone: "UTC", 
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    autoRecommendations: false,
    dataRetentionDays: 365,
  });

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isFinalDeleteConfirmOpen, setIsFinalDeleteConfirmOpen] = useState(false);

  // Change password dialog state
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // Change password form
  const changePasswordForm = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Update local state when API data loads
  useEffect(() => {
    if (userProfile) {
      setProfileForm({
        firstName: userProfile.firstName || "",
        lastName: userProfile.lastName || "",
        phone: userProfile.phone || "",
        department: userProfile.department || "",
        jobTitle: userProfile.jobTitle || "",
        manager: userProfile.manager || "",
      });
    }
  }, [userProfile]);

  useEffect(() => {
    if (userPreferences) {
      setPreferencesForm({
        emailNotifications: userPreferences.emailNotifications || false,
        pushNotifications: userPreferences.pushNotifications || false,
        aiRecommendationAlerts: userPreferences.aiRecommendationAlerts || false,
        weeklyReports: userPreferences.weeklyReports || false,
        assetExpiryAlerts: userPreferences.assetExpiryAlerts || false,
        theme: (userPreferences.theme as "light" | "dark" | "auto") || "light",
        language: userPreferences.language || "en",
        timezone: userPreferences.timezone || "UTC",
        dateFormat: userPreferences.dateFormat || "MM/DD/YYYY",
        itemsPerPage: userPreferences.itemsPerPage || 25,
      });
    }
  }, [userPreferences]);

  useEffect(() => {
    if (orgSettings) {
      setOrgForm({
        name: orgSettings.name || "",
        timezone: orgSettings.timezone || "UTC",
        currency: orgSettings.currency || "USD",
        dateFormat: orgSettings.dateFormat || "MM/DD/YYYY",
        autoRecommendations: orgSettings.autoRecommendations || false,
        dataRetentionDays: orgSettings.dataRetentionDays || 365,
      });
    }
  }, [orgSettings]);

  // Update user profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateUserProfile) => {
      const response = await authenticatedRequest("PATCH", "/api/users/me", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update user preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: UpdateUserPreferences) => {
      const response = await authenticatedRequest("PATCH", "/api/users/me/preferences", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/preferences"] });
      toast({
        title: "Preferences updated",
        description: "Your preferences have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update organization settings mutation
  const updateOrgSettingsMutation = useMutation({
    mutationFn: async (data: UpdateOrgSettings) => {
      const response = await authenticatedRequest("PATCH", "/api/org/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      toast({
        title: "Organization settings updated",
        description: "Organization settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update organization settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      // Map frontend field name to backend expected field name
      const requestData = {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmNewPassword: data.confirmPassword, // Backend expects confirmNewPassword
      };
      const response = await authenticatedRequest("POST", "/api/users/me/change-password", requestData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      changePasswordForm.reset();
      setIsChangePasswordOpen(false);
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedRequest("DELETE", "/api/users/me");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account has been removed. We'll redirect you to sign in again.",
      });
      setIsFinalDeleteConfirmOpen(false);
      setIsDeleteConfirmOpen(false);
      logout();
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    },
    onError: () => {
      toast({
        title: "Unable to delete account",
        description: "Please try again or contact your administrator.",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(profileForm);
  };

  const handleSavePreferences = () => {
    updatePreferencesMutation.mutate(preferencesForm);
  };

  const handleSaveOrgSettings = () => {
    updateOrgSettingsMutation.mutate(orgForm);
  };

  const handleChangePassword = (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    changePasswordMutation.mutate(data);
  };

  return (
    <div className="flex h-screen bg-background page-enter">
      <Sidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <TopBar 
          title="Settings" 
          description="Manage your account, organization, and application preferences"
          showAddButton={false}
        />
        
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2" data-testid="page-title">
                <Settings className="h-8 w-8" />
                Settings
              </h1>
              <p className="text-muted-foreground">
                Manage your account, organization, and application preferences
              </p>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className={`grid w-full ${permissions.canAccessOrgSettings ? "grid-cols-4" : "grid-cols-3"}`}>
                <TabsTrigger value="profile" className="flex items-center gap-2" data-testid="tab-profile">
                  <User className="h-4 w-4" />
                  Profile
                </TabsTrigger>
                {permissions.canAccessOrgSettings && (
                  <TabsTrigger value="organization" className="flex items-center gap-2" data-testid="tab-organization">
                    <Building className="h-4 w-4" />
                    Organization
                  </TabsTrigger>
                )}
                <TabsTrigger value="notifications" className="flex items-center gap-2" data-testid="tab-notifications">
                  <Bell className="h-4 w-4" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center gap-2" data-testid="tab-security">
                  <Shield className="h-4 w-4" />
                  Security
                </TabsTrigger>
              </TabsList>

              {/* Profile Settings */}
              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {userProfileLoading ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Skeleton className="h-4 w-20 mb-2" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                          <div>
                            <Skeleton className="h-4 w-20 mb-2" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                        </div>
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                              id="firstName"
                              value={profileForm.firstName}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                              data-testid="input-first-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                              id="lastName"
                              value={profileForm.lastName}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                              data-testid="input-last-name"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                              id="phone"
                              value={profileForm.phone}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                              data-testid="input-phone"
                            />
                          </div>
                          <div>
                            <Label htmlFor="department">Department</Label>
                            <Input
                              id="department"
                              value={profileForm.department}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, department: e.target.value }))}
                              data-testid="input-department"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="jobTitle">Job Title</Label>
                            <Input
                              id="jobTitle"
                              value={profileForm.jobTitle}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, jobTitle: e.target.value }))}
                              data-testid="input-job-title"
                            />
                          </div>
                          <div>
                            <Label htmlFor="manager">Manager</Label>
                            <Input
                              id="manager"
                              value={profileForm.manager}
                              onChange={(e) => setProfileForm(prev => ({ ...prev, manager: e.target.value }))}
                              data-testid="input-manager"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4">
                          <div>
                            <p className="font-medium">Current Role</p>
                            <Badge variant="secondary" data-testid="badge-user-role">
                              {user?.role}
                            </Badge>
                          </div>
                          <Button 
                            onClick={handleSaveProfile} 
                            disabled={updateProfileMutation.isPending} 
                            data-testid="button-save-profile"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Organization Settings */}
              {permissions.canAccessOrgSettings && (
              <TabsContent value="organization" className="space-y-6">
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        Organization Settings
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Manage organization details and policies
                      </p>
                      {!permissions.canEditOrgSettings && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Only super admins can modify organization settings.
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Tenant ID: {tenant?.id}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {orgSettingsLoading ? (
                      <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <div className="grid grid-cols-2 gap-4">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                        <Skeleton className="h-6 w-full" />
                      </div>
                    ) : orgSettingsError ? (
                      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                        <p className="text-sm text-destructive">
                          Unable to load organization settings. Please try again later.
                        </p>
                      </div>
                    ) : (
                      <fieldset disabled={!permissions.canEditOrgSettings} className="space-y-4">
                        <div>
                          <Label htmlFor="orgName">Organization Name</Label>
                          <Input
                            id="orgName"
                            value={orgForm.name}
                            onChange={(e) => setOrgForm(prev => ({ ...prev, name: e.target.value }))}
                            data-testid="input-org-name"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="timezone">Timezone</Label>
                            <Select value={orgForm.timezone} onValueChange={(value) => setOrgForm(prev => ({ ...prev, timezone: value }))}>
                              <SelectTrigger data-testid="select-timezone">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UTC">UTC</SelectItem>
                                <SelectItem value="EST">EST</SelectItem>
                                <SelectItem value="PST">PST</SelectItem>
                                <SelectItem value="GMT">GMT</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label htmlFor="currency">Currency</Label>
                            <Select value={orgForm.currency} onValueChange={(value) => setOrgForm(prev => ({ ...prev, currency: value }))}>
                              <SelectTrigger data-testid="select-currency">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                                <SelectItem value="INR">INR</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-4">
                          <div className="space-y-1">
                            <Label htmlFor="autoRecommendations">Auto-generate AI Recommendations</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically generate optimization recommendations weekly
                            </p>
                          </div>
                          <Switch
                            id="autoRecommendations"
                            checked={orgForm.autoRecommendations}
                            onCheckedChange={(checked) => setOrgForm(prev => ({ ...prev, autoRecommendations: checked }))}
                            data-testid="switch-auto-recommendations"
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            onClick={handleSaveOrgSettings} 
                            disabled={updateOrgSettingsMutation.isPending || !permissions.canEditOrgSettings} 
                            data-testid="button-save-org"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {updateOrgSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </fieldset>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              {/* Notifications Settings */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Notification Preferences
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {userPreferencesLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-48" />
                            </div>
                            <Skeleton className="h-6 w-12" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {Object.entries({
                          emailNotifications: "Email Notifications",
                          pushNotifications: "Push Notifications", 
                          aiRecommendations: "AI Recommendation Alerts",
                          weeklyReports: "Weekly Reports"
                        }).map(([key, label]) => (
                          <div key={key} className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label htmlFor={key}>{label}</Label>
                              <p className="text-sm text-muted-foreground">
                                Receive {label.toLowerCase()} about important updates
                              </p>
                            </div>
                            <Switch
                              id={key}
                              checked={preferencesForm[key as keyof typeof preferencesForm] as boolean}
                              onCheckedChange={(checked) => setPreferencesForm(prev => ({
                                ...prev,
                                [key]: checked
                              }))}
                              data-testid={`switch-${key}-notifications`}
                            />
                          </div>
                        ))}
                        
                        <div className="flex justify-end pt-4">
                          <Button 
                            onClick={handleSavePreferences} 
                            disabled={updatePreferencesMutation.isPending} 
                            data-testid="button-save-preferences"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {updatePreferencesMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Settings */}
              <TabsContent value="security" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Security Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <p className="font-medium">Change Password</p>
                          <p className="text-sm text-muted-foreground">
                            Update your account password
                          </p>
                        </div>
                        <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" data-testid="button-change-password">
                              <Key className="h-4 w-4 mr-2" />
                              Change Password
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Change Password</DialogTitle>
                            </DialogHeader>
                            <Form {...changePasswordForm}>
                              <form onSubmit={changePasswordForm.handleSubmit(handleChangePassword)} className="space-y-4">
                                <FormField
                                  control={changePasswordForm.control}
                                  name="currentPassword"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Current Password</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="password"
                                          placeholder="Enter your current password"
                                          {...field}
                                          data-testid="input-current-password"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={changePasswordForm.control}
                                  name="newPassword"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>New Password</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="password"
                                          placeholder="Enter your new password"
                                          {...field}
                                          data-testid="input-new-password"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={changePasswordForm.control}
                                  name="confirmPassword"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Confirm New Password</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="password"
                                          placeholder="Confirm your new password"
                                          {...field}
                                          data-testid="input-confirm-password"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsChangePasswordOpen(false)}
                                    data-testid="button-cancel-password-change"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="submit"
                                    disabled={changePasswordMutation.isPending}
                                    data-testid="button-submit-password-change"
                                  >
                                    {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                                  </Button>
                                </div>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <p className="font-medium">Two-Factor Authentication</p>
                          <p className="text-sm text-muted-foreground">
                            Add an extra layer of security to your account
                          </p>
                        </div>
                        <Button variant="outline" data-testid="button-setup-2fa">
                          <Shield className="h-4 w-4 mr-2" />
                          Setup 2FA
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <p className="font-medium">API Keys</p>
                          <p className="text-sm text-muted-foreground">
                            Manage your API keys for integrations
                          </p>
                        </div>
                        <Button variant="outline" data-testid="button-manage-api-keys">
                          <Key className="h-4 w-4 mr-2" />
                          Manage Keys
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <Collapsible
                        open={isAdvancedOpen}
                        onOpenChange={setIsAdvancedOpen}
                        className="rounded-lg border border-border/60 bg-muted/10 p-4"
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                          <div>
                            <p className="text-sm font-medium text-foreground">Advanced</p>
                            <p className="text-xs text-muted-foreground">
                              Reveal sensitive account actions
                            </p>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4 space-y-4">
                          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-1">
                                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                                  <AlertTriangle className="h-4 w-4" />
                                  Delete Account
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Permanently deactivate your login. This action cannot be undone.
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() => setIsDeleteConfirmOpen(true)}
                                data-testid="button-delete-account"
                              >
                                Delete My Account
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Only your personal access will be removed. Organization data and other team members remain unaffected.
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
      
      {/* Global Floating AI Assistant */}
      <FloatingAIAssistant />

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate your AssetNext account and sign you out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setIsDeleteConfirmOpen(false);
              setIsFinalDeleteConfirmOpen(true);
            }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isFinalDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (deleteAccountMutation.isPending) return;
          setIsFinalDeleteConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This action is irreversible. Proceed?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting your account cannot be undone. All personal access will be removed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccountMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteAccountMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Yes, delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
