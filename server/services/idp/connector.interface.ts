/**
 * IdP Connector Framework
 *
 * Common interface for all identity provider integrations.
 * Supports Azure AD, Google Workspace, Okta, and other IdPs.
 */

export interface IdPConnectorConfig {
  clientId: string;
  clientSecret: string;
  tenantDomain?: string;
  scopes: string[];
  customConfig?: Record<string, any>;
}

export interface DiscoveredApp {
  externalId: string;          // App ID from IdP (appId, clientId, etc.)
  name: string;
  vendor?: string;
  logoUrl?: string;
  websiteUrl?: string;
  permissions: string[];       // OAuth scopes/permissions granted
  riskScore?: number;
  metadata: Record<string, any>;
}

export interface DiscoveredUserAccess {
  userId: string;              // User email or ID from IdP
  appExternalId: string;       // References DiscoveredApp.externalId
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
  tokenHash?: string;          // Hashed token if available (never plaintext)
}

export interface SyncResult {
  success: boolean;
  appsDiscovered: number;
  usersProcessed: number;
  tokensDiscovered: number;
  errors: string[];
  syncDuration: number;        // milliseconds
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for IdP connectors
 */
export abstract class IdPConnector {
  protected config: IdPConnectorConfig;
  protected tenantId: string;
  protected idpId: string;

  constructor(config: IdPConnectorConfig, tenantId: string, idpId: string) {
    this.config = config;
    this.tenantId = tenantId;
    this.idpId = idpId;
  }

  /**
   * Test connection to IdP
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * Discover all OAuth applications in the tenant
   */
  abstract discoverApps(): Promise<DiscoveredApp[]>;

  /**
   * Discover user access to applications
   */
  abstract discoverUserAccess(): Promise<DiscoveredUserAccess[]>;

  /**
   * Discover OAuth tokens granted to applications
   */
  abstract discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]>;

  /**
   * Sync users from IdP to AssetInfo (optional)
   */
  abstract syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }>;

  /**
   * Perform full synchronization
   */
  async performFullSync(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let appsDiscovered = 0;
    let usersProcessed = 0;
    let tokensDiscovered = 0;

    try {
      console.log(`[${this.constructor.name}] Starting full sync for tenant ${this.tenantId}`);

      // 1. Test connection first
      const connectionTest = await this.testConnection();
      if (!connectionTest.success) {
        errors.push(`Connection test failed: ${connectionTest.error}`);
        throw new Error(connectionTest.error);
      }

      // 2. Discover all apps
      console.log(`[${this.constructor.name}] Discovering applications...`);
      const apps = await this.discoverApps();
      appsDiscovered = apps.length;
      console.log(`[${this.constructor.name}] Discovered ${appsDiscovered} applications`);

      // 3. Discover user access
      console.log(`[${this.constructor.name}] Discovering user access...`);
      const userAccess = await this.discoverUserAccess();
      usersProcessed = new Set(userAccess.map(u => u.userId)).size;
      console.log(`[${this.constructor.name}] Processed ${usersProcessed} users with ${userAccess.length} access grants`);

      // 4. Discover OAuth tokens
      console.log(`[${this.constructor.name}] Discovering OAuth tokens...`);
      const tokens = await this.discoverOAuthTokens();
      tokensDiscovered = tokens.length;
      console.log(`[${this.constructor.name}] Discovered ${tokensDiscovered} OAuth tokens`);

      // 5. Sync users (optional)
      try {
        const userSyncResult = await this.syncUsers();
        console.log(`[${this.constructor.name}] User sync: ${userSyncResult.usersAdded} added, ${userSyncResult.usersUpdated} updated`);
      } catch (error) {
        console.warn(`[${this.constructor.name}] User sync failed (non-critical):`, error);
        errors.push(`User sync warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const syncDuration = Date.now() - startTime;

      return {
        success: true,
        appsDiscovered,
        usersProcessed,
        tokensDiscovered,
        errors,
        syncDuration,
        metadata: {
          apps,
          userAccess,
          tokens
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      console.error(`[${this.constructor.name}] Sync failed:`, error);

      return {
        success: false,
        appsDiscovered,
        usersProcessed,
        tokensDiscovered,
        errors,
        syncDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Get connector name
   */
  getName(): string {
    return this.constructor.name;
  }
}
