import { db } from "../db";
import { assets, softwareLicenses } from "@shared/schema";
import { eq, and, sql, lt, isNull, or } from "drizzle-orm";

export interface ComplianceAssetSummary {
  id: string;
  name: string | null;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  type: string | null;
  status: string | null;
  warrantyExpiry: string | null;
  purchaseDate: string | null;
  location: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  riskFactors: string[];
}

export interface ComplianceIssue {
  key: string;
  label: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  assets?: ComplianceAssetSummary[];
}

export interface HighRiskAsset {
  id: string;
  name: string;
  status: string | null;
  owner: string | null;
  location: string | null;
  riskFactors: string[];
}

export interface ComplianceOverview {
  complianceScore: number;
  rating: string;
  ratingDescription: string;
  highRiskAssets: number;
  complianceIssues: number;
  unlicensedSoftware: number;
  expiredWarranties: number;
  weightedBreakdown: Array<{ key: string; label: string; earned: number; max: number }>;
  issues: ComplianceIssue[];
  highRiskAssetsList: HighRiskAsset[];
}

export interface ComplianceScoreDetails {
  score: number;
  rating: string;
  breakdown: {
    assetCompliance: number;
    licenseCompliance: number;
    warrantyCompliance: number;
    securityCompliance: number;
  };
  recommendations: string[];
}

export class ComplianceService {
  /**
   * Calculate comprehensive compliance overview for a tenant
   */
  async calculateComplianceOverview(tenantId: string): Promise<ComplianceOverview> {
    const now = new Date();

    // Get all assets for the tenant
    const allAssets = await db.select()
      .from(assets)
      .where(eq(assets.tenantId, tenantId));

    // Get all software licenses
    const licenses = await db.select()
      .from(softwareLicenses)
      .where(eq(softwareLicenses.tenantId, tenantId));

    // Calculate metrics
    const totalAssets = allAssets.length;
    const highRiskAssets: HighRiskAsset[] = [];
    const issues: ComplianceIssue[] = [];

    // Expired warranties
    const expiredWarranties = allAssets.filter(asset => {
      if (!asset.warrantyExpiry) return false;
      return new Date(asset.warrantyExpiry) < now;
    });

    // Assets without serial numbers
    const noSerialNumber = allAssets.filter(asset =>
      asset.type === 'Hardware' && !asset.serialNumber
    );

    // Assets without assigned users
    const unassigned = allAssets.filter(asset =>
      asset.type === 'Hardware' && asset.status !== 'retired' && !asset.assignedTo
    );

    // Software assets without licenses
    const softwareAssets = allAssets.filter(asset => asset.type === 'Software');
    const unlicensedSoftware = softwareAssets.filter(asset => {
      // Check if this software has a corresponding license
      const hasLicense = licenses.some(lic =>
        lic.softwareName?.toLowerCase() === asset.name?.toLowerCase()
      );
      return !hasLicense;
    });

    // Assets without location
    const noLocation = allAssets.filter(asset => !asset.location);

    // Build high-risk assets list
    allAssets.forEach(asset => {
      const riskFactors: string[] = [];

      if (asset.type === 'Hardware' && !asset.serialNumber) {
        riskFactors.push('Missing serial number');
      }
      if (asset.warrantyExpiry && new Date(asset.warrantyExpiry) < now) {
        riskFactors.push('Warranty expired');
      }
      if (!asset.location) {
        riskFactors.push('No location assigned');
      }
      if (asset.type === 'Hardware' && !asset.assignedTo) {
        riskFactors.push('Unassigned');
      }
      if (asset.type === 'Software') {
        const hasLicense = licenses.some(lic =>
          lic.softwareName?.toLowerCase() === asset.name?.toLowerCase()
        );
        if (!hasLicense) {
          riskFactors.push('No license found');
        }
      }

      if (riskFactors.length >= 2) {
        highRiskAssets.push({
          id: asset.id,
          name: asset.name || 'Unknown',
          status: asset.status,
          owner: asset.assignedTo || null,
          location: asset.location,
          riskFactors,
        });
      }
    });

    // Build issues list
    if (expiredWarranties.length > 0) {
      issues.push({
        key: 'expired_warranties',
        label: 'Expired Warranties',
        count: expiredWarranties.length,
        severity: 'high',
        description: 'Assets with expired warranty coverage',
      });
    }

    if (noSerialNumber.length > 0) {
      issues.push({
        key: 'missing_serial',
        label: 'Missing Serial Numbers',
        count: noSerialNumber.length,
        severity: 'medium',
        description: 'Hardware assets without serial numbers',
      });
    }

    if (unlicensedSoftware.length > 0) {
      issues.push({
        key: 'unlicensed_software',
        label: 'Unlicensed Software',
        count: unlicensedSoftware.length,
        severity: 'critical',
        description: 'Software assets without corresponding licenses',
      });
    }

    if (unassigned.length > 0) {
      issues.push({
        key: 'unassigned_assets',
        label: 'Unassigned Assets',
        count: unassigned.length,
        severity: 'low',
        description: 'Hardware assets not assigned to users',
      });
    }

    if (noLocation.length > 0) {
      issues.push({
        key: 'no_location',
        label: 'Missing Location',
        count: noLocation.length,
        severity: 'medium',
        description: 'Assets without location information',
      });
    }

    // Calculate compliance score (0-100)
    let score = 100;

    // Deduct points for issues
    if (totalAssets > 0) {
      score -= (expiredWarranties.length / totalAssets) * 20; // Up to 20 points
      score -= (noSerialNumber.length / totalAssets) * 15;    // Up to 15 points
      score -= (unlicensedSoftware.length / totalAssets) * 30; // Up to 30 points
      score -= (unassigned.length / totalAssets) * 10;        // Up to 10 points
      score -= (noLocation.length / totalAssets) * 10;        // Up to 10 points
    }

    score = Math.max(0, Math.min(100, score));

    // Determine rating
    let rating: string;
    let ratingDescription: string;

    if (score >= 90) {
      rating = 'Excellent';
      ratingDescription = 'Your asset compliance is excellent';
    } else if (score >= 75) {
      rating = 'Good';
      ratingDescription = 'Your asset compliance is good with minor issues';
    } else if (score >= 60) {
      rating = 'Fair';
      ratingDescription = 'Your asset compliance needs improvement';
    } else if (score >= 40) {
      rating = 'Poor';
      ratingDescription = 'Your asset compliance has significant issues';
    } else {
      rating = 'Critical';
      ratingDescription = 'Your asset compliance requires immediate attention';
    }

    // Weighted breakdown
    const maxPoints = 100;
    const earnedPoints = {
      warranties: Math.max(0, 20 - (expiredWarranties.length / Math.max(totalAssets, 1)) * 20),
      serialNumbers: Math.max(0, 15 - (noSerialNumber.length / Math.max(totalAssets, 1)) * 15),
      licenses: Math.max(0, 30 - (unlicensedSoftware.length / Math.max(totalAssets, 1)) * 30),
      assignments: Math.max(0, 10 - (unassigned.length / Math.max(totalAssets, 1)) * 10),
      locations: Math.max(0, 10 - (noLocation.length / Math.max(totalAssets, 1)) * 10),
      dataQuality: 15, // Base points for having data
    };

    const weightedBreakdown = [
      { key: 'licenses', label: 'License Compliance', earned: Math.round(earnedPoints.licenses), max: 30 },
      { key: 'warranties', label: 'Warranty Management', earned: Math.round(earnedPoints.warranties), max: 20 },
      { key: 'serialNumbers', label: 'Asset Tracking', earned: Math.round(earnedPoints.serialNumbers), max: 15 },
      { key: 'dataQuality', label: 'Data Quality', earned: Math.round(earnedPoints.dataQuality), max: 15 },
      { key: 'assignments', label: 'Asset Assignment', earned: Math.round(earnedPoints.assignments), max: 10 },
      { key: 'locations', label: 'Location Tracking', earned: Math.round(earnedPoints.locations), max: 10 },
    ];

    return {
      complianceScore: Math.round(score),
      rating,
      ratingDescription,
      highRiskAssets: highRiskAssets.length,
      complianceIssues: issues.length,
      unlicensedSoftware: unlicensedSoftware.length,
      expiredWarranties: expiredWarranties.length,
      weightedBreakdown,
      issues,
      highRiskAssetsList: highRiskAssets,
    };
  }

