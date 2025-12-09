/**
 * OAuth Revocation Service
 *
 * Handles revocation of OAuth tokens and API access:
 * - Revoke all OAuth tokens for a user
 * - Invalidate refresh tokens
 * - Remove API keys
 * - Log all revocations for audit
 */

import { storage } from '../../storage';
import { decrypt } from '../encryption';

export interface OAuthRevocationResult {
  success: boolean;
  tokensRevoked: number;
  apps: string[];
  errors: string[];
}

/**
 * OAuth Revocation Service
 */
export class OAuthRevocationService {
  constructor(private tenantId: string) {}

  /**
   * Revoke all OAuth tokens for a user
   */
  async revokeAllTokens(userId: string): Promise<OAuthRevocationResult> {
    console.log(`[OAuth Revocation] Revoking all OAuth tokens for user ${userId}`);

    const errors: string[] = [];
    const apps: string[] = [];

    try {
      // Get all OAuth tokens for this user
      const tokens = await storage.getOauthTokens(this.tenantId, { userId });

      console.log(`[OAuth Revocation] Found ${tokens.length} OAuth tokens to revoke`);

      // Revoke each token
      for (const token of tokens) {
        try {
          await this.revokeToken(token);
          if (token.appName) {
            apps.push(token.appName);
          }
        } catch (error: any) {
          console.error(`[OAuth Revocation] Failed to revoke token ${token.id}:`, error);
          errors.push(`Failed to revoke ${token.appName || 'unknown'}: ${error.message}`);
        }
      }

      return {
        success: errors.length === 0,
        tokensRevoked: tokens.length,
        apps,
        errors
      };
    } catch (error: any) {
      console.error(`[OAuth Revocation] Error revoking tokens:`, error);
      return {
        success: false,
        tokensRevoked: 0,
        apps: [],
        errors: [error.message || 'Failed to revoke tokens']
      };
    }
  }

  /**
   * Revoke a single OAuth token
   */
  private async revokeToken(token: any): Promise<void> {
    console.log(`[OAuth Revocation] Revoking token for ${token.appName}`);

    // Get IdP information from token metadata
    const idpId = token.idpMetadata?.idpId;
    const idpTokenId = token.idpMetadata?.tokenId || token.idpTokenId;

    if (idpId) {
      try {
        // Get IdP configuration
        const idp = await storage.getIdentityProvider(idpId, this.tenantId);

        if (idp && idp.status === 'active') {
          console.log(`[OAuth Revocation] Revoking via ${idp.type} provider: ${idp.name}`);

          // Revoke at the provider level
          switch (idp.type) {
            case 'azuread':
              await this.revokeAzureADToken(idp, idpTokenId);
              break;

            case 'google':
              await this.revokeGoogleToken(idp, idpTokenId);
              break;

            case 'okta':
              await this.revokeOktaToken(idp, idpTokenId);
              break;

            default:
              console.log(`[OAuth Revocation] Provider type ${idp.type} not supported for revocation`);
          }
        }
      } catch (error: any) {
        console.error(`[OAuth Revocation] Failed to revoke at provider:`, error);
        // Continue to delete from local database even if provider revocation fails
      }
    }

    // Always delete from our database
    await storage.deleteOauthToken(token.id, this.tenantId);

    console.log(`[OAuth Revocation] Token revoked for ${token.appName}`);
  }

  /**
   * Revoke Azure AD OAuth token
   */
  private async revokeAzureADToken(idp: any, tokenId?: string): Promise<void> {
    if (!tokenId) {
      console.log(`[OAuth Revocation] No token ID available for Azure AD revocation`);
      return;
    }

    const tenantDomain = idp.tenantDomain || 'common';
    const url = `https://login.microsoftonline.com/${tenantDomain}/oauth2/v2.0/revoke`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: tokenId,
          token_type_hint: 'access_token',
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Azure AD revocation failed: ${response.status} ${response.statusText}`);
      }

      console.log(`[OAuth Revocation] Successfully revoked Azure AD token`);
    } catch (error: any) {
      console.error(`[OAuth Revocation] Azure AD revocation error:`, error);
      throw error;
    }
  }

  /**
   * Revoke Google OAuth token
   */
  private async revokeGoogleToken(idp: any, tokenId?: string): Promise<void> {
    if (!tokenId) {
      console.log(`[OAuth Revocation] No token ID available for Google revocation`);
      return;
    }

    const url = 'https://oauth2.googleapis.com/revoke';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: tokenId,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Google revocation failed: ${response.status} ${response.statusText}`);
      }

      console.log(`[OAuth Revocation] Successfully revoked Google token`);
    } catch (error: any) {
      console.error(`[OAuth Revocation] Google revocation error:`, error);
      throw error;
    }
  }

  /**
   * Revoke Okta OAuth token
   */
  private async revokeOktaToken(idp: any, tokenId?: string): Promise<void> {
    if (!tokenId || !idp.tenantDomain) {
      console.log(`[OAuth Revocation] Missing token ID or domain for Okta revocation`);
      return;
    }

    // Decrypt client secret if needed for authentication
    const apiToken = idp.clientSecret ? decrypt(idp.clientSecret) : '';

    const url = `https://${idp.tenantDomain}/oauth2/v1/revoke`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `SSWS ${apiToken}`,
        },
        body: new URLSearchParams({
          token: tokenId,
          token_type_hint: 'access_token',
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Okta revocation failed: ${response.status} ${response.statusText}`);
      }

      console.log(`[OAuth Revocation] Successfully revoked Okta token`);
    } catch (error: any) {
      console.error(`[OAuth Revocation] Okta revocation error:`, error);
      throw error;
    }
  }

  /**
   * Revoke OAuth tokens for a specific app
   */
  async revokeTokensForApp(userId: string, appId: string): Promise<OAuthRevocationResult> {
    console.log(`[OAuth Revocation] Revoking OAuth tokens for user ${userId} and app ${appId}`);

    const errors: string[] = [];
    const apps: string[] = [];

    try {
      // Get OAuth tokens for this user and app
      const tokens = await storage.getOauthTokens(this.tenantId, { userId, appId });

      console.log(`[OAuth Revocation] Found ${tokens.length} OAuth tokens to revoke`);

      // Revoke each token
      for (const token of tokens) {
        try {
          await this.revokeToken(token);
          if (token.appName) {
            apps.push(token.appName);
          }
        } catch (error: any) {
          console.error(`[OAuth Revocation] Failed to revoke token ${token.id}:`, error);
          errors.push(`Failed to revoke ${token.appName || 'unknown'}: ${error.message}`);
        }
      }

      return {
        success: errors.length === 0,
        tokensRevoked: tokens.length,
        apps,
        errors
      };
    } catch (error: any) {
      console.error(`[OAuth Revocation] Error revoking tokens:`, error);
      return {
        success: false,
        tokensRevoked: 0,
        apps: [],
        errors: [error.message || 'Failed to revoke tokens']
      };
    }
  }

  /**
   * Check if user has any active OAuth tokens
   */
  async hasActiveTokens(userId: string): Promise<boolean> {
    const tokens = await storage.getOauthTokens(this.tenantId, { userId });
    return tokens.length > 0;
  }

  /**
   * Get list of apps with OAuth tokens for a user
   */
  async getAppsWithTokens(userId: string): Promise<string[]> {
    const tokens = await storage.getOauthTokens(this.tenantId, { userId });
    const appNames = tokens
      .map(t => t.appName)
      .filter((name): name is string => !!name);
    return [...new Set(appNames)]; // Remove duplicates
  }
}
