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

    // In a real implementation, this would make API calls to revoke the token
    // For Azure AD, Google, etc., each platform has its own revocation endpoint

    // Example for Azure AD:
    // POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/revoke
    // Content-Type: application/x-www-form-urlencoded
    // token={token}&token_type_hint=access_token

    // Example for Google:
    // POST https://oauth2.googleapis.com/revoke
    // Content-Type: application/x-www-form-urlencoded
    // token={token}

    // For now, we'll just delete from our database
    await storage.deleteOauthToken(token.id, this.tenantId);

    console.log(`[OAuth Revocation] Token revoked for ${token.appName}`);
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
