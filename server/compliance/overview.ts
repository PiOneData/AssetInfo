import { db } from "../db";
import * as s from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { calculateWeightedComplianceScore, interpretComplianceScore, type ComplianceBreakdown, type WeightedBreakdownEntry } from "./scoring";

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const OUTDATED_OS_KEYWORDS = [
  "windows 7",
  "windows 8",
  "server 2008",
  "server 2012",
  "ubuntu 16",
  "ubuntu 14",
  "mac os x 10.11",
  "os x 10.12",
];

function normalizeString(value?: string | null) {
  return (value || "").trim();
}

function isOutdatedOs(spec: any): boolean {
  if (!spec) return false;
  const agent = spec.agent || {};
  const osStatus = normalizeString(agent.osStatus || spec.osStatus).toLowerCase();
  if (osStatus === "outdated") return true;
  const osVersion = normalizeString(agent.osVersion || spec.osVersion).toLowerCase();
  if (!osVersion) return false;
  return OUTDATED_OS_KEYWORDS.some((keyword) => osVersion.includes(keyword));
}

function hasMissingPatches(spec: any): boolean {
  if (!spec) return false;
  const agent = spec.agent || {};
  const patchStatus = normalizeString(agent.patchStatus || spec.patchStatus).toLowerCase();
  if (patchStatus === "missing" || patchStatus === "overdue") return true;
  const missingCount = Number(agent.missingPatches ?? agent.missingPatchCount ?? spec.missingPatches ?? 0);
  return missingCount > 0;
}

function hasUnauthorizedSoftware(spec: any): boolean {
  if (!spec) return false;
  const security = spec.security || {};
  if (security.unauthorizedSoftware === true) return true;
  const agent = spec.agent || {};
  const count = Number(agent.unauthorizedSoftwareCount ?? security.unauthorizedSoftwareCount ?? 0);
  return count > 0;
}

interface ComplianceAssetSummary {
  id: string;
  name: string | null;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  status: string | null;
  warrantyExpiry: Date | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  location: string | null;
}

export interface ComplianceOverviewResponse {
  complianceScore: number;
  rating: string;
  ratingDescription: string;
  highRiskAssets: number;
  complianceIssues: number;
  unlicensedSoftware: number;
  expiredWarranties: number;
  breakdown: ComplianceBreakdown;
  weightedBreakdown: WeightedBreakdownEntry[];
  issues: Array<{
    key: string;
    label: string;
    count: number;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    assets: ComplianceAssetSummary[];
  }>;
  highRiskAssetsList: Array<{
    id: string;
    name: string;
    status: string | null;
    owner: string | null;
    location: string | null;
    riskFactors: string[];
  }>;
}

function buildAssetSummary(asset: typeof s.assets.$inferSelect): ComplianceAssetSummary {
  return {
    id: asset.id,
    name: asset.name || "Unnamed Asset",
    serialNumber: asset.serialNumber || null,
    model: asset.model || null,
    manufacturer: asset.manufacturer || null,
    category: asset.category || null,
    status: asset.status || null,
    warrantyExpiry: asset.warrantyExpiry ?? null,
    assignedUserName: normalizeString(asset.assignedUserName) || null,
    assignedUserEmail: normalizeString(asset.assignedUserEmail) || null,
    location: normalizeString(asset.city || asset.state || asset.country || asset.location) || null,
  };
}

