/**
 * Google Workspace Connector
 *
 * Connects to Google Admin SDK to discover:
 * - OAuth tokens (representing app grants)
 * - User directory
 * - OAuth scopes and permissions
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import {
  IdPConnector,
  IdPConnectorConfig,
  DiscoveredApp,
  DiscoveredUserAccess,
  DiscoveredOAuthToken
} from './connector.interface';

interface GoogleOAuthToken {
  kind?: string;
  etag?: string;
  clientId?: string;
  displayText?: string;
  anonymous?: boolean;
  nativeApp?: boolean;
  userKey?: string;
  scopes?: string[];
}

/**
 * Google Workspace Connector
 *
 * Required Google Workspace API Scopes:
 * - https://www.googleapis.com/auth/admin.directory.user.readonly
 * - https://www.googleapis.com/auth/admin.directory.domain.readonly
 * - https://www.googleapis.com/auth/admin.reports.audit.readonly
 *
 * Setup Requirements:
 * 1. Create service account in Google Cloud Console
 * 2. Enable Admin SDK API
 * 3. Delegate domain-wide authority to service account
 * 4. Grant required scopes in Workspace admin console
 */
export class GoogleWorkspaceConnector extends IdPConnector {
  private auth: JWT | null = null;
  private adminEmail: string;

  constructor(config: IdPConnectorConfig, tenantId: string, idpId: string) {
    super(config, tenantId, idpId);

    // Extract admin email from config (required for domain-wide delegation)
    this.adminEmail = config.customConfig?.adminEmail || config.customConfig?.delegatedAdminEmail;

    if (!this.adminEmail) {
      throw new Error('Google Workspace connector requires adminEmail in customConfig');
    }
  }

  /**
   * Get authenticated JWT client
   */
  private async getAuth(): Promise<JWT> {
    if (this.auth) {
      return this.auth;
    }

    try {
      // Parse service account key from clientSecret
      const serviceAccountKey = JSON.parse(this.config.clientSecret);

      // Create JWT client with domain-wide delegation
      this.auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: this.config.scopes,
        subject: this.adminEmail // Impersonate admin user for domain-wide access
      });

      console.log(`[Google] JWT client created with subject: ${this.adminEmail}`);

