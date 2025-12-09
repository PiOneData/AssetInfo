import { storage } from '../../storage';
import type { IdPConfig, DiscoveredApp } from './types';

/**
 * Okta Identity Provider Connector
 * Integrates with Okta API to discover SaaS applications and user access
 */
export class OktaConnector {
  private config: IdPConfig;
  private tenantId: string;
  private providerId: string;
  private storage: typeof storage;
  private baseUrl: string;
  private apiToken: string;

  constructor(config: IdPConfig, tenantId: string, providerId: string) {
    this.config = config;
    this.tenantId = tenantId;
    this.providerId = providerId;
    this.storage = storage;

    // Extract Okta-specific configuration
    const oktaDomain = config.oktaDomain || config.domain;
    const oktaApiToken = config.oktaApiToken || config.apiKey;

    if (!oktaDomain || !oktaApiToken) {
      throw new Error('Okta configuration requires domain and API token');
    }

    this.baseUrl = `https://${oktaDomain}`;
    this.apiToken = oktaApiToken;
  }

  /**
   * Make authenticated API call to Okta
   */
  private async oktaApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'Authorization': `SSWS ${this.apiToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new Error(`Okta API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Discover applications from Okta
   */
  async discoverApps(): Promise<DiscoveredApp[]> {
    try {
      console.log('[Okta] Starting app discovery...');

      // Get all apps from Okta
      const apps = await this.oktaApiCall('/apps');
      const discoveredApps: DiscoveredApp[] = [];

      for (const app of apps) {
        // Skip inactive apps
        if (app.status !== 'ACTIVE') {
          continue;
        }

        discoveredApps.push({
          externalId: app.id,
          name: app.label || app.name,
          vendor: 'Unknown', // Okta doesn't provide vendor info directly
          category: this.mapOktaCategory(app.signOnMode),
          website: app.settings?.app?.url || null,
          description: app.description || null,
          logoUrl: app._links?.logo?.[0]?.href || null,
          users: [], // Will be populated separately
          lastSync: new Date().toISOString(),
        });
      }

      console.log(`[Okta] Discovered ${discoveredApps.length} apps`);
      return discoveredApps;
    } catch (error) {
      console.error('[Okta] Error discovering apps:', error);
      throw new Error(`Failed to discover Okta apps: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Map Okta sign-on mode to app category
   */
  private mapOktaCategory(signOnMode: string): string {
    const categoryMap: Record<string, string> = {
      'SAML_2_0': 'Authentication',
      'WS_FEDERATION': 'Authentication',
      'OPENID_CONNECT': 'Authentication',
      'SECURE_PASSWORD_STORE': 'Productivity',
      'AUTO_LOGIN': 'Productivity',
      'BOOKMARK': 'Productivity',
    };

    return categoryMap[signOnMode] || 'Other';
  }

  /**
   * Sync users from Okta
   */
  async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
    try {
      console.log('[Okta] Starting user sync...');
      let usersAdded = 0;
      let usersUpdated = 0;

      // Fetch all active users from Okta
      const users = await this.oktaApiCall('/users?filter=status eq "ACTIVE"');

      console.log(`[Okta] Found ${users.length} active users`);

      for (const oktaUser of users) {
        try {
          const email = oktaUser.profile.email;
          if (!email) {
            console.log(`[Okta] Skipping user without email: ${oktaUser.profile.login}`);
            continue;
          }

          // Check if user already exists
          const existingUser = await this.storage.getUserByEmail(email, this.tenantId);

          if (existingUser) {
            // Update existing user
            await this.storage.updateUser(existingUser.id, {
              name: `${oktaUser.profile.firstName || ''} ${oktaUser.profile.lastName || ''}`.trim() || existingUser.name,
              firstName: oktaUser.profile.firstName || existingUser.firstName,
              lastName: oktaUser.profile.lastName || existingUser.lastName,
              department: oktaUser.profile.department || existingUser.department,
              jobTitle: oktaUser.profile.title || existingUser.jobTitle,
              updatedAt: new Date(),
            });
            usersUpdated++;
          } else {
            // Create new user
            await this.storage.createUser({
              tenantId: this.tenantId,
              email,
              name: `${oktaUser.profile.firstName || ''} ${oktaUser.profile.lastName || ''}`.trim() || email,
              firstName: oktaUser.profile.firstName || '',
              lastName: oktaUser.profile.lastName || '',
              department: oktaUser.profile.department || null,
              jobTitle: oktaUser.profile.title || null,
              role: 'user',
              status: oktaUser.status === 'ACTIVE' ? 'active' : 'inactive',
              password: '', // No password for SSO users
            });
            usersAdded++;
          }
        } catch (userError) {
          console.error(`[Okta] Error syncing user ${oktaUser.profile.email}:`, userError);
        }
      }

      console.log(`[Okta] User sync complete: ${usersAdded} added, ${usersUpdated} updated`);
      return { usersAdded, usersUpdated };
    } catch (error) {
      console.error('[Okta] Error syncing users:', error);
      throw new Error(`Failed to sync Okta users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover user access to applications
   */
  async discoverUserAccess(): Promise<any[]> {
    try {
      console.log('[Okta] Starting user access discovery...');
      const userAccessList: any[] = [];

      // Get all applications
      const apps = await this.oktaApiCall('/apps');

      for (const app of apps) {
        if (app.status !== 'ACTIVE') continue;

        // Get app assignments (users assigned to this app)
        const assignments = await this.oktaApiCall(`/apps/${app.id}/users`);

        for (const assignment of assignments) {
          const user = await this.oktaApiCall(`/users/${assignment.id}`);

          userAccessList.push({
            externalId: app.id,
            userEmail: user.profile.email,
            grantedDate: assignment.created,
            lastAccessDate: assignment.lastUpdated,
            permissions: [],
            roles: assignment.scope ? [assignment.scope] : [],
          });
        }
      }

      console.log(`[Okta] Discovered ${userAccessList.length} user access grants`);
      return userAccessList;
    } catch (error) {
      console.error('[Okta] Error discovering user access:', error);
      throw new Error(`Failed to discover user access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover OAuth tokens (Okta doesn't expose this directly)
   */
  async discoverOAuthTokens(): Promise<any[]> {
    console.log('[Okta] OAuth token discovery not supported by Okta API');
    return [];
  }
}
