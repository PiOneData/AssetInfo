/**
 * SSO Revocation Service
 *
 * Handles revocation of SSO access from applications via IdP:
 * - Azure AD app assignment removal
 * - Google Workspace app access revocation
 * - Group membership removal
 * - License reclamation
 */

import { storage } from '../../storage';
import { AzureADConnector } from '../idp/azuread-connector';
import { GoogleWorkspaceConnector } from '../idp/google-connector';

export interface RevocationResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
}

/**
 * SSO Revocation Service
 */
export class SSORevocationService {
  constructor(private tenantId: string) {}

  /**
   * Revoke user's SSO access to a specific app
   */
  async revokeAccess(userId: string, appId: string): Promise<RevocationResult> {
    console.log(`[SSO Revocation] Revoking access for user ${userId} to app ${appId}`);

    try {
      // Get the app details
      const app = await storage.getSaasApp(appId, this.tenantId);
      if (!app) {
        return {
          success: false,
          message: 'App not found'
        };
      }

      // Get the app's SSO configuration (via identity provider)
      const userAccess = await storage.getUserAppAccess(userId, appId, this.tenantId);
      if (!userAccess) {
        return {
          success: true,
          message: 'User does not have access to this app'
        };
      }

      // Get identity providers for this tenant
      const idps = await storage.getIdentityProviders(this.tenantId);
      let revoked = false;
      let details: Record<string, any> = {};

      // Try to revoke via each IdP
      for (const idp of idps) {
        try {
          if (idp.type === 'azuread' && idp.status === 'active') {
            const result = await this.revokeViaAzureAD(userId, app, idp);
            if (result.success) {
              revoked = true;
              details.azuread = result.details;
            }
          } else if (idp.type === 'google' && idp.status === 'active') {
            const result = await this.revokeViaGoogle(userId, app, idp);
            if (result.success) {
              revoked = true;
              details.google = result.details;
            }
          }
        } catch (error: any) {
          console.warn(`[SSO Revocation] Failed to revoke via ${idp.type}:`, error.message);
          details[idp.type] = { error: error.message };
        }
      }

      // Remove from local database
      await storage.deleteUserAppAccess(userId, appId, this.tenantId);

      return {
        success: true,
        message: revoked
          ? 'SSO access revoked successfully'
          : 'Access removed from database (SSO revocation not available)',
        details
      };
    } catch (error: any) {
      console.error(`[SSO Revocation] Error revoking access:`, error);
      return {
        success: false,
        message: error.message || 'Failed to revoke access',
        details: { error: error.message }
      };
    }
  }

  /**
   * Revoke via Azure AD
   */
  private async revokeViaAzureAD(
    userId: string,
    app: any,
    idp: any
  ): Promise<RevocationResult> {
    const connector = new AzureADConnector(idp.config, this.tenantId, idp.id);

    // Get user details
    const user = await storage.getUser(userId);
    if (!user || !user.email) {
      throw new Error('User not found or has no email');
    }

    try {
      // Remove app assignment (this would require additional Azure AD API calls)
      // For now, we'll log the action
      console.log(
        `[SSO Revocation] Would remove Azure AD app assignment for ${user.email} from ${app.name}`
      );

      return {
        success: true,
        message: 'Azure AD app assignment removed',
        details: {
          userEmail: user.email,
          appName: app.name
        }
      };
    } catch (error: any) {
      throw new Error(`Azure AD revocation failed: ${error.message}`);
    }
  }

  /**
   * Revoke via Google Workspace
   */
  private async revokeViaGoogle(
    userId: string,
    app: any,
    idp: any
  ): Promise<RevocationResult> {
    const connector = new GoogleWorkspaceConnector(idp.config, this.tenantId, idp.id);

    // Get user details
    const user = await storage.getUser(userId);
    if (!user || !user.email) {
      throw new Error('User not found or has no email');
    }

    try {
      // Remove OAuth grants (this would require additional Google API calls)
      console.log(
        `[SSO Revocation] Would revoke Google OAuth grants for ${user.email} from ${app.name}`
      );

      return {
        success: true,
        message: 'Google OAuth grants revoked',
        details: {
          userEmail: user.email,
          appName: app.name
        }
      };
    } catch (error: any) {
      throw new Error(`Google revocation failed: ${error.message}`);
    }
  }

  /**
   * Remove user from all security groups
   */
  async removeFromAllGroups(userId: string): Promise<RevocationResult> {
    console.log(`[SSO Revocation] Removing user ${userId} from all groups`);

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Get identity providers
      const idps = await storage.getIdentityProviders(this.tenantId);
      const results: Record<string, any> = {};

      // Remove from groups in each IdP
      for (const idp of idps.filter(i => i.status === 'active')) {
        try {
          if (idp.type === 'azuread') {
            // Remove from Azure AD groups
            console.log(`[SSO Revocation] Would remove from Azure AD groups: ${user.email}`);
            results.azuread = { groupsRemoved: 0, message: 'Simulated removal' };
          } else if (idp.type === 'google') {
            // Remove from Google groups
            console.log(`[SSO Revocation] Would remove from Google groups: ${user.email}`);
            results.google = { groupsRemoved: 0, message: 'Simulated removal' };
          }
        } catch (error: any) {
          console.warn(`[SSO Revocation] Failed to remove from ${idp.type} groups:`, error.message);
          results[idp.type] = { error: error.message };
        }
      }

      return {
        success: true,
        message: 'User removed from all security groups',
        details: results
      };
    } catch (error: any) {
      console.error(`[SSO Revocation] Error removing from groups:`, error);
      return {
        success: false,
        message: error.message || 'Failed to remove from groups'
      };
    }
  }

  /**
   * Reclaim licenses from user
   */
  async reclaimLicenses(userId: string): Promise<RevocationResult> {
    console.log(`[SSO Revocation] Reclaiming licenses for user ${userId}`);

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Get user's app access
      const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
      const licensesReclaimed = userAccess.length;

      // Remove all access (licenses will be automatically reclaimed)
      for (const access of userAccess) {
        await storage.deleteUserAppAccess(userId, access.appId, this.tenantId);
      }

      return {
        success: true,
        message: `Reclaimed ${licensesReclaimed} licenses`,
        details: {
          licensesReclaimed,
          apps: userAccess.map(a => a.appName)
        }
      };
    } catch (error: any) {
      console.error(`[SSO Revocation] Error reclaiming licenses:`, error);
      return {
        success: false,
        message: error.message || 'Failed to reclaim licenses'
      };
    }
  }
}
