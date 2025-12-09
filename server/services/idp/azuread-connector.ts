/**
 * Azure AD / Microsoft Entra ID Connector
 *
 * Connects to Microsoft Graph API to discover:
 * - Service Principals (OAuth apps)
 * - OAuth2 Permission Grants (user consents)
 * - User directory
 * - Sign-in logs (for last access tracking)
 */

import axios, { AxiosError } from 'axios';
import {
  IdPConnector,
  IdPConnectorConfig,
  DiscoveredApp,
  DiscoveredUserAccess,
  DiscoveredOAuthToken
} from './connector.interface';

interface AzureADServicePrincipal {
  id: string;
  appId: string;
  displayName: string;
  appDisplayName?: string;
  publisherName?: string;
  homepage?: string;
  info?: {
    logoUrl?: string;
  };
  oauth2PermissionScopes?: Array<{ value: string; adminConsentDescription?: string }>;
  signInAudience?: string;
  servicePrincipalType?: string;
  tags?: string[];
}

interface AzureADOAuth2PermissionGrant {
  id: string;
  clientId: string;
  principalId: string | null;
  resourceId: string;
  scope: string;
  consentType: string;
  startTime?: string;
  expiryTime?: string;
}

interface AzureADUser {
  id: string;
  userPrincipalName: string;
  displayName?: string;
  mail?: string;
}

/**
 * Azure AD Connector
 *
 * Required Azure AD App Permissions:
 * - Application.Read.All (read app registrations)
 * - User.Read.All (read user directory)
 * - AuditLog.Read.All (read sign-in logs)
 * - Directory.Read.All (read directory data)
 */
export class AzureADConnector extends IdPConnector {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  /**
   * Get OAuth access token for Microsoft Graph API
   */
  private async getAccessToken(): Promise<string> {
    // Check if token is still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) {
      return this.accessToken;
    }

