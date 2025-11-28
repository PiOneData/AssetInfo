import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LocationSelector } from "@/components/ui/location-selector";
import type { ComplianceAssetSummary } from "@/hooks/use-compliance";

type FieldType = "text" | "email" | "date" | "textarea";

interface FieldDefinition {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  helper?: string;
  alwaysShow?: boolean;
}

const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  notes: { key: "notes", label: "Internal Notes", type: "textarea" },
  assignedUserName: { key: "assignedUserName", label: "Assigned User Name" },
  assignedUserEmail: { key: "assignedUserEmail", label: "Assigned User Email", type: "email" },
  assignedUserEmployeeId: { key: "assignedUserEmployeeId", label: "Employee ID" },
  city: { key: "city", label: "City" },
  state: { key: "state", label: "State / Province" },
  country: { key: "country", label: "Country" },
  warrantyExpiry: { key: "warrantyExpiry", label: "Warranty Expiry", type: "date" },
  purchaseDate: { key: "purchaseDate", label: "Purchase Date", type: "date" },
  licenseType: { key: "licenseType", label: "License Type" },
  licenseKey: { key: "licenseKey", label: "License Key" },
  osVersion: { key: "osVersion", label: "OS Version" },
  status: { key: "status", label: "Asset Status" },
};

type IssueMatch = (issueKey?: string, context?: RemediationContext) => boolean;

interface IssueRule {
  match: IssueMatch;
  fields: string[];
}

const ISSUE_RULES: IssueRule[] = [
  {
    match: (key, ctx) =>
      key === "missinguser" ||
      ctx?.riskFactors?.some((factor) => factor.toLowerCase().includes("owner")),
    fields: ["assignedUserName", "assignedUserEmail", "assignedUserEmployeeId"],
  },
  {
    match: (key, ctx) =>
      key === "missinglocation" ||
      ctx?.riskFactors?.some((factor) => factor.toLowerCase().includes("location")),
    fields: ["__location_selector__"],
  },
  {
    match: (key) => key === "nowarranty" || key === "expiredwarranty",
    fields: ["warrantyExpiry"],
  },
  {
    match: (key) => key === "unlicensedsoftware",
    fields: ["licenseType", "licenseKey"],
  },
  {
    match: (key, ctx) =>
      key === "outdatedos" ||
      ctx?.riskFactors?.some((factor) => factor.toLowerCase().includes("os")),
    fields: ["osVersion"],
  },
  {
    match: (key, ctx) =>
      key === "expiredwarranty" ||
      ctx?.riskFactors?.some((factor) => factor.toLowerCase().includes("expired warranty")),
    fields: ["purchaseDate", "warrantyExpiry"],
  },
  {
    match: (key) => key === "duplicateassignments",
    fields: ["assignedUserName", "assignedUserEmail"],
  },
  {
    match: (key) => key === "idleassets",
    fields: ["status"],
  },
  {
    match: (key) => key === "missingpatches",
    fields: ["notes"],
  },
];

export interface RemediationContext {
  issueKey?: string; // legacy support
  issueLabel?: string;
  issueKeys?: string[];
  issueLabels?: string[];
  primaryIssueKey?: string;
  primaryLabel?: string;
  summary: ComplianceAssetSummary;
  asset?: any;
  riskFactors?: string[];
  fromHighRisk?: boolean;
}

interface RemediationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RemediationContext | null;
  isSubmitting?: boolean;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
}

function getFieldValue(key: string, summary: ComplianceAssetSummary, asset?: any) {
  if (key in (asset || {})) return asset[key];
  if (key in summary) return (summary as any)[key];
  if (asset?.specifications) {
    const specs = asset.specifications;
    if (key === "osVersion") {
      return specs.agent?.osVersion || specs.openaudit?.osVersion || specs.openaudit?.os?.version;
    }
  }
  if (key === "notes") return asset?.notes;
  return undefined;
}

