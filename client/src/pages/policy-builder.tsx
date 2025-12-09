import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authenticatedRequest } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Plus, Trash2, Zap, Save, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const TRIGGER_TYPES = [
  { value: "app_discovered", label: "App Discovered", description: "When a new SaaS app is detected via Shadow IT" },
  { value: "license_unused", label: "License Unused", description: "When a license has been inactive for N days" },
  { value: "oauth_risky_permission", label: "Risky OAuth Permission", description: "When an app requests high-risk permissions" },
  { value: "user_offboarded", label: "User Offboarded", description: "When a user offboarding is completed" },
  { value: "renewal_approaching", label: "Renewal Approaching", description: "When a contract renewal is coming up" },
  { value: "budget_exceeded", label: "Budget Exceeded", description: "When department spending exceeds threshold" },
];

const ACTION_TYPES = [
  { value: "send_alert", label: "Send Alert", description: "Send notification via email/Slack" },
  { value: "create_ticket", label: "Create Ticket", description: "Create a support/IT ticket" },
  { value: "block_app", label: "Block App", description: "Block access to an application" },
  { value: "revoke_access", label: "Revoke Access", description: "Revoke user access to an app" },
  { value: "reclaim_license", label: "Reclaim License", description: "Remove and reassign a license" },
  { value: "notify_department_head", label: "Notify Department Head", description: "Alert the department manager" },
];

const policySchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  description: z.string().optional(),
  triggerType: z.string().min(1, "Trigger type is required"),
  triggerConfig: z.record(z.any()).default({}),
  conditions: z.record(z.any()).optional(),
  actions: z.array(z.object({
    type: z.string(),
    config: z.record(z.any()).default({}),
  })).min(1, "At least one action is required"),
  cooldownMinutes: z.number().min(0).optional(),
  maxExecutionsPerDay: z.number().min(1).optional(),
  requireApproval: z.boolean().default(false),
});

type PolicyFormData = z.infer<typeof policySchema>;

export default function PolicyBuilderPage() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();

  const [actions, setActions] = useState<Array<{ type: string; config: Record<string, any> }>>([
    { type: "", config: {} },
  ]);

  const form = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: "",
      description: "",
      triggerType: "",
      triggerConfig: {},
      conditions: {},
      actions: [],
      cooldownMinutes: 0,
      maxExecutionsPerDay: undefined,
      requireApproval: false,
    },
  });

  // Load template if provided
  const templateId = new URLSearchParams(searchParams).get("template");
  const { data: template } = useQuery({
    queryKey: ["policy-template", templateId],
    queryFn: () => authenticatedRequest(`/api/policy-templates/${templateId}`),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (template) {
      form.setValue("name", template.name);
      form.setValue("description", template.description);
      form.setValue("triggerType", template.triggerType);
      form.setValue("triggerConfig", template.triggerConfig || {});
      form.setValue("conditions", template.conditions || {});
      form.setValue("actions", template.actions || []);
      setActions(template.actions || [{ type: "", config: {} }]);
    }
  }, [template, form]);

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (data: PolicyFormData) => {
      return authenticatedRequest("/api/policies", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ title: "Success", description: "Policy created successfully" });
      setLocation("/policy-automation");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create policy", variant: "destructive" });
    },
  });

  const onSubmit = (data: PolicyFormData) => {
    // Filter out empty actions
    const validActions = actions.filter(a => a.type);
    if (validActions.length === 0) {
      toast({ title: "Error", description: "Please add at least one action", variant: "destructive" });
      return;
    }

    createPolicyMutation.mutate({
      ...data,
      actions: validActions,
    });
  };

  const addAction = () => {
    setActions([...actions, { type: "", config: {} }]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, field: "type" | "config", value: any) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], [field]: value };
    setActions(updated);
    form.setValue("actions", updated);
  };

  const selectedTrigger = TRIGGER_TYPES.find(t => t.value === form.watch("triggerType"));

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/policy-automation")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Policies
            </Button>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">
                {templateId ? "Create Policy from Template" : "Create New Policy"}
              </h1>
            </div>
            <p className="text-muted-foreground">
              Build self-healing automation policies with IF-THEN logic
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Basic Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Give your policy a name and description</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Policy Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Block Unapproved Apps" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe what this policy does and when it should trigger"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Trigger Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle>IF - Trigger Event</CardTitle>
                      <CardDescription>When should this policy execute?</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="triggerType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trigger Type *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a trigger event" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TRIGGER_TYPES.map((trigger) => (
                                  <SelectItem key={trigger.value} value={trigger.value}>
                                    {trigger.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {selectedTrigger?.description}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch("triggerType") && (
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm text-blue-900">
                            <AlertTriangle className="inline h-4 w-4 mr-1" />
                            Trigger configuration depends on the selected trigger type. Advanced configuration can be added in the JSON editor.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Actions Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle>THEN - Actions</CardTitle>
                      <CardDescription>What should happen when the policy triggers?</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {actions.map((action, index) => (
                        <div key={index} className="flex items-start gap-2 p-4 border rounded-lg">
                          <div className="flex-1 space-y-3">
                            <Label>Action {index + 1}</Label>
                            <Select
                              value={action.type}
                              onValueChange={(value) => updateAction(index, "type", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an action" />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTION_TYPES.map((actionType) => (
                                  <SelectItem key={actionType.value} value={actionType.value}>
                                    {actionType.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {action.type && (
                              <p className="text-sm text-muted-foreground">
                                {ACTION_TYPES.find(a => a.value === action.type)?.description}
                              </p>
                            )}
                          </div>
                          {actions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAction(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}

                      <Button type="button" variant="outline" onClick={addAction} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Action
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Settings Sidebar */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Policy Settings</CardTitle>
                      <CardDescription>Configure execution limits and approvals</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="cooldownMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cooldown (minutes)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                placeholder="0"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormDescription>
                              Minimum time between executions
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="maxExecutionsPerDay"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Executions/Day</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="Unlimited"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </FormControl>
                            <FormDescription>
                              Daily execution limit
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="requireApproval"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Require Approval</FormLabel>
                              <FormDescription>
                                Actions need manual approval
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createPolicyMutation.isPending}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {createPolicyMutation.isPending ? "Creating..." : "Create Policy"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </form>
          </Form>
        </main>
      </div>
      <FloatingAIAssistant />
    </div>
  );
}