    try {
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

      console.log(`[AzureAD] Access token acquired, expires at ${this.tokenExpiry.toISOString()}`);

      return this.accessToken;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error('[AzureAD] Token acquisition failed:', axiosError.response?.data);
        throw new Error(`Azure AD authentication failed: ${axiosError.message}`);
      }
      throw error;
    }
  }

  /**
   * Make authenticated request to Microsoft Graph API
   */
  private async graphRequest<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const token = await this.getAccessToken();
    const url = endpoint.startsWith('http') ? endpoint : `${this.graphBaseUrl}${endpoint}`;

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error(`[AzureAD] Graph API request failed: ${endpoint}`, axiosError.response?.data);
        throw new Error(`Graph API error: ${axiosError.message}`);
      }
      throw error;
    }
  }

  /**
   * Make paginated request to Microsoft Graph API
   */
  private async graphRequestPaginated<T = any>(endpoint: string): Promise<T[]> {
    const results: T[] = [];
    let nextLink: string | null = endpoint;

    while (nextLink) {
      const token = await this.getAccessToken();
      const url = nextLink.startsWith('http') ? nextLink : `${this.graphBaseUrl}${nextLink}`;

      try {
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        results.push(...(response.data.value || []));
        nextLink = response.data['@odata.nextLink'] || null;

        // Rate limiting: wait 100ms between requests
        if (nextLink) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          console.error(`[AzureAD] Paginated request failed: ${url}`, axiosError.response?.data);
          throw new Error(`Graph API pagination error: ${axiosError.message}`);
        }
        throw error;
      }
    }

    return results;
  }

  /**
   * Test connection to Azure AD
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAccessToken();

      // Test by fetching organization info
      const org = await this.graphRequest<{ value: any[] }>('/organization');

      if (org.value && org.value.length > 0) {
        console.log(`[AzureAD] Connection test successful: ${org.value[0].displayName}`);
        return { success: true };
      }

      return { success: false, error: 'No organization data returned' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Discover all OAuth applications (service principals)
   */
  async discoverApps(): Promise<DiscoveredApp[]> {
    try {
      console.log('[AzureAD] Discovering service principals...');

      // Get all service principals in the tenant
      const servicePrincipals = await this.graphRequestPaginated<AzureADServicePrincipal>('/servicePrincipals');

      console.log(`[AzureAD] Found ${servicePrincipals.length} service principals`);

      const discoveredApps: DiscoveredApp[] = servicePrincipals.map((sp) => {
        const permissions = sp.oauth2PermissionScopes?.map(s => s.value) || [];

        return {
          externalId: sp.appId,
          name: sp.displayName || sp.appDisplayName || 'Unknown App',
          vendor: sp.publisherName,
          logoUrl: sp.info?.logoUrl,
          websiteUrl: sp.homepage,
          permissions,
          metadata: {
            servicePrincipalId: sp.id,
            appId: sp.appId,
            signInAudience: sp.signInAudience,
            servicePrincipalType: sp.servicePrincipalType,
            tags: sp.tags || [],
            permissionCount: permissions.length
          }
        };
      });

      return discoveredApps;
    } catch (error) {
      console.error('[AzureAD] Error discovering apps:', error);
      throw new Error(`Failed to discover Azure AD apps: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover user access to applications
   */
  async discoverUserAccess(): Promise<DiscoveredUserAccess[]> {
    try {
      console.log('[AzureAD] Discovering OAuth permission grants...');

      // Get OAuth2 permission grants (user consents)
      const grants = await this.graphRequestPaginated<AzureADOAuth2PermissionGrant>('/oauth2PermissionGrants');

      console.log(`[AzureAD] Found ${grants.length} OAuth permission grants`);

      const userAccessList: DiscoveredUserAccess[] = [];

      // Get service principal mapping (clientId -> appId)
      const servicePrincipals = await this.graphRequestPaginated<AzureADServicePrincipal>('/servicePrincipals?$select=id,appId');
      const spMap = new Map<string, string>();
      servicePrincipals.forEach(sp => spMap.set(sp.id, sp.appId));

      for (const grant of grants) {
        const appId = spMap.get(grant.clientId);
        if (!appId) {
          console.warn(`[AzureAD] Could not find appId for service principal ${grant.clientId}`);
          continue;
        }

        // Organization-wide grants (principalId is null)
        if (!grant.principalId) {
          // For org-wide grants, we'd need to add access for all users
          // For performance, we'll skip this in Phase 1 and only track user-specific grants
          console.log(`[AzureAD] Skipping org-wide grant for app ${appId} (performance optimization)`);
          continue;
        }

        // User-specific grant
        try {
          const user = await this.graphRequest<AzureADUser>(`/users/${grant.principalId}?$select=userPrincipalName,id`);

          userAccessList.push({
            userId: user.userPrincipalName,
            appExternalId: appId,
            permissions: grant.scope ? grant.scope.split(' ').filter(s => s.trim()) : [],
            grantedDate: grant.startTime ? new Date(grant.startTime) : new Date(),
            lastAccessDate: undefined // Would require sign-in logs analysis
          });
        } catch (error) {
          console.warn(`[AzureAD] Could not fetch user ${grant.principalId}:`, error instanceof Error ? error.message : 'Unknown error');
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`[AzureAD] Processed ${userAccessList.length} user access grants`);

      return userAccessList;
    } catch (error) {
      console.error('[AzureAD] Error discovering user access:', error);
      throw new Error(`Failed to discover user access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover OAuth tokens
   */
  async discoverOAuthTokens(): Promise<DiscoveredOAuthToken[]> {
    try {
      console.log('[AzureAD] Discovering OAuth tokens from grants...');

      // In Azure AD, OAuth tokens are represented by permission grants
      const grants = await this.graphRequestPaginated<AzureADOAuth2PermissionGrant>('/oauth2PermissionGrants');

      // Get service principal mapping
      const servicePrincipals = await this.graphRequestPaginated<AzureADServicePrincipal>('/servicePrincipals?$select=id,appId');
      const spMap = new Map<string, string>();
      servicePrincipals.forEach(sp => spMap.set(sp.id, sp.appId));

      const tokens: DiscoveredOAuthToken[] = [];

      for (const grant of grants) {
        // Only process user-specific grants
        if (!grant.principalId) continue;

        const appId = spMap.get(grant.clientId);
        if (!appId) continue;

        try {
          const user = await this.graphRequest<AzureADUser>(`/users/${grant.principalId}?$select=userPrincipalName`);

          tokens.push({
            userId: user.userPrincipalName,
            appExternalId: appId,
            scopes: grant.scope ? grant.scope.split(' ').filter(s => s.trim()) : [],
            grantedAt: grant.startTime ? new Date(grant.startTime) : new Date(),
            expiresAt: grant.expiryTime ? new Date(grant.expiryTime) : undefined,
            tokenHash: grant.id // Use grant ID as identifier
          });
        } catch (error) {
          console.warn(`[AzureAD] Could not fetch user for token ${grant.id}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`[AzureAD] Discovered ${tokens.length} OAuth tokens`);

      return tokens;
    } catch (error) {
      console.error('[AzureAD] Error discovering OAuth tokens:', error);
      throw new Error(`Failed to discover OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync users from Azure AD
   */
  async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
    try {
      console.log('[AzureAD] Starting user sync...');
      let usersAdded = 0;
      let usersUpdated = 0;

      // Fetch all users from Azure AD
      const response = await this.client.api('/users').get();
      const azureUsers = response.value || [];

      console.log(`[AzureAD] Found ${azureUsers.length} users in Azure AD`);

      for (const azureUser of azureUsers) {
        try {
          const email = azureUser.mail || azureUser.userPrincipalName;
          if (!email) {
            console.log(`[AzureAD] Skipping user without email: ${azureUser.displayName}`);
            continue;
          }

          // Check if user already exists
          const existingUser = await this.storage.getUserByEmail(email, this.tenantId);

          if (existingUser) {
            // Update existing user
            await this.storage.updateUser(existingUser.id, {
              name: azureUser.displayName || existingUser.name,
              firstName: azureUser.givenName || existingUser.firstName,
              lastName: azureUser.surname || existingUser.lastName,
              department: azureUser.department || existingUser.department,
              jobTitle: azureUser.jobTitle || existingUser.jobTitle,
              updatedAt: new Date(),
            });
            usersUpdated++;
          } else {
            // Create new user
            await this.storage.createUser({
              tenantId: this.tenantId,
              email,
              name: azureUser.displayName || email,
              firstName: azureUser.givenName || '',
              lastName: azureUser.surname || '',
              department: azureUser.department || null,
              jobTitle: azureUser.jobTitle || null,
              role: 'user',
              status: azureUser.accountEnabled ? 'active' : 'inactive',
              password: '', // No password for SSO users
            });
            usersAdded++;
          }
        } catch (userError) {
          console.error(`[AzureAD] Error syncing user ${azureUser.mail}:`, userError);
        }
      }

      console.log(`[AzureAD] User sync complete: ${usersAdded} added, ${usersUpdated} updated`);
      return { usersAdded, usersUpdated };
    } catch (error) {
      console.error('[AzureAD] Error syncing users:', error);
      throw new Error(`Failed to sync Azure AD users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's group memberships
   */
  async getUserGroups(userEmail: string): Promise<Array<{ id: string; displayName: string }>> {
    try {
      await this.authenticate();

      // Get user by email
      const userResponse = await this.client
        .api('/users')
        .filter(`mail eq '${userEmail}' or userPrincipalName eq '${userEmail}'`)
        .get();

      if (!userResponse.value || userResponse.value.length === 0) {
        console.log(`[AzureAD] User not found: ${userEmail}`);
        return [];
      }

      const userId = userResponse.value[0].id;

      // Get user's group memberships
      const groupsResponse = await this.client
        .api(`/users/${userId}/memberOf`)
        .get();

      const groups = groupsResponse.value
        .filter((item: any) => item['@odata.type'] === '#microsoft.graph.group')
        .map((group: any) => ({
          id: group.id,
          displayName: group.displayName,
        }));

      console.log(`[AzureAD] Found ${groups.length} groups for user ${userEmail}`);
      return groups;
    } catch (error) {
      console.error(`[AzureAD] Error getting user groups:`, error);
      throw new Error(`Failed to get user groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove user from a group
   */
  async removeUserFromGroup(userEmail: string, groupId: string): Promise<void> {
    try {
      await this.authenticate();

      // Get user by email
      const userResponse = await this.client
        .api('/users')
        .filter(`mail eq '${userEmail}' or userPrincipalName eq '${userEmail}'`)
        .get();

      if (!userResponse.value || userResponse.value.length === 0) {
        throw new Error(`User not found: ${userEmail}`);
      }

      const userId = userResponse.value[0].id;

      // Remove user from group
      await this.client
        .api(`/groups/${groupId}/members/${userId}/$ref`)
        .delete();

      console.log(`[AzureAD] Removed user ${userEmail} from group ${groupId}`);
    } catch (error) {
      console.error(`[AzureAD] Error removing user from group:`, error);
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
          console.warn(`[AzureAD] Failed to remove user from group ${group.displayName}:`, error);
        }
      }

      console.log(`[AzureAD] Removed user ${userEmail} from ${removedCount} groups`);
      return removedCount;
    } catch (error) {
      console.error(`[AzureAD] Error removing user from all groups:`, error);
      throw new Error(`Failed to remove user from all groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
