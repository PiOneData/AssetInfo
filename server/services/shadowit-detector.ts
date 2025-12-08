/**
 * Shadow IT Detection Engine
 *
 * Analyzes discovered apps from IdP connectors to identify:
 * - Unapproved SaaS applications (Shadow IT)
 * - Over-permissioned OAuth grants
 * - Risk scoring based on permissions and app characteristics
 */

import { storage } from '../storage';
import { DiscoveredApp, DiscoveredUserAccess, DiscoveredOAuthToken } from './idp/connector.interface';
import { OAuthRiskAnalyzer } from './oauth-risk-analyzer';
import type { InsertSaasApp } from '@shared/schema';
import { policyEngine } from './policy/engine';

export interface ShadowITAnalysisResult {
  isUnapproved: boolean;
  isNewDiscovery: boolean;
  riskScore: number;
  riskFactors: string[];
  matchedAppId?: string;
  recommendedAction: 'approve' | 'review' | 'deny' | 'investigate';
}

export interface ProcessingStats {
  appsProcessed: number;
  appsCreated: number;
  appsUpdated: number;
  userAccessCreated: number;
  tokensCreated: number;
  shadowITDetected: number;
  highRiskApps: number;
}

/**
 * Shadow IT Detector
 *
 * Processes discovered apps and compares against approved catalog
 */
export class ShadowITDetector {
  constructor(private tenantId: string) {}

  /**
   * Normalize app name for fuzzy matching
   */
  private normalizeAppName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * Find matching app in approved catalog
   */
  private async findMatchingApp(discoveredApp: DiscoveredApp): Promise<any | null> {
    try {
      const apps = await storage.getSaasApps(this.tenantId, {});
      const normalizedName = this.normalizeAppName(discoveredApp.name);

      // 1. Try exact name match
      for (const app of apps) {
        if (this.normalizeAppName(app.name) === normalizedName) {
          console.log(`[ShadowIT] Exact match found: ${app.name}`);
          return app;
        }
      }

      // 2. Try vendor match (if vendor provided)
      if (discoveredApp.vendor) {
        const normalizedVendor = this.normalizeAppName(discoveredApp.vendor);
        for (const app of apps) {
          if (app.vendor && this.normalizeAppName(app.vendor) === normalizedVendor) {
            console.log(`[ShadowIT] Vendor match found: ${app.name} (${app.vendor})`);
            return app;
          }
        }
      }

      // 3. Try substring match (for apps with different naming conventions)
      for (const app of apps) {
        const appNormalized = this.normalizeAppName(app.name);
        if (appNormalized.includes(normalizedName) || normalizedName.includes(appNormalized)) {
          if (appNormalized.length >= 4 && normalizedName.length >= 4) { // Avoid false positives on short names
            console.log(`[ShadowIT] Substring match found: ${app.name}`);
            return app;
          }
        }
      }

      console.log(`[ShadowIT] No match found for: ${discoveredApp.name}`);
      return null;
    } catch (error) {
      console.error('[ShadowIT] Error finding matching app:', error);
      return null;
    }
  }

  /**
   * Calculate risk score based on permissions and app characteristics
   */
  private calculateRiskScore(app: DiscoveredApp): { score: number; factors: string[] } {
    let score = 0;
    const factors: string[] = [];

    // Analyze OAuth permissions using risk analyzer
    if (app.permissions && app.permissions.length > 0) {
      const permissionRisk = OAuthRiskAnalyzer.assessPermissions(app.permissions);
      score += permissionRisk.riskScore;
      factors.push(...permissionRisk.reasons.map(r => `High-risk permission: ${r}`));
    }

    // Unknown vendor penalty
    if (!app.vendor || app.vendor === 'Unknown') {
      score += 10;
      factors.push('Unknown vendor');
    }

    // No website URL penalty
    if (!app.websiteUrl) {
      score += 5;
      factors.push('No website URL available');
    }

    // Excessive permissions (>10 scopes)
    if (app.permissions && app.permissions.length > 10) {
      score += 10;
      factors.push(`Excessive permissions (${app.permissions.length} scopes)`);
    }

    // Cap at 100
    score = Math.min(score, 100);

    return { score, factors };
  }

