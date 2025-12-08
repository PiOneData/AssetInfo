# Phase 1: IdP Integration & Shadow IT Discovery - Design Document

**Status**: Design In Progress
**Created**: 2025-12-08
**Branch**: `claude/review-phase-0-planning-0193vs4PTWxbz7sxNXiCgNvL`
**Dependencies**: Phase 0 Complete ✅

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [IdP Connector Framework](#idp-connector-framework)
4. [Azure AD Integration](#azure-ad-integration)
5. [Google Workspace Integration](#google-workspace-integration)
6. [Shadow IT Detection Engine](#shadow-it-detection-engine)
7. [OAuth Risk Analysis](#oauth-risk-analysis)
8. [Discovery Dashboard](#discovery-dashboard)
9. [Sync Scheduler](#sync-scheduler)
10. [Security Considerations](#security-considerations)
11. [API Endpoints](#api-endpoints)
12. [Implementation Plan](#implementation-plan)

---

## Executive Summary

### Goal
Automatically discover SaaS applications through identity provider integrations (Azure AD, Google Workspace), detect Shadow IT, and provide visibility into the organization's SaaS ecosystem.

### Key Features
- **Automated Discovery**: Connect to Azure AD and Google Workspace to discover OAuth apps
- **Shadow IT Detection**: Identify unapproved SaaS applications
- **User-App Mapping**: Build comprehensive user-to-app access graph
- **OAuth Risk Analysis**: Detect over-permissioned OAuth grants
- **Discovery Dashboard**: Real-time view of discovered apps and risks

### Success Criteria
- Successfully sync from Azure AD and Google Workspace
- Discover 100% of OAuth-connected apps
- Identify unapproved apps with 95%+ accuracy
- Sync completes in <5 minutes for typical org (1000 users, 100 apps)

### Timeline
**Estimated**: 4-6 weeks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   AssetInfo Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           IdP Connector Framework                    │  │
│  │  (Abstract Interface for all IdP integrations)       │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                    │                    │        │
│           ▼                    ▼                    ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Azure AD    │    │   Google     │    │    Okta      │  │
│  │  Connector   │    │  Workspace   │    │  Connector   │  │
│  │              │    │  Connector   │    │  (Phase 2)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│           │                    │                             │
│           └────────────┬───────┘                             │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Shadow IT Detection Engine                     │  │
│  │  - App normalization                                 │  │
│  │  - Deduplication                                     │  │
│  │  - Approval status matching                          │  │
│  │  - Risk scoring                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Data Storage (Phase 0 Tables)              │  │
│  │  - saas_apps                                         │  │
│  │  - user_app_access                                   │  │
│  │  - oauth_tokens                                      │  │
│  │  - identity_providers                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Background Sync Scheduler                    │  │
│  │  - Cron-based periodic sync                          │  │
│  │  - Rate limiting                                     │  │
│  │  - Error handling & retry                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌──────────────────┐                      ┌──────────────────┐
│   Azure AD API   │                      │  Google APIs     │
│  - Graph API     │                      │  - Admin SDK     │
│  - OAuth Apps    │                      │  - Drive API     │
│  - Users/Groups  │                      │  - Directory API │
└──────────────────┘                      └──────────────────┘
```

---

## IdP Connector Framework

### Interface Design

Create a common interface that all IdP connectors implement:

**File**: `server/services/idp/connector.interface.ts`

```typescript
export interface IdPConnectorConfig {
  clientId: string;
  clientSecret: string;
  tenantDomain?: string;
  scopes: string[];
  // Additional config per IdP type
}

export interface DiscoveredApp {
  externalId: string;          // App ID from IdP
  name: string;
  vendor?: string;
  logoUrl?: string;
  websiteUrl?: string;
  permissions: string[];       // OAuth scopes granted
  riskScore?: number;
  metadata: Record<string, any>;
}

export interface DiscoveredUserAccess {
  userId: string;              // User email or ID from IdP
  appExternalId: string;
  permissions: string[];
  lastAccessDate?: Date;
  grantedDate: Date;
}

export interface DiscoveredOAuthToken {
  userId: string;
  appExternalId: string;
  scopes: string[];
  grantedAt: Date;
  expiresAt?: Date;
  tokenHash?: string;          // Hashed token if available
}

export interface SyncResult {
  success: boolean;
  appsDiscovered: number;
  usersProcessed: number;
  tokensDiscovered: number;
  errors: string[];
  syncDuration: number;        // milliseconds
}

export abstract class IdPConnector {
  protected config: IdPConnectorConfig;
  protected tenantId: string;
  protected idpId: string;

  constructor(config: IdPConnectorConfig, tenantId: string, idpId: string) {
    this.config = config;
    this.tenantId = tenantId;
    this.idpId = idpId;
  }

  // Core methods all connectors must implement
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;
  abstract discoverApps(): Promise<DiscoveredApp[]>;
  abstract discoverUserAccess(): Promise<DiscoveredUserAccess[]>;
  abstract discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]>;
  abstract syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }>;

  // Full sync operation
  async performFullSync(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // 1. Discover all apps
      const apps = await this.discoverApps();

      // 2. Discover user access
      const userAccess = await this.discoverUserAccess();

      // 3. Discover OAuth tokens
      const tokens = await this.discoverOAuthTokens();

      // 4. Sync users (optional, updates user directory)
      await this.syncUsers();

      const syncDuration = Date.now() - startTime;

      return {
        success: true,
        appsDiscovered: apps.length,
        usersProcessed: new Set(userAccess.map(u => u.userId)).size,
        tokensDiscovered: tokens.length,
        errors,
        syncDuration
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        appsDiscovered: 0,
        usersProcessed: 0,
        tokensDiscovered: 0,
        errors,
        syncDuration: Date.now() - startTime
      };
    }
  }
}
```

---

## Azure AD Integration

### Authentication Method
Use Microsoft Graph API with OAuth 2.0 client credentials flow.

### Required API Permissions
```
Application.Read.All          - Read app registrations
User.Read.All                 - Read user directory
AuditLog.Read.All            - Read sign-in logs
Directory.Read.All           - Read directory data
```

### Implementation

**File**: `server/services/idp/azuread-connector.ts`

```typescript
import { IdPConnector, DiscoveredApp, DiscoveredUserAccess, DiscoveredOAuthToken } from './connector.interface';
import axios from 'axios';

interface AzureADApp {
  id: string;
  appId: string;
  displayName: string;
  publisherDomain?: string;
  info?: {
    logoUrl?: string;
  };
}

interface AzureADOAuth2PermissionGrant {
  id: string;
  clientId: string;
  principalId: string | null;
  resourceId: string;
  scope: string;
  consentType: string;
  startTime: string;
}

export class AzureADConnector extends IdPConnector {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  private async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // Request new token
    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantDomain}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));

    return this.accessToken;
  }

  private async graphRequest(endpoint: string, params?: Record<string, any>): Promise<any> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0${endpoint}`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params
    });

    return response.data;
  }

  private async graphRequestPaginated(endpoint: string): Promise<any[]> {
    const results: any[] = [];
    let nextLink: string | null = endpoint;

    while (nextLink) {
      const token = await this.getAccessToken();
      const url = nextLink.startsWith('http')
        ? nextLink
        : `https://graph.microsoft.com/v1.0${nextLink}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      results.push(...(response.data.value || []));
      nextLink = response.data['@odata.nextLink'] || null;
    }

    return results;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAccessToken();
      // Test by fetching organization info
      await this.graphRequest('/organization');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async discoverApps(): Promise<DiscoveredApp[]> {
    try {
      // Get all service principals (apps in the tenant)
      const servicePrincipals = await this.graphRequestPaginated('/servicePrincipals');

      const discoveredApps: DiscoveredApp[] = servicePrincipals.map((sp: any) => ({
        externalId: sp.appId,
        name: sp.displayName || sp.appDisplayName,
        vendor: sp.publisherName,
        logoUrl: sp.info?.logoUrl,
        websiteUrl: sp.homepage,
        permissions: sp.oauth2PermissionScopes?.map((s: any) => s.value) || [],
        metadata: {
          servicePrincipalId: sp.id,
          appId: sp.appId,
          signInAudience: sp.signInAudience,
          servicePrincipalType: sp.servicePrincipalType,
          tags: sp.tags || []
        }
      }));

      return discoveredApps;
    } catch (error) {
      console.error('Error discovering Azure AD apps:', error);
      throw error;
    }
  }

  async discoverUserAccess(): Promise<DiscoveredUserAccess[]> {
    try {
      // Get OAuth2 permission grants (user consents)
      const grants = await this.graphRequestPaginated('/oauth2PermissionGrants');

      const userAccessList: DiscoveredUserAccess[] = [];

      for (const grant of grants) {
        // Organization-wide grants (principalId is null)
        if (!grant.principalId) {
          // Get all users for org-wide grants
          const users = await this.graphRequestPaginated('/users?$select=id,userPrincipalName');

          for (const user of users) {
            userAccessList.push({
              userId: user.userPrincipalName,
              appExternalId: grant.clientId, // This is the service principal ID
              permissions: grant.scope ? grant.scope.split(' ') : [],
              grantedDate: new Date(grant.startTime),
              lastAccessDate: undefined // Will get from sign-in logs
            });
          }
        } else {
          // User-specific grant
          try {
            const user = await this.graphRequest(`/users/${grant.principalId}?$select=userPrincipalName`);
            userAccessList.push({
              userId: user.userPrincipalName,
              appExternalId: grant.clientId,
              permissions: grant.scope ? grant.scope.split(' ') : [],
              grantedDate: new Date(grant.startTime)
            });
          } catch (error) {
            console.warn(`Could not fetch user ${grant.principalId}:`, error);
          }
        }
      }

      return userAccessList;
    } catch (error) {
      console.error('Error discovering Azure AD user access:', error);
      throw error;
    }
  }

  async discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]> {
    try {
      // OAuth tokens are represented by grants
      const grants = await this.graphRequestPaginated('/oauth2PermissionGrants');

      const tokens: DiscoveredOAuthToken[] = [];

      for (const grant of grants) {
        if (grant.principalId) {
          try {
            const user = await this.graphRequest(`/users/${grant.principalId}?$select=userPrincipalName`);
            tokens.push({
              userId: user.userPrincipalName,
              appExternalId: grant.clientId,
              scopes: grant.scope ? grant.scope.split(' ') : [],
              grantedAt: new Date(grant.startTime),
              expiresAt: grant.expiryTime ? new Date(grant.expiryTime) : undefined
            });
          } catch (error) {
            console.warn(`Could not fetch user for token ${grant.id}:`, error);
          }
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error discovering Azure AD OAuth tokens:', error);
      throw error;
    }
  }

  async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
    // This would sync Azure AD users into the AssetInfo users table
    // For Phase 1, we'll return placeholder values
    return { usersAdded: 0, usersUpdated: 0 };
  }
}
```

---

## Google Workspace Integration

### Authentication Method
Use Google Admin SDK with OAuth 2.0 service account.

### Required API Scopes
```
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.domain.readonly
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

### Implementation

**File**: `server/services/idp/google-connector.ts`

```typescript
import { IdPConnector, DiscoveredApp, DiscoveredUserAccess, DiscoveredOAuthToken } from './connector.interface';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export class GoogleWorkspaceConnector extends IdPConnector {
  private auth: JWT | null = null;

  private async getAuth(): Promise<JWT> {
    if (this.auth) {
      return this.auth;
    }

    // Expects config.clientSecret to contain the service account key JSON
    const serviceAccountKey = JSON.parse(this.config.clientSecret);

    this.auth = new google.auth.JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: this.config.scopes
    });

    return this.auth;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Test by fetching domains
      await admin.domains.list({ customer: 'my_customer' });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async discoverApps(): Promise<DiscoveredApp[]> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Get OAuth tokens which represent app grants
      const response = await admin.tokens.list({
        userKey: 'all'
      });

      const apps = new Map<string, DiscoveredApp>();

      for (const token of response.data.items || []) {
        if (!apps.has(token.clientId!)) {
          apps.set(token.clientId!, {
            externalId: token.clientId!,
            name: token.displayText || token.clientId!,
            vendor: 'Unknown', // Google doesn't provide this directly
            logoUrl: undefined,
            websiteUrl: undefined,
            permissions: token.scopes || [],
            metadata: {
              anonymous: token.anonymous,
              nativeApp: token.nativeApp
            }
          });
        }
      }

      return Array.from(apps.values());
    } catch (error) {
      console.error('Error discovering Google Workspace apps:', error);
      throw error;
    }
  }

  async discoverUserAccess(): Promise<DiscoveredUserAccess[]> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Get all OAuth tokens
      const response = await admin.tokens.list({
        userKey: 'all'
      });

      const userAccessList: DiscoveredUserAccess[] = [];

      for (const token of response.data.items || []) {
        userAccessList.push({
          userId: token.userKey!,
          appExternalId: token.clientId!,
          permissions: token.scopes || [],
          grantedDate: new Date(), // Google doesn't provide grant date directly
          lastAccessDate: undefined
        });
      }

      return userAccessList;
    } catch (error) {
      console.error('Error discovering Google Workspace user access:', error);
      throw error;
    }
  }

  async discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      const response = await admin.tokens.list({
        userKey: 'all'
      });

      const tokens: DiscoveredOAuthToken[] = [];

      for (const token of response.data.items || []) {
        tokens.push({
          userId: token.userKey!,
          appExternalId: token.clientId!,
          scopes: token.scopes || [],
          grantedAt: new Date(), // Not provided by API
          expiresAt: undefined,
          tokenHash: token.etag
        });
      }

      return tokens;
    } catch (error) {
      console.error('Error discovering Google Workspace OAuth tokens:', error);
      throw error;
    }
  }

  async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
    // Placeholder for Phase 1
    return { usersAdded: 0, usersUpdated: 0 };
  }
}
```

---

## Shadow IT Detection Engine

**File**: `server/services/shadowit-detector.ts`

```typescript
import { storage } from '../storage';
import { DiscoveredApp } from './idp/connector.interface';

interface ShadowITResult {
  isUnapproved: boolean;
  riskScore: number;
  riskFactors: string[];
  matchedApp?: any;
}

export class ShadowITDetector {
  constructor(private tenantId: string) {}

  /**
   * Normalize app name for comparison
   */
  private normalizeAppName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Check if discovered app matches approved app
   */
  private async findMatchingApp(discoveredApp: DiscoveredApp): Promise<any | null> {
    const apps = await storage.getSaasApps(this.tenantId, {});
    const normalizedName = this.normalizeAppName(discoveredApp.name);

    // Try exact match first
    for (const app of apps) {
      if (this.normalizeAppName(app.name) === normalizedName) {
        return app;
      }
    }

    // Try vendor match
    if (discoveredApp.vendor) {
      const normalizedVendor = this.normalizeAppName(discoveredApp.vendor);
      for (const app of apps) {
        if (app.vendor && this.normalizeAppName(app.vendor) === normalizedVendor) {
          return app;
        }
      }
    }

    return null;
  }

  /**
   * Calculate risk score based on permissions and app characteristics
   */
  private calculateRiskScore(app: DiscoveredApp): { score: number; factors: string[] } {
    let score = 0;
    const factors: string[] = [];

    // Check for high-risk permissions
    const highRiskScopes = [
      'mail.read', 'mail.readwrite', 'mail.send',
      'files.readwrite', 'files.readwrite.all',
      'user.read.all', 'directory.read.all',
      'contacts.read', 'calendars.read'
    ];

    const grantedHighRiskScopes = app.permissions.filter(p =>
      highRiskScopes.some(hrs => p.toLowerCase().includes(hrs.toLowerCase()))
    );

    if (grantedHighRiskScopes.length > 0) {
      score += grantedHighRiskScopes.length * 15;
      factors.push(`High-risk permissions: ${grantedHighRiskScopes.join(', ')}`);
    }

    // Unknown vendor
    if (!app.vendor || app.vendor === 'Unknown') {
      score += 10;
      factors.push('Unknown vendor');
    }

    // No website URL
    if (!app.websiteUrl) {
      score += 5;
      factors.push('No website URL available');
    }

    // Cap at 100
    score = Math.min(score, 100);

    return { score, factors };
  }

  /**
   * Analyze discovered app for Shadow IT
   */
  async analyzeApp(discoveredApp: DiscoveredApp): Promise<ShadowITResult> {
    const matchedApp = await this.findMatchingApp(discoveredApp);
    const { score, factors } = this.calculateRiskScore(discoveredApp);

    if (!matchedApp) {
      // New, unapproved app
      return {
        isUnapproved: true,
        riskScore: score,
        riskFactors: ['App not in approved catalog', ...factors],
        matchedApp: null
      };
    }

    // Check approval status
    if (matchedApp.approvalStatus === 'denied') {
      return {
        isUnapproved: true,
        riskScore: Math.min(score + 30, 100),
        riskFactors: ['App explicitly denied', ...factors],
        matchedApp
      };
    }

    if (matchedApp.approvalStatus === 'pending') {
      return {
        isUnapproved: true,
        riskScore: score,
        riskFactors: ['App approval pending', ...factors],
        matchedApp
      };
    }

    // Approved app
    return {
      isUnapproved: false,
      riskScore: score,
      riskFactors: factors,
      matchedApp
    };
  }

  /**
   * Process batch of discovered apps
   */
  async processBatch(discoveredApps: DiscoveredApp[]): Promise<void> {
    for (const discoveredApp of discoveredApps) {
      const analysis = await this.analyzeApp(discoveredApp);

      // Create or update app in database
      const existingApp = analysis.matchedApp;

      if (!existingApp) {
        // Create new app as pending approval
        await storage.createSaasApp({
          tenantId: this.tenantId,
          name: discoveredApp.name,
          vendor: discoveredApp.vendor,
          logoUrl: discoveredApp.logoUrl,
          websiteUrl: discoveredApp.websiteUrl,
          approvalStatus: 'pending',
          riskScore: analysis.riskScore,
          riskFactors: analysis.riskFactors,
          discoveryMethod: 'idp',
          discoveryDate: new Date(),
          metadata: discoveredApp.metadata
        });
      } else {
        // Update existing app with discovery metadata
        await storage.updateSaasApp(existingApp.id, this.tenantId, {
          lastUsed: new Date(),
          discoveryDate: new Date(),
          discoveryMethod: 'idp',
          riskScore: analysis.riskScore,
          riskFactors: analysis.riskFactors
        });
      }
    }
  }
}
```

---

## OAuth Risk Analysis

**File**: `server/services/oauth-risk-analyzer.ts`

```typescript
export interface OAuthRiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  reasons: string[];
}

export class OAuthRiskAnalyzer {
  /**
   * Assess risk of OAuth permissions
   */
  static assessPermissions(scopes: string[]): OAuthRiskAssessment {
    let score = 0;
    const reasons: string[] = [];

    // Critical data access
    const criticalScopes = [
      { pattern: /mail\.(read|readwrite|send)/i, points: 30, reason: 'Email access' },
      { pattern: /files\.(read|readwrite)\.all/i, points: 30, reason: 'Full file system access' },
      { pattern: /user\.read\.all/i, points: 25, reason: 'All user data access' },
      { pattern: /directory\.read\.all/i, points: 25, reason: 'Directory read access' },
      { pattern: /contacts\.read/i, points: 15, reason: 'Contact access' },
      { pattern: /calendars\.read/i, points: 15, reason: 'Calendar access' }
    ];

    for (const scope of scopes) {
      for (const critical of criticalScopes) {
        if (critical.pattern.test(scope)) {
          score += critical.points;
          if (!reasons.includes(critical.reason)) {
            reasons.push(critical.reason);
          }
        }
      }
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 75) riskLevel = 'critical';
    else if (score >= 50) riskLevel = 'high';
    else if (score >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    return { riskLevel, riskScore: Math.min(score, 100), reasons };
  }
}
```

---

## Discovery Dashboard

### API Endpoints

**File**: `server/routes/discovery.routes.ts`

```typescript
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";

const router = Router();

/**
 * GET /api/discovery/stats
 * Get discovery statistics
 */
router.get("/stats", authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getSaasAppStats(req.user!.tenantId);

    // Add discovery-specific stats
    const unapprovedApps = await storage.getSaasApps(req.user!.tenantId, {
      approvalStatus: 'pending'
    });

    const deniedApps = await storage.getSaasApps(req.user!.tenantId, {
      approvalStatus: 'denied'
    });

    res.json({
      ...stats,
      unapprovedCount: unapprovedApps.length,
      deniedCount: deniedApps.length
    });
  } catch (error) {
    console.error('Failed to fetch discovery stats:', error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

/**
 * GET /api/discovery/shadow-it
 * Get Shadow IT apps (unapproved)
 */
router.get("/shadow-it", authenticateToken, async (req: Request, res: Response) => {
  try {
    const shadowITApps = await storage.getSaasApps(req.user!.tenantId, {
      approvalStatus: 'pending'
    });

    // Sort by risk score descending
    shadowITApps.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

    res.json(shadowITApps);
  } catch (error) {
    console.error('Failed to fetch Shadow IT apps:', error);
    res.status(500).json({ message: "Failed to fetch Shadow IT apps" });
  }
});

/**
 * GET /api/discovery/high-risk
 * Get high-risk OAuth tokens
 */
router.get("/high-risk", authenticateToken, async (req: Request, res: Response) => {
  try {
    // This would query oauth_tokens table for high/critical risk tokens
    // For now return placeholder
    res.json([]);
  } catch (error) {
    console.error('Failed to fetch high-risk tokens:', error);
    res.status(500).json({ message: "Failed to fetch high-risk tokens" });
  }
});

export default router;
```

---

## Sync Scheduler

**File**: `server/services/idp/sync-scheduler.ts`

```typescript
import cron from 'node-cron';
import { storage } from '../storage';
import { AzureADConnector } from './azuread-connector';
import { GoogleWorkspaceConnector } from './google-connector';
import { ShadowITDetector } from '../shadowit-detector';
import { decrypt } from '../encryption';

export class IdPSyncScheduler {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Schedule sync for a tenant's identity providers
   */
  async scheduleForTenant(tenantId: string): Promise<void> {
    const providers = await storage.getIdentityProviders(tenantId);

    for (const provider of providers) {
      if (provider.syncEnabled && provider.status === 'active') {
        await this.scheduleProvider(tenantId, provider);
      }
    }
  }

  /**
   * Schedule sync for a specific provider
   */
  private async scheduleProvider(tenantId: string, provider: any): Promise<void> {
    const taskKey = `${tenantId}-${provider.id}`;

    // Remove existing schedule if any
    if (this.scheduledTasks.has(taskKey)) {
      this.scheduledTasks.get(taskKey)?.stop();
    }

    // Convert sync interval (seconds) to cron expression
    const intervalMinutes = Math.floor(provider.syncInterval / 60);
    const cronExpression = `*/${intervalMinutes} * * * *`; // Every N minutes

    const task = cron.schedule(cronExpression, async () => {
      await this.performSync(tenantId, provider);
    });

    this.scheduledTasks.set(taskKey, task);

    console.log(`Scheduled sync for provider ${provider.name} (${provider.type}) - every ${intervalMinutes} minutes`);
  }

  /**
   * Perform sync for a provider
   */
  private async performSync(tenantId: string, provider: any): Promise<void> {
    try {
      console.log(`Starting sync for ${provider.name} (${provider.type})`);

      // Update status to syncing
      await storage.updateIdpSyncStatus(provider.id, tenantId, 'syncing');

      // Create connector
      const config = {
        clientId: provider.clientId,
        clientSecret: decrypt(provider.clientSecret),
        tenantDomain: provider.tenantDomain,
        scopes: provider.scopes || []
      };

      let connector;
      if (provider.type === 'azuread') {
        connector = new AzureADConnector(config, tenantId, provider.id);
      } else if (provider.type === 'google') {
        connector = new GoogleWorkspaceConnector(config, tenantId, provider.id);
      } else {
        throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      // Perform sync
      const result = await connector.performFullSync();

      if (result.success) {
        // Process discovered apps with Shadow IT detector
        const detector = new ShadowITDetector(tenantId);
        const apps = await connector.discoverApps();
        await detector.processBatch(apps);

        // Update sync status
        await storage.updateIdpSyncStatus(provider.id, tenantId, 'idle', null, new Date());

        console.log(`Sync completed for ${provider.name}: ${result.appsDiscovered} apps, ${result.usersProcessed} users`);
      } else {
        await storage.updateIdpSyncStatus(
          provider.id,
          tenantId,
          'error',
          result.errors.join('; ')
        );
        console.error(`Sync failed for ${provider.name}:`, result.errors);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateIdpSyncStatus(provider.id, tenantId, 'error', errorMessage);
      console.error(`Sync error for ${provider.name}:`, error);
    }
  }

  /**
   * Trigger immediate sync
   */
  async triggerImmediateSync(tenantId: string, providerId: string): Promise<void> {
    const provider = await storage.getIdentityProvider(providerId, tenantId);
    if (provider) {
      await this.performSync(tenantId, provider);
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    for (const task of this.scheduledTasks.values()) {
      task.stop();
    }
    this.scheduledTasks.clear();
  }
}

// Singleton instance
export const idpSyncScheduler = new IdPSyncScheduler();
```

---

## Security Considerations

### Credential Storage
- ✅ Client secrets encrypted at rest (using existing encryption service)
- ✅ OAuth tokens never stored in plaintext
- ✅ Service account keys encrypted

### API Rate Limiting
- Implement exponential backoff for IdP API calls
- Respect API rate limits (Azure: 2000 req/min, Google: 1500 req/min)
- Cache responses where possible

### Access Control
- IdP configuration: Admin only
- Sync trigger: Admin only
- Discovery dashboard: IT Manager+

### Audit Logging
- Log all sync operations
- Log approval status changes
- Log OAuth token discoveries

---

## Implementation Plan

### Week 1: Foundation
- [ ] Create IdP connector framework interface
- [ ] Implement Azure AD connector (basic)
- [ ] Implement Google Workspace connector (basic)
- [ ] Add connector tests

### Week 2: Shadow IT Detection
- [ ] Build Shadow IT detection engine
- [ ] Implement app normalization and matching
- [ ] Add OAuth risk analyzer
- [ ] Process discovered apps into database

### Week 3: Sync & Scheduler
- [ ] Implement background sync scheduler
- [ ] Add sync status tracking
- [ ] Implement manual sync trigger
- [ ] Add error handling and retry logic

### Week 4: Dashboard & UI
- [ ] Build discovery API endpoints
- [ ] Create discovery dashboard page
- [ ] Add Shadow IT alerts
- [ ] Add high-risk permissions view

### Week 5-6: Testing & Refinement
- [ ] Integration testing with real IdPs
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Documentation

---

## Success Metrics

- **Discovery Coverage**: 100% of OAuth apps discovered
- **Sync Performance**: <5 minutes for 1000 users, 100 apps
- **Shadow IT Detection**: 95%+ accuracy
- **False Positive Rate**: <5%
- **API Reliability**: 99%+ uptime

---

## Next Steps

1. Create connector interface and base classes
2. Implement Azure AD connector
3. Implement Google Workspace connector
4. Build Shadow IT detection engine
5. Create discovery dashboard

Ready to begin implementation!