export async function getComplianceOverview(tenantId: string): Promise<ComplianceOverviewResponse> {
  const assetRows = await db
    .select({
      id: s.assets.id,
      name: s.assets.name,
      type: s.assets.type,
      status: s.assets.status,
      assignedUserName: s.assets.assignedUserName,
      assignedUserEmail: s.assets.assignedUserEmail,
      location: s.assets.location,
      country: s.assets.country,
      state: s.assets.state,
      city: s.assets.city,
      warrantyExpiry: s.assets.warrantyExpiry,
      specifications: s.assets.specifications,
      createdAt: s.assets.createdAt,
      updatedAt: s.assets.updatedAt,
    })
    .from(s.assets)
    .where(eq(s.assets.tenantId, tenantId));

  const hardwareAssets = assetRows.filter((asset) => (asset.type || "").toLowerCase() === "hardware");
  const totalAssets = hardwareAssets.length;
  const now = Date.now();

  let assetsMissingUser = 0;
  let assetsMissingLocation = 0;
  let assetsWithOwner = 0;
  let assetsWithLocation = 0;
  let devicesWithoutWarranty = 0;
  let expiredWarrantyCount = 0;
  let validWarrantyCount = 0;
  let outdatedOsDevices = 0;
  let missingPatchesCount = 0;
  let idleAssetsCount = 0;
  let unauthorizedSoftwareAssets = 0;

  const issueAssetsMap: Record<string, ComplianceAssetSummary[]> = {
    missingUser: [],
    missingLocation: [],
    noWarranty: [],
    expiredWarranty: [],
    unlicensedSoftware: [],
    outdatedOs: [],
    missingPatches: [],
    duplicateAssignments: [],
    idleAssets: [],
  };

  const ownershipMap = new Map<string, number>();
  const ownerAssetsMap = new Map<string, ComplianceAssetSummary[]>();
  const highRiskAssetsList: ComplianceOverviewResponse["highRiskAssetsList"] = [];

  hardwareAssets.forEach((asset) => {
    const ownerKey = normalizeString(asset.assignedUserEmail || asset.assignedUserName || "").toLowerCase();
    if (ownerKey) {
      ownershipMap.set(ownerKey, (ownershipMap.get(ownerKey) || 0) + 1);
      const arr = ownerAssetsMap.get(ownerKey) || [];
      arr.push(buildAssetSummary(asset));
      ownerAssetsMap.set(ownerKey, arr);
    }

    const hasUser = Boolean(normalizeString(asset.assignedUserName) || normalizeString(asset.assignedUserEmail));
    if (hasUser) {
      assetsWithOwner += 1;
    } else {
      assetsMissingUser += 1;
      issueAssetsMap.missingUser.push(buildAssetSummary(asset));
    }

    const hasLocation = Boolean(
      normalizeString(asset.country) ||
      normalizeString(asset.state) ||
      normalizeString(asset.city) ||
      normalizeString(asset.location)
    );
    if (hasLocation) {
      assetsWithLocation += 1;
    } else {
      assetsMissingLocation += 1;
      issueAssetsMap.missingLocation.push(buildAssetSummary(asset));
    }

    if (!asset.warrantyExpiry) {
      devicesWithoutWarranty += 1;
      issueAssetsMap.noWarranty.push(buildAssetSummary(asset));
    } else if (asset.warrantyExpiry && asset.warrantyExpiry < new Date()) {
      expiredWarrantyCount += 1;
      issueAssetsMap.expiredWarranty.push(buildAssetSummary(asset));
    } else {
      validWarrantyCount += 1;
    }

    const spec = (asset.specifications ?? {}) as Record<string, any>;

    if (isOutdatedOs(spec)) {
      outdatedOsDevices += 1;
      issueAssetsMap.outdatedOs.push(buildAssetSummary(asset));
    }

    if (hasMissingPatches(spec)) {
      missingPatchesCount += 1;
      issueAssetsMap.missingPatches.push(buildAssetSummary(asset));
    }

    if (hasUnauthorizedSoftware(spec)) {
      unauthorizedSoftwareAssets += 1;
      issueAssetsMap.unlicensedSoftware.push(buildAssetSummary(asset));
    }

    const lastActivity = asset.updatedAt ?? asset.createdAt;
    if (lastActivity) {
      const age = now - new Date(lastActivity).getTime();
      if (age > NINETY_DAYS && (asset.status || "").toLowerCase() === "in-stock") {
        idleAssetsCount += 1;
        issueAssetsMap.idleAssets.push(buildAssetSummary(asset));
      }
    }

    const riskFactors: string[] = [];
    if (!hasUser) riskFactors.push("Missing owner");
    if (!hasLocation) riskFactors.push("Missing location");
    if (!asset.warrantyExpiry) riskFactors.push("No warranty");
    if (asset.warrantyExpiry && asset.warrantyExpiry < new Date()) riskFactors.push("Expired warranty");
    if (isOutdatedOs(spec)) riskFactors.push("Outdated OS");
    if (hasUnauthorizedSoftware(spec)) riskFactors.push("Unauthorized software");

    const idleRisk = (() => {
      if (!lastActivity) return false;
      const age = now - new Date(lastActivity).getTime();
      return age > NINETY_DAYS && (asset.status || "").toLowerCase() === "in-stock";
    })();
    if (idleRisk) riskFactors.push("Idle > 90 days");

    if (riskFactors.length > 0) {
      highRiskAssetsList.push({
        id: asset.id,
        name: asset.name || "Unnamed Asset",
        status: asset.status || null,
        owner: normalizeString(asset.assignedUserName || asset.assignedUserEmail) || null,
        location: normalizeString(asset.city || asset.state || asset.country || asset.location) || null,
        riskFactors,
      });
    }
  });

  let duplicateAssignedDevices = 0;
  ownershipMap.forEach((count, ownerKey) => {
    if (count > 1) {
      duplicateAssignedDevices += count;
      const assets = ownerAssetsMap.get(ownerKey) || [];
      issueAssetsMap.duplicateAssignments.push(...assets);
    }
  });

  const softwareAssets = alias(s.assets, "software_assets_for_compliance");
  const hardwareForAssignments = alias(s.assets, "hardware_for_compliance_assignments");
  const hardwareForUnlicensed = alias(s.assets, "hardware_unlicensed_for_compliance");

  const softwareAssignmentRows = await db
    .select({
      hardwareId: hardwareForAssignments.id,
    })
    .from(s.assetSoftwareLinks)
    .innerJoin(
      softwareAssets,
      and(eq(s.assetSoftwareLinks.softwareAssetId, softwareAssets.id), eq(softwareAssets.tenantId, tenantId))
    )
    .innerJoin(
      hardwareForAssignments,
      and(eq(s.assetSoftwareLinks.assetId, hardwareForAssignments.id), eq(hardwareForAssignments.tenantId, tenantId))
    )
    .where(eq(s.assetSoftwareLinks.tenantId, tenantId));

  const softwareDeviceTotal = new Set(softwareAssignmentRows.map((row) => row.hardwareId)).size;

  const unlicensedRows = await db
    .select({
      hardware: hardwareForUnlicensed,
      hardwareId: hardwareForUnlicensed.id,
    })
    .from(s.assetSoftwareLinks)
    .innerJoin(
      softwareAssets,
      and(eq(s.assetSoftwareLinks.softwareAssetId, softwareAssets.id), eq(softwareAssets.tenantId, tenantId))
    )
    .innerJoin(
      hardwareForUnlicensed,
      and(eq(s.assetSoftwareLinks.assetId, hardwareForUnlicensed.id), eq(hardwareForUnlicensed.tenantId, tenantId))
    )
    .where(
      and(
        eq(s.assetSoftwareLinks.tenantId, tenantId),
        or(
          sql`coalesce(${softwareAssets.licenseKey}, '') = ''`,
          sql`coalesce(${softwareAssets.licenseType}, '') = ''`
        )
      )
    );

  const unlicensedDeviceIds = new Set(unlicensedRows.map((row) => row.hardwareId));
  const softwareLicensedDevices = Math.max(softwareDeviceTotal - unlicensedDeviceIds.size, 0);
  const unlicensedSoftware = unlicensedRows.length;
  unlicensedRows.forEach((row) => {
    issueAssetsMap.unlicensedSoftware.push(buildAssetSummary(row.hardware));
  });

  const totalIssues =
    assetsMissingUser +
    assetsMissingLocation +
    devicesWithoutWarranty +
    expiredWarrantyCount +
    unlicensedSoftware +
    outdatedOsDevices +
    missingPatchesCount +
    duplicateAssignedDevices +
    idleAssetsCount;

  const supportedOsDevices = Math.max(totalAssets - outdatedOsDevices, 0);
  const patchCompliantDevices = Math.max(totalAssets - missingPatchesCount, 0);
  const uniqueAssignmentDevices = Math.max(totalAssets - duplicateAssignedDevices, 0);
  const activelyUtilizedDevices = Math.max(totalAssets - idleAssetsCount, 0);

  const { score: complianceScore, breakdown, weightedBreakdown } = calculateWeightedComplianceScore({
    totalAssets,
    ownerAssigned: assetsWithOwner,
    locationAssigned: assetsWithLocation,
    warrantyCovered: validWarrantyCount,
    softwareLicensedDevices,
    softwareDeviceTotal,
    supportedOsDevices,
    patchCompliantDevices,
    uniqueAssignmentDevices,
    activelyUtilizedDevices,
  });
  const { rating, ratingDescription } = interpretComplianceScore(complianceScore);

  const severityForIssue = (count: number): "low" | "medium" | "high" | "critical" => {
    if (count === 0) return "low";
    const ratio = totalAssets === 0 ? 0 : count / totalAssets;
    if (ratio > 0.4) return "critical";
    if (ratio > 0.25) return "high";
    if (ratio > 0.1) return "medium";
    return "low";
  };

  const issues: ComplianceOverviewResponse["issues"] = [
    {
      key: "missingUser",
      label: "Assets Missing Owner",
      count: assetsMissingUser,
      severity: severityForIssue(assetsMissingUser),
      description: "Devices without an assigned user",
      assets: issueAssetsMap.missingUser,
    },
    {
      key: "missingLocation",
      label: "Assets Missing Location",
      count: assetsMissingLocation,
      severity: severityForIssue(assetsMissingLocation),
      description: "Assets lacking country/state/city metadata",
      assets: issueAssetsMap.missingLocation,
    },
    {
      key: "noWarranty",
      label: "No Warranty Coverage",
      count: devicesWithoutWarranty,
      severity: severityForIssue(devicesWithoutWarranty),
      description: "Hardware without an active warranty",
      assets: issueAssetsMap.noWarranty,
    },
    {
      key: "expiredWarranty",
      label: "Expired Warranties",
      count: expiredWarrantyCount,
      severity: severityForIssue(expiredWarrantyCount),
      description: "Devices with expired warranty dates",
      assets: issueAssetsMap.expiredWarranty,
    },
    {
      key: "unlicensedSoftware",
      label: "Unlicensed Software",
      count: unlicensedSoftware,
      severity: severityForIssue(unlicensedSoftware),
      description: "Installed software without licenses",
      assets: issueAssetsMap.unlicensedSoftware,
    },
    {
      key: "outdatedOs",
      label: "Outdated Operating Systems",
      count: outdatedOsDevices,
      severity: severityForIssue(outdatedOsDevices),
      description: "Devices running unsupported OS versions",
      assets: issueAssetsMap.outdatedOs,
    },
    {
      key: "missingPatches",
      label: "Missing Security Patches",
      count: missingPatchesCount,
      severity: severityForIssue(missingPatchesCount),
      description: "Endpoints missing recent security patches",
      assets: issueAssetsMap.missingPatches,
    },
    {
      key: "duplicateAssignments",
      label: "Duplicate Assignments",
      count: duplicateAssignedDevices,
      severity: severityForIssue(duplicateAssignedDevices),
      description: "Users assigned to multiple primary devices",
      assets: issueAssetsMap.duplicateAssignments,
    },
    {
      key: "idleAssets",
      label: "Idle Assets > 90 Days",
      count: idleAssetsCount,
      severity: severityForIssue(idleAssetsCount),
      description: "In-stock hardware unused for over 90 days",
      assets: issueAssetsMap.idleAssets,
    },
  ];

  return {
    complianceScore,
    rating,
    ratingDescription,
    highRiskAssets: highRiskAssetsList.length,
    complianceIssues: totalIssues,
    unlicensedSoftware,
    expiredWarranties: expiredWarrantyCount,
    breakdown,
    weightedBreakdown,
    issues,
    highRiskAssetsList: highRiskAssetsList.slice(0, 20),
  };
}