  /**
   * Analyze a discovered app for Shadow IT
   */
  async analyzeApp(discoveredApp: DiscoveredApp): Promise<ShadowITAnalysisResult> {
    const matchedApp = await this.findMatchingApp(discoveredApp);
    const { score, factors } = this.calculateRiskScore(discoveredApp);

    // New app not in catalog
    if (!matchedApp) {
      let recommendedAction: 'approve' | 'review' | 'deny' | 'investigate' = 'review';

      if (score >= 75) {
        recommendedAction = 'investigate';
      } else if (score >= 50) {
        recommendedAction = 'review';
      } else {
        recommendedAction = 'approve';
      }

      return {
        isUnapproved: true,
        isNewDiscovery: true,
        riskScore: score,
        riskFactors: ['App not in approved catalog', ...factors],
        matchedAppId: undefined,
        recommendedAction
      };
    }

    // Existing app - check approval status
    if (matchedApp.approvalStatus === 'denied') {
      return {
        isUnapproved: true,
        isNewDiscovery: false,
        riskScore: Math.min(score + 30, 100),
        riskFactors: ['App explicitly denied', ...factors],
        matchedAppId: matchedApp.id,
        recommendedAction: 'deny'
      };
    }

    if (matchedApp.approvalStatus === 'pending') {
      return {
        isUnapproved: true,
        isNewDiscovery: false,
        riskScore: score,
        riskFactors: ['App approval pending', ...factors],
        matchedAppId: matchedApp.id,
        recommendedAction: 'review'
      };
    }

    // Approved app
    return {
      isUnapproved: false,
      isNewDiscovery: false,
      riskScore: score,
      riskFactors: factors,
      matchedAppId: matchedApp.id,
      recommendedAction: 'approve'
    };
  }

  /**
   * Process a single discovered app
   */
  async processApp(discoveredApp: DiscoveredApp, idpId: string): Promise<{ created: boolean; appId: string }> {
    const analysis = await this.analyzeApp(discoveredApp);

    if (analysis.matchedAppId) {
      // Update existing app
      await storage.updateSaasApp(analysis.matchedAppId, this.tenantId, {
        lastUsedAt: new Date(),
        discoveryDate: new Date(),
        discoveryMethod: 'idp',
        riskScore: analysis.riskScore,
        riskFactors: analysis.riskFactors,
        metadata: {
          ...discoveredApp.metadata,
          lastSyncedFrom: idpId,
          lastSyncedAt: new Date().toISOString()
        }
      });

      console.log(`[ShadowIT] Updated existing app: ${discoveredApp.name} (ID: ${analysis.matchedAppId})`);

      return { created: false, appId: analysis.matchedAppId };
    } else {
      // Create new app
      const newApp: InsertSaasApp = {
        tenantId: this.tenantId,
        name: discoveredApp.name,
        vendor: discoveredApp.vendor,
        logoUrl: discoveredApp.logoUrl,
        websiteUrl: discoveredApp.websiteUrl,
        approvalStatus: 'pending', // Always start as pending for Shadow IT
        riskScore: analysis.riskScore,
        riskFactors: analysis.riskFactors,
        discoveryMethod: 'idp',
        discoveryDate: new Date(),
        metadata: {
          ...discoveredApp.metadata,
          externalId: discoveredApp.externalId,
          discoveredFrom: idpId,
          permissions: discoveredApp.permissions
        }
      };

      const created = await storage.createSaasApp(newApp);

      console.log(`[ShadowIT] Created new app: ${discoveredApp.name} (ID: ${created.id})`);

      // Emit policy event for new app discovery
      if (analysis.isUnapproved) {
        const eventSystem = policyEngine.getEventSystem();
        const riskLevel = analysis.riskScore >= 75 ? 'critical' :
                         analysis.riskScore >= 50 ? 'high' :
                         analysis.riskScore >= 25 ? 'medium' : 'low';

        eventSystem.emit('app.discovered', {
          tenantId: this.tenantId,
          appId: created.id,
          appName: created.name,
          approvalStatus: created.approvalStatus,
          riskLevel,
          riskScore: analysis.riskScore
        });

        // Also emit OAuth risky permission event if permissions are high-risk
        if (discoveredApp.permissions && discoveredApp.permissions.length > 0 && analysis.riskScore >= 50) {
          eventSystem.emit('oauth.risky_permission', {
            tenantId: this.tenantId,
            appId: created.id,
            appName: created.name,
            riskLevel,
            riskScore: analysis.riskScore,
            scopes: discoveredApp.permissions
          });
        }
      }

      return { created: true, appId: created.id };
    }
  }