  /**
   * Calculate detailed compliance score breakdown
   */
  async calculateScoreDetails(tenantId: string): Promise<ComplianceScoreDetails> {
    const overview = await this.calculateComplianceOverview(tenantId);

    const recommendations: string[] = [];

    if (overview.unlicensedSoftware > 0) {
      recommendations.push(`Add licenses for ${overview.unlicensedSoftware} software assets`);
    }
    if (overview.expiredWarranties > 0) {
      recommendations.push(`Renew warranties for ${overview.expiredWarranties} assets`);
    }
    if (overview.highRiskAssets > 0) {
      recommendations.push(`Review and update ${overview.highRiskAssets} high-risk assets`);
    }
    if (overview.issues.some(i => i.key === 'missing_serial')) {
      const issue = overview.issues.find(i => i.key === 'missing_serial');
      recommendations.push(`Add serial numbers for ${issue?.count} hardware assets`);
    }
    if (overview.issues.some(i => i.key === 'no_location')) {
      const issue = overview.issues.find(i => i.key === 'no_location');
      recommendations.push(`Set locations for ${issue?.count} assets`);
    }

    return {
      score: overview.complianceScore,
      rating: overview.rating,
      breakdown: {
        assetCompliance: overview.weightedBreakdown.find(b => b.key === 'serialNumbers')?.earned || 0,
        licenseCompliance: overview.weightedBreakdown.find(b => b.key === 'licenses')?.earned || 0,
        warrantyCompliance: overview.weightedBreakdown.find(b => b.key === 'warranties')?.earned || 0,
        securityCompliance: overview.weightedBreakdown.find(b => b.key === 'dataQuality')?.earned || 0,
      },
      recommendations,
    };
  }

  /**
   * Get license compliance details
   */
  async getLicenseCompliance(tenantId: string) {
    const softwareAssets = await db.select()
      .from(assets)
      .where(and(
        eq(assets.tenantId, tenantId),
        eq(assets.type, 'Software')
      ));

    const licenses = await db.select()
      .from(softwareLicenses)
      .where(eq(softwareLicenses.tenantId, tenantId));

    const licensed = softwareAssets.filter(asset => {
      return licenses.some(lic =>
        lic.softwareName?.toLowerCase() === asset.name?.toLowerCase()
      );
    });

    const unlicensed = softwareAssets.filter(asset => {
      return !licenses.some(lic =>
        lic.softwareName?.toLowerCase() === asset.name?.toLowerCase()
      );
    });

    const complianceRate = softwareAssets.length > 0
      ? (licensed.length / softwareAssets.length) * 100
      : 100;

    return {
      totalSoftware: softwareAssets.length,
      licensed: licensed.length,
      unlicensed: unlicensed.length,
      complianceRate: Math.round(complianceRate),
      unlicensedAssets: unlicensed.map(asset => ({
        id: asset.id,
        name: asset.name,
        category: asset.category,
        status: asset.status,
      })),
    };
  }
}

export const complianceService = new ComplianceService();