      return this.auth;
    } catch (error) {
      console.error('[Google] Failed to create auth client:', error);
      throw new Error(`Google Workspace authentication failed: ${error instanceof Error ? error.message : 'Invalid service account key'}`);
    }
  }

  /**
   * Test connection to Google Workspace
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Test by fetching domains
      const response = await admin.domains.list({ customer: 'my_customer' });

      if (response.data.domains && response.data.domains.length > 0) {
        console.log(`[Google] Connection test successful: ${response.data.domains[0].domainName}`);
        return { success: true };
      }

      return { success: false, error: 'No domains found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Discover all OAuth applications
   */
  async discoverApps(): Promise<DiscoveredApp[]> {
    try {
      console.log('[Google] Discovering OAuth tokens...');

      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Get all OAuth tokens in the domain
      const response = await admin.tokens.list({
        userKey: 'all'
      });

      if (!response.data.items) {
        console.log('[Google] No OAuth tokens found');
        return [];
      }

      console.log(`[Google] Found ${response.data.items.length} OAuth tokens`);

      // Build unique app list from tokens
      const appsMap = new Map<string, DiscoveredApp>();

      for (const token of response.data.items) {
        if (!token.clientId) continue;

        if (!appsMap.has(token.clientId)) {
          appsMap.set(token.clientId, {
            externalId: token.clientId,
            name: token.displayText || token.clientId,
            vendor: this.extractVendorFromClientId(token.clientId),
            logoUrl: undefined, // Google doesn't provide logo URLs
            websiteUrl: undefined,
            permissions: token.scopes || [],
            metadata: {
              anonymous: token.anonymous || false,
              nativeApp: token.nativeApp || false,
              etag: token.etag
            }
          });
        } else {
          // Merge scopes from multiple tokens for the same app
          const existingApp = appsMap.get(token.clientId)!;
          const existingScopes = new Set(existingApp.permissions);
          (token.scopes || []).forEach(scope => existingScopes.add(scope));
          existingApp.permissions = Array.from(existingScopes);
        }
      }

      const discoveredApps = Array.from(appsMap.values());
      console.log(`[Google] Discovered ${discoveredApps.length} unique applications`);

      return discoveredApps;
    } catch (error) {
      console.error('[Google] Error discovering apps:', error);
      throw new Error(`Failed to discover Google Workspace apps: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract vendor name from Google client ID
   */
  private extractVendorFromClientId(clientId: string): string | undefined {
    // Google client IDs often contain domain information
    // Example: 1234567890-abc123.apps.googleusercontent.com
    if (clientId.includes('googleusercontent.com')) {
      return 'Google';
    }

    // Try to extract domain from client ID
    const domainMatch = clientId.match(/([a-z0-9-]+\.[a-z]{2,})/i);
    if (domainMatch) {
      return domainMatch[1];
    }

    return undefined;
  }

  /**
   * Discover user access to applications
   */
  async discoverUserAccess(): Promise<DiscoveredUserAccess[]> {
    try {
      console.log('[Google] Discovering user access...');

      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Get all OAuth tokens
      const response = await admin.tokens.list({
        userKey: 'all'
      });

      if (!response.data.items) {
        return [];
      }

      const userAccessList: DiscoveredUserAccess[] = [];

      for (const token of response.data.items) {
        if (!token.clientId || !token.userKey) continue;

        userAccessList.push({
          userId: token.userKey,
          appExternalId: token.clientId,
          permissions: token.scopes || [],
          grantedDate: new Date(), // Google API doesn't provide grant date
          lastAccessDate: undefined
        });
      }

      console.log(`[Google] Processed ${userAccessList.length} user access grants`);

      return userAccessList;
    } catch (error) {
      console.error('[Google] Error discovering user access:', error);
      throw new Error(`Failed to discover user access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover OAuth tokens
   */
  async discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]> {
    try {
      console.log('[Google] Discovering OAuth tokens...');

      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      const response = await admin.tokens.list({
        userKey: 'all'
      });

      if (!response.data.items) {
        return [];
      }

      const tokens: DiscoveredOAuthToken[] = [];

      for (const token of response.data.items) {
        if (!token.clientId || !token.userKey) continue;

        tokens.push({
          userId: token.userKey,
          appExternalId: token.clientId,
          scopes: token.scopes || [],
          grantedAt: new Date(), // Not provided by Google API
          expiresAt: undefined, // Not provided by Google API
          tokenHash: token.etag // Use etag as identifier
        });
      }

      console.log(`[Google] Discovered ${tokens.length} OAuth tokens`);

      return tokens;
    } catch (error) {
      console.error('[Google] Error discovering OAuth tokens:', error);
      throw new Error(`Failed to discover OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync users from Google Workspace
   */
  async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
    try {
      console.log('[Google] Starting user sync...');
      let usersAdded = 0;
      let usersUpdated = 0;

      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      // Fetch all users from Google Workspace
      const response = await admin.users.list({
        customer: 'my_customer',
        maxResults: 500,
        orderBy: 'email',
      });

      const googleUsers = response.data.users || [];
      console.log(`[Google] Found ${googleUsers.length} users in Google Workspace`);

      for (const googleUser of googleUsers) {
        try {
          const email = googleUser.primaryEmail;
          if (!email) {
            console.log(`[Google] Skipping user without email`);
            continue;
          }

          // Check if user already exists
          const existingUser = await this.storage.getUserByEmail(email, this.tenantId);

          const name = googleUser.name;
          if (existingUser) {
            // Update existing user
            await this.storage.updateUser(existingUser.id, {
              name: name?.fullName || existingUser.name,
              firstName: name?.givenName || existingUser.firstName,
              lastName: name?.familyName || existingUser.lastName,
              department: googleUser.orgUnitPath || existingUser.department,
              updatedAt: new Date(),
            });
            usersUpdated++;
          } else {
            // Create new user
            await this.storage.createUser({
              tenantId: this.tenantId,
              email,
              name: name?.fullName || email,
              firstName: name?.givenName || '',
              lastName: name?.familyName || '',
              department: googleUser.orgUnitPath || null,
              role: 'user',
              status: googleUser.suspended ? 'inactive' : 'active',
              password: '', // No password for SSO users
            });
            usersAdded++;
          }
        } catch (userError) {
          console.error(`[Google] Error syncing user ${googleUser.primaryEmail}:`, userError);
        }
      }

      console.log(`[Google] User sync complete: ${usersAdded} added, ${usersUpdated} updated`);
      return { usersAdded, usersUpdated };
    } catch (error) {
      console.error('[Google] Error syncing users:', error);
      throw new Error(`Failed to sync Google Workspace users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revoke OAuth token for a user (utility method)
   */
  async revokeToken(userEmail: string, clientId: string): Promise<boolean> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      await admin.tokens.delete({
        userKey: userEmail,
        clientId: clientId
      });

      console.log(`[Google] Successfully revoked token for ${userEmail} / ${clientId}`);
      return true;
    } catch (error) {
      console.error(`[Google] Failed to revoke token:`, error);
      return false;
    }
  }

  /**
   * Get user's group memberships
   */
  async getUserGroups(userEmail: string): Promise<Array<{ id: string; name: string; email: string }>> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      const response = await admin.groups.list({
        userKey: userEmail,
      });

      const groups = (response.data.groups || []).map((group: any) => ({
        id: group.id || '',
        name: group.name || '',
        email: group.email || '',
      }));

      console.log(`[Google] Found ${groups.length} groups for user ${userEmail}`);
      return groups;
    } catch (error) {
      console.error(`[Google] Error getting user groups:`, error);
      throw new Error(`Failed to get user groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove user from a group
   */
  async removeUserFromGroup(userEmail: string, groupId: string): Promise<void> {
    try {
      const auth = await this.getAuth();
      const admin = google.admin({ version: 'directory_v1', auth });

      await admin.members.delete({
        groupKey: groupId,
        memberKey: userEmail,
      });

      console.log(`[Google] Removed user ${userEmail} from group ${groupId}`);
    } catch (error) {
      console.error(`[Google] Error removing user from group:`, error);
      throw new Error(`Failed to remove user from group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove user from all groups
   */
  async removeUserFromAllGroups(userEmail: string): Promise<number> {
    try {
      const groups = await this.getUserGroups(userEmail);

      let removedCount = 0;
      for (const group of groups) {
        try {
          await this.removeUserFromGroup(userEmail, group.id);
          removedCount++;
        } catch (error) {
          console.warn(`[Google] Failed to remove user from group ${group.name}:`, error);
        }
      }

      console.log(`[Google] Removed user ${userEmail} from ${removedCount} groups`);
      return removedCount;
    } catch (error) {
      console.error(`[Google] Error removing user from all groups:`, error);
      throw new Error(`Failed to remove user from all groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