  /**
   * Process batch of discovered apps
   */
  async processApps(
    discoveredApps: DiscoveredApp[],
    idpId: string
  ): Promise<{ appsProcessed: number; appsCreated: number; appsUpdated: number; shadowITDetected: number }> {
    let appsCreated = 0;
    let appsUpdated = 0;
    let shadowITDetected = 0;

    for (const discoveredApp of discoveredApps) {
      try {
        const analysis = await this.analyzeApp(discoveredApp);

        if (analysis.isUnapproved) {
          shadowITDetected++;
        }

        const result = await this.processApp(discoveredApp, idpId);

        if (result.created) {
          appsCreated++;
        } else {
          appsUpdated++;
        }
      } catch (error) {
        console.error(`[ShadowIT] Error processing app ${discoveredApp.name}:`, error);
      }
    }

    return {
      appsProcessed: discoveredApps.length,
      appsCreated,
      appsUpdated,
      shadowITDetected
    };
  }

  /**
   * Process user access grants
   */
  async processUserAccess(
    userAccessList: DiscoveredUserAccess[],
    idpId: string
  ): Promise<number> {
    let accessCreated = 0;

    // TODO: Implement user access processing
    // This will require:
    // 1. Mapping externalId to internal appId
    // 2. Mapping userId to internal user records
    // 3. Creating/updating user_app_access records

    console.log(`[ShadowIT] User access processing: ${userAccessList.length} grants (implementation pending)`);

    return accessCreated;
  }

  /**
   * Process OAuth tokens
   */
  async processOAuthTokens(
    tokens: DiscoveredOAuthToken[],
    idpId: string
  ): Promise<number> {
    let tokensCreated = 0;

    // TODO: Implement OAuth token processing
    // This will require:
    // 1. Mapping externalId to internal appId
    // 2. Mapping userId to internal user records
    // 3. Risk assessment of scopes
    // 4. Creating/updating oauth_tokens records

    console.log(`[ShadowIT] OAuth token processing: ${tokens.length} tokens (implementation pending)`);

    return tokensCreated;
  }

  /**
   * Process full sync result
   */
  async processFullSync(
    syncResult: any,
    idpId: string
  ): Promise<ProcessingStats> {
    console.log(`[ShadowIT] Processing full sync result for IdP ${idpId}`);

    const apps = syncResult.metadata?.apps || [];
    const userAccess = syncResult.metadata?.userAccess || [];
    const tokens = syncResult.metadata?.tokens || [];

    // Process apps
    const appStats = await this.processApps(apps, idpId);

    // Process user access
    const userAccessCreated = await this.processUserAccess(userAccess, idpId);

    // Process tokens
    const tokensCreated = await this.processOAuthTokens(tokens, idpId);

    const stats: ProcessingStats = {
      ...appStats,
      userAccessCreated,
      tokensCreated,
      highRiskApps: apps.filter((a: DiscoveredApp) => {
        const { score } = this.calculateRiskScore(a);
        return score >= 70;
      }).length
    };

    console.log(`[ShadowIT] Processing complete:`, stats);

    return stats;
  }
}
