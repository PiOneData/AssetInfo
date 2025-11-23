import { db } from "../db";
import * as s from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { calculateWeightedComplianceScore, interpretComplianceScore, type ComplianceBreakdown, type WeightedBreakdownEntry } from "./scoring";

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

export interface ComplianceScoreBreakdownResponse {
  score: number;
  target: number;
  breakdown: ComplianceBreakdown;
  weightedBreakdown: WeightedBreakdownEntry[];
  rating: string;
  ratingDescription: string;
}

export async function getComplianceScoreDetails(tenantId: string): Promise<ComplianceScoreBreakdownResponse> {
  const assetRows = await db
    .select({
      id: s.assets.id,
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

  let assetsWithOwner = 0;
  let assetsWithLocation = 0;
  let validWarrantyCount = 0;
  let devicesWithoutWarranty = 0;
  let expiredWarrantyCount = 0;
  let outdatedOsDevices = 0;
  let missingPatchesCount = 0;
  let idleAssetsCount = 0;

  const ownershipMap = new Map<string, number>();

  hardwareAssets.forEach((asset) => {
    const hasOwner = Boolean(normalizeString(asset.assignedUserName) || normalizeString(asset.assignedUserEmail));
    if (hasOwner) assetsWithOwner += 1;

    const ownerKey = normalizeString(asset.assignedUserEmail || asset.assignedUserName || "").toLowerCase();
    if (ownerKey) {
      ownershipMap.set(ownerKey, (ownershipMap.get(ownerKey) || 0) + 1);
    }

    const hasLocation = Boolean(
      normalizeString(asset.country) ||
        normalizeString(asset.state) ||
        normalizeString(asset.city) ||
        normalizeString(asset.location)
    );
    if (hasLocation) assetsWithLocation += 1;

    if (!asset.warrantyExpiry) {
      devicesWithoutWarranty += 1;
    } else if (asset.warrantyExpiry && asset.warrantyExpiry < new Date()) {
      expiredWarrantyCount += 1;
    } else {
      validWarrantyCount += 1;
    }

    const spec = (asset.specifications ?? {}) as Record<string, any>;
    if (isOutdatedOs(spec)) {
      outdatedOsDevices += 1;
    }
    if (hasMissingPatches(spec)) {
      missingPatchesCount += 1;
    }

    const lastActivity = asset.updatedAt ?? asset.createdAt;
    if (lastActivity) {
      const age = now - new Date(lastActivity).getTime();
      if (age > 90 * 24 * 60 * 60 * 1000 && (asset.status || "").toLowerCase() === "in-stock") {
        idleAssetsCount += 1;
      }
    }
  });

  let duplicateAssignedDevices = 0;
  ownershipMap.forEach((count) => {
    if (count > 1) {
      duplicateAssignedDevices += count;
    }
  });

  const softwareAssets = alias(s.assets, "software_assets_for_score");
  const hardwareForAssignments = alias(s.assets, "hardware_assets_for_score_assignments");
  const hardwareForUnlicensed = alias(s.assets, "hardware_assets_for_score_unlicensed");

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
        or(sql`coalesce(${softwareAssets.licenseKey}, '') = ''`, sql`coalesce(${softwareAssets.licenseType}, '') = ''`)
      )
    );

  const unlicensedDeviceIds = new Set(unlicensedRows.map((row) => row.hardwareId));
  const softwareLicensedDevices = Math.max(softwareDeviceTotal - unlicensedDeviceIds.size, 0);

  const supportedOsDevices = Math.max(totalAssets - outdatedOsDevices, 0);
  const patchCompliantDevices = Math.max(totalAssets - missingPatchesCount, 0);
  const uniqueAssignmentDevices = Math.max(totalAssets - duplicateAssignedDevices, 0);
  const activelyUtilizedDevices = Math.max(totalAssets - idleAssetsCount, 0);

  const { score, breakdown, weightedBreakdown } = calculateWeightedComplianceScore({
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
  const { rating, ratingDescription } = interpretComplianceScore(score);

  return {
    score,
    target: 85,
    breakdown,
    weightedBreakdown,
    rating,
    ratingDescription,
  };
}
