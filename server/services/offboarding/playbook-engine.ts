/**
 * Playbook Engine
 *
 * Manages offboarding playbook templates:
 * - Load and execute playbooks
 * - Standard offboarding template
 * - Contractor offboarding template
 * - Department transfer template
 * - Role change template
 */

import { storage } from '../../storage';

export interface PlaybookStep {
  type: string;
  priority: number;
  enabled: boolean;
  description: string;
}

export interface Playbook {
  id: string;
  name: string;
  type: string;
  description?: string;
  isDefault: boolean;
  steps: PlaybookStep[];
}

/**
 * Playbook Engine
 */
export class PlaybookEngine {
  constructor(private tenantId: string) {}

  /**
   * Get default playbook for a type
   */
  async getDefaultPlaybook(type: string): Promise<Playbook | null> {
    const playbooks = await storage.getOffboardingPlaybooks(this.tenantId, { type, isDefault: true });
    return playbooks.length > 0 ? playbooks[0] : null;
  }

  /**
   * Get playbook by ID
   */
  async getPlaybook(playbookId: string): Promise<Playbook | null> {
    return await storage.getOffboardingPlaybook(playbookId, this.tenantId);
  }

  /**
   * Get all playbooks for tenant
   */
  async getAllPlaybooks(): Promise<Playbook[]> {
    return await storage.getOffboardingPlaybooks(this.tenantId, {});
  }

  /**
   * Get playbooks by type
   */
  async getPlaybooksByType(type: string): Promise<Playbook[]> {
    return await storage.getOffboardingPlaybooks(this.tenantId, { type });
  }

  /**
   * Create a new playbook
   */
  async createPlaybook(
    name: string,
    type: string,
    steps: PlaybookStep[],
    description?: string,
    isDefault: boolean = false,
    createdBy: string = 'system'
  ): Promise<Playbook> {
    // If setting as default, unset other defaults of same type
    if (isDefault) {
      await this.unsetDefaultsOfType(type);
    }

    const playbook = await storage.createOffboardingPlaybook({
      tenantId: this.tenantId,
      name,
      type,
      description,
      isDefault,
      steps,
      createdBy
    });

    return playbook;
  }

  /**
   * Update a playbook
   */
  async updatePlaybook(
    playbookId: string,
    updates: {
      name?: string;
      description?: string;
      steps?: PlaybookStep[];
      isDefault?: boolean;
    }
  ): Promise<Playbook | null> {
    const playbook = await storage.getOffboardingPlaybook(playbookId, this.tenantId);
    if (!playbook) {
      return null;
    }

    // If setting as default, unset other defaults of same type
    if (updates.isDefault && !playbook.isDefault) {
      await this.unsetDefaultsOfType(playbook.type);
    }

    return await storage.updateOffboardingPlaybook(playbookId, this.tenantId, updates);
  }

  /**
   * Delete a playbook
   */
  async deletePlaybook(playbookId: string): Promise<boolean> {
    return await storage.deleteOffboardingPlaybook(playbookId, this.tenantId);
  }

  /**
   * Unset default flag for all playbooks of a type
   */
  private async unsetDefaultsOfType(type: string): Promise<void> {
    const playbooks = await storage.getOffboardingPlaybooks(this.tenantId, { type, isDefault: true });
    for (const playbook of playbooks) {
      await storage.updateOffboardingPlaybook(playbook.id, this.tenantId, { isDefault: false });
    }
  }

  /**
   * Validate playbook steps
   */
  validatePlaybook(steps: PlaybookStep[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!steps || steps.length === 0) {
      errors.push('Playbook must have at least one step');
    }

    const validStepTypes = [
      'revoke_sso',
      'revoke_oauth',
      'transfer_ownership',
      'remove_from_groups',
      'archive_data',
      'generate_report',
      'review_access',
      'adjust_permissions',
      'update_licenses',
      'update_groups',
      'update_permissions'
    ];

    for (const step of steps) {
      if (!step.type) {
        errors.push('Step type is required');
      } else if (!validStepTypes.includes(step.type)) {
        errors.push(`Invalid step type: ${step.type}`);
      }

      if (typeof step.priority !== 'number') {
        errors.push('Step priority must be a number');
      }

      if (typeof step.enabled !== 'boolean') {
        errors.push('Step enabled must be a boolean');
      }

      if (!step.description) {
        errors.push('Step description is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get recommended playbook for a scenario
   */
  async getRecommendedPlaybook(scenario: {
    isContractor?: boolean;
    isDepartmentTransfer?: boolean;
    isRoleChange?: boolean;
  }): Promise<Playbook | null> {
    if (scenario.isContractor) {
      return await this.getDefaultPlaybook('contractor');
    }

    if (scenario.isDepartmentTransfer) {
      return await this.getDefaultPlaybook('transfer');
    }

    if (scenario.isRoleChange) {
      return await this.getDefaultPlaybook('role_change');
    }

    // Default to standard offboarding
    return await this.getDefaultPlaybook('standard');
  }
}
