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

    for (const access of userAccessList) {
      try {
        // 1. Map externalId to internal appId
        const app = await this.storage.getSaasAppByExternalId(access.externalId, this.tenantId);
        if (!app) {
          console.log(`[ShadowIT] App not found for external ID: ${access.externalId}, skipping access grant`);
          continue;
        }

        // 2. Map userId to internal user record
        const user = await this.storage.getUserByEmail(access.userEmail, this.tenantId);
        if (!user) {
          console.log(`[ShadowIT] User not found: ${access.userEmail}, skipping access grant`);
          continue;
        }

        // 3. Check if access already exists
        const existingAccess = await this.storage.getUserAppAccessByUserAndApp(
          user.id,
          app.id,
          this.tenantId
        );

        if (existingAccess) {
          // Update existing access
          await this.storage.updateUserAppAccess(existingAccess.id, {
            lastAccessDate: access.lastAccessDate ? new Date(access.lastAccessDate) : new Date(),
            permissions: access.permissions || existingAccess.permissions,
            roles: access.roles || existingAccess.roles,
            assignmentMethod: 'idp_sync',
            updatedAt: new Date(),
          });
        } else {
          // Create new access record
          await this.storage.createUserAppAccess({
            tenantId: this.tenantId,
            userId: user.id,
            appId: app.id,
            accessGrantedDate: access.grantedDate ? new Date(access.grantedDate) : new Date(),
            lastAccessDate: access.lastAccessDate ? new Date(access.lastAccessDate) : null,
            permissions: access.permissions || [],
            roles: access.roles || [],
            assignmentMethod: 'idp_sync',
            assignedBy: idpId,
            status: 'active',
          });
          accessCreated++;
        }
      } catch (error) {
        console.error(`[ShadowIT] Error processing user access for ${access.userEmail}:`, error);
      }
    }

    console.log(`[ShadowIT] User access processing complete: ${accessCreated} new grants created`);
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

    for (const token of tokens) {
      try {
        // 1. Map externalId to internal appId
        const app = await this.storage.getSaasAppByExternalId(token.externalId, this.tenantId);
        if (!app) {
          console.log(`[ShadowIT] App not found for external ID: ${token.externalId}, skipping OAuth token`);
          continue;
        }

        // 2. Map userId to internal user record
        const user = await this.storage.getUserByEmail(token.userEmail, this.tenantId);
        if (!user) {
          console.log(`[ShadowIT] User not found: ${token.userEmail}, skipping OAuth token`);
          continue;
        }

        // 3. Risk assessment of scopes
        const scopes = token.scopes || [];
        let riskLevel = 'low';
        const riskyScopes = ['write', 'delete', 'admin', 'full_control', 'manage', 'owner'];

        if (scopes.some(scope => riskyScopes.some(risky => scope.toLowerCase().includes(risky)))) {
          riskLevel = 'high';
        } else if (scopes.length > 5) {
          riskLevel = 'medium';
        }

        // Check for excessive permissions
        const excessivePermissions = scopes.length > 10;

        // 4. Check if token already exists
        const existing = await this.storage.getOAuthTokenByUserAndApp(
          user.id,
          app.id,
          this.tenantId
        );

        if (existing) {
          // Update existing token
          await this.storage.updateOAuthToken(existing.id, {
            scopes,
            riskLevel,
            excessivePermissions,
            lastUsed: token.lastUsed ? new Date(token.lastUsed) : new Date(),
            expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
            idpMetadata: {
              idpId,
              tokenId: token.tokenId,
            },
            updatedAt: new Date(),
          });
        } else {
          // Create new token record
          await this.storage.createOAuthToken({
            tenantId: this.tenantId,
            userId: user.id,
            appId: app.id,
            tokenHash: token.tokenId || `token_${Date.now()}`, // Use hash in production
            scopes,
            riskLevel,
            excessivePermissions,
            grantedAt: token.grantedAt ? new Date(token.grantedAt) : new Date(),
            lastUsed: token.lastUsed ? new Date(token.lastUsed) : null,
            expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
            status: 'active',
            idpMetadata: {
              idpId,
              tokenId: token.tokenId,
            },
          });
          tokensCreated++;
        }
      } catch (error) {
        console.error(`[ShadowIT] Error processing OAuth token for ${token.userEmail}:`, error);
      }
    }

    console.log(`[ShadowIT] OAuth token processing complete: ${tokensCreated} new tokens created`);
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