function determineFields(context: RemediationContext | null) {
  const combinedIssueKeys = [
    ...(context?.issueKeys || []),
    ...(context?.issueKey ? [context.issueKey] : []),
  ].filter(Boolean);
  if (!combinedIssueKeys.length) return [];
  const { summary, asset, riskFactors } = context!;
  const selected: FieldDefinition[] = [];
  const normalizedKeys = Array.from(
    new Set(combinedIssueKeys.map((key) => key.toLowerCase()))
  );

  normalizedKeys.forEach((issueKey) => {
    ISSUE_RULES.forEach((rule) => {
      if (rule.match(issueKey, { ...context, riskFactors })) {
        rule.fields.forEach((fieldKey) => {
          if (fieldKey === "__location_selector__") {
            if (!selected.find((f) => f.key === fieldKey)) {
              selected.push({ key: fieldKey, label: "Location" });
            }
            return;
          }
          const def = FIELD_DEFINITIONS[fieldKey];
          if (!def) return;
          const value = getFieldValue(fieldKey, summary, asset);
          const needsRemediation =
            def.alwaysShow ||
            value === null ||
            value === undefined ||
            value === "" ||
            (fieldKey === "warrantyExpiry" && issueKey === "expiredwarranty");
          if (needsRemediation && !selected.find((f) => f.key === fieldKey)) {
            selected.push({ ...def, key: fieldKey });
          }
        });
      }
    });
  });

  const deduped = Array.from(
    new Map(selected.map((field) => [field.key, field])).values()
  );
  return deduped;
}

export function RemediationModal({
  open,
  onOpenChange,
  context,
  isSubmitting,
  onSubmit,
}: RemediationModalProps) {
  const fields = useMemo(() => determineFields(context), [context]);
  const displayedFields = fields.length ? fields : [{ ...FIELD_DEFINITIONS.notes }];
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [locationState, setLocationState] = useState<{ country?: string; state?: string; city?: string }>({});

  useEffect(() => {
    if (!context) return;
    const initial: Record<string, string> = {};
    displayedFields.forEach((field) => {
      if (field.key === "__location_selector__") return;
      const raw = getFieldValue(field.key, context.summary, context.asset);
      if (raw instanceof Date) {
        initial[field.key] = raw.toISOString().split("T")[0];
      } else if (field.type === "date" && raw) {
        const date = new Date(raw);
        initial[field.key] = Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
      } else {
        initial[field.key] = raw ?? "";
      }
    });
    setFormState(initial);
    const asset = context.asset;
    setLocationState({
      country: asset?.country || undefined,
      state: asset?.state || undefined,
      city: asset?.city || undefined,
    });
  }, [context, displayedFields]);

  const handleChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context || displayedFields.length === 0) return;
    const payload: Record<string, any> = {};
    displayedFields.forEach((field) => {
      if (field.key === "__location_selector__") {
        payload.country = locationState.country ?? null;
        payload.state = locationState.state ?? null;
        payload.city = locationState.city ?? null;
        return;
      }
      const value = formState[field.key];
      if (field.type === "date") {
        payload[field.key] = value ? new Date(value).toISOString() : null;
      } else {
        payload[field.key] = value ?? null;
      }
    });
    await onSubmit(payload);
  };

  const assetName = context?.summary?.name || "Asset";
  const issueLabel =
    context?.primaryLabel ||
    context?.issueLabel ||
    context?.issueLabels?.[0] ||
    context?.issueKeys?.[0] ||
    context?.issueKey ||
    "Issue";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Resolve Issue: {issueLabel.replace(/([A-Z])/g, " $1").trim()} – {assetName}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {displayedFields.map((field) => {
            const commonInputProps = {
              id: field.key,
              value: formState[field.key] ?? "",
              onChange: handleChange(field.key),
            };
            return (
              <div key={field.key} className="space-y-1">
                {field.key === "__location_selector__" ? (
                  <>
                    <label className="text-sm font-medium text-foreground">Location</label>
                    <LocationSelector
                      country={locationState.country}
                      state={locationState.state}
                      city={locationState.city}
                      onLocationChange={(loc) => setLocationState((prev) => ({ ...prev, ...loc }))}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor={field.key} className="text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    {field.type === "textarea" ? (
                      <Textarea {...commonInputProps} placeholder={field.placeholder} className="h-24" />
                    ) : (
                      <Input
                        {...commonInputProps}
                        type={field.type === "date" ? "date" : field.type || "text"}
                        placeholder={field.placeholder}
                      />
                    )}
                    {field.helper && <p className="text-xs text-muted-foreground">{field.helper}</p>}
                  </>
                )}
              </div>
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Submit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
