export const CONTROL_WEIGHTS = {
  assets_with_owner: 20,
  assets_with_location: 10,
  valid_warranty: 15,
  licensed_software: 20,
  up_to_date_os: 10,
  security_patches: 15,
  no_duplicates: 5,
  idle_assets: 5,
} as const;

export const CONTROL_LABELS: Record<ControlKey, string> = {
  assets_with_owner: "Owner Assignment",
  assets_with_location: "Location Coverage",
  valid_warranty: "Warranty Protection",
  licensed_software: "Software Licensing",
  up_to_date_os: "Supported Operating Systems",
  security_patches: "Security Patch Status",
  no_duplicates: "Unique Device Assignments",
  idle_assets: "Active Asset Utilization",
};

export type ControlKey = keyof typeof CONTROL_WEIGHTS;

export interface WeightedScoreInputs {
  totalAssets: number;
  ownerAssigned: number;
  locationAssigned: number;
  warrantyCovered: number;
  softwareLicensedDevices: number;
  softwareDeviceTotal: number;
  supportedOsDevices: number;
  patchCompliantDevices: number;
  uniqueAssignmentDevices: number;
  activelyUtilizedDevices: number;
}

export interface ControlBreakdownEntry {
  passed: number;
  total: number;
  weight: number;
  score: number;
  current?: number;
}

export type ComplianceBreakdown = {
  assets_with_owner: ControlBreakdownEntry;
  assets_with_location: ControlBreakdownEntry;
  valid_warranty: ControlBreakdownEntry;
  licensed_software: ControlBreakdownEntry;
  up_to_date_os: ControlBreakdownEntry;
  security_patches: ControlBreakdownEntry;
  no_duplicates: ControlBreakdownEntry;
  idle_assets: ControlBreakdownEntry;
};

export interface WeightedBreakdownEntry {
  key: ControlKey;
  label: string;
  earned: number;
  max: number;
}

function createControlEntry(passed: number, total: number, weight: number): ControlBreakdownEntry {
  const ratio = total <= 0 ? 1 : Math.min(Math.max(passed / total, 0), 1);
  const score = parseFloat((ratio * weight).toFixed(2));
  return {
    passed,
    total,
    weight,
    score,
    current: passed,
  };
}

export function calculateWeightedComplianceScore(inputs: WeightedScoreInputs) {
  const breakdown: ComplianceBreakdown = {
    assets_with_owner: createControlEntry(inputs.ownerAssigned, inputs.totalAssets, CONTROL_WEIGHTS.assets_with_owner),
    assets_with_location: createControlEntry(inputs.locationAssigned, inputs.totalAssets, CONTROL_WEIGHTS.assets_with_location),
    valid_warranty: createControlEntry(inputs.warrantyCovered, inputs.totalAssets, CONTROL_WEIGHTS.valid_warranty),
    licensed_software: createControlEntry(
      inputs.softwareLicensedDevices,
      inputs.softwareDeviceTotal,
      CONTROL_WEIGHTS.licensed_software
    ),
    up_to_date_os: createControlEntry(inputs.supportedOsDevices, inputs.totalAssets, CONTROL_WEIGHTS.up_to_date_os),
    security_patches: createControlEntry(inputs.patchCompliantDevices, inputs.totalAssets, CONTROL_WEIGHTS.security_patches),
    no_duplicates: createControlEntry(inputs.uniqueAssignmentDevices, inputs.totalAssets, CONTROL_WEIGHTS.no_duplicates),
    idle_assets: createControlEntry(inputs.activelyUtilizedDevices, inputs.totalAssets, CONTROL_WEIGHTS.idle_assets),
  };

  const totalScore = Math.round(
    Object.values(breakdown).reduce((sum, entry) => sum + entry.score, 0)
  );

  const weightedBreakdown: WeightedBreakdownEntry[] = (Object.keys(breakdown) as ControlKey[]).map((key) => ({
    key,
    label: CONTROL_LABELS[key],
    earned: parseFloat(breakdown[key].score.toFixed(2)),
    max: breakdown[key].weight,
  }));

  return { score: totalScore, breakdown, weightedBreakdown };
}

export function interpretComplianceScore(score: number) {
  if (score >= 85) {
    return {
      rating: "Excellent",
      ratingDescription: "Strong governance posture with minimal risks. Controls are consistently met with very few exceptions.",
    };
  }
  if (score >= 70) {
    return {
      rating: "Good",
      ratingDescription: "Healthy posture with some areas requiring improvement but no critical gaps.",
    };
  }
  if (score >= 55) {
    return {
      rating: "Fair / Needs Improvement",
      ratingDescription: "Moderate compliance. Several issues need remediation to prevent operational risk.",
    };
  }
  if (score >= 40) {
    return {
      rating: "Weak",
      ratingDescription: "Significant compliance gaps across multiple controls; requires urgent remediation planning.",
    };
  }
  return {
    rating: "Critical",
    ratingDescription: "High-risk environment with major compliance failures. Immediate corrective action required.",
  };
}
