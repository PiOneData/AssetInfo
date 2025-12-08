/**
 * OAuth Permission Risk Analyzer
 *
 * Analyzes OAuth scopes and permissions to determine risk level
 * Supports Microsoft Graph, Google APIs, and generic OAuth scopes
 */

export interface OAuthRiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  reasons: string[];
  criticalScopes: string[];
}

interface ScopeRiskPattern {
  pattern: RegExp;
  points: number;
  reason: string;
  category: 'data-access' | 'admin' | 'write' | 'delete';
}

/**
 * OAuth Risk Analyzer
 *
 * Assesses the risk of OAuth permission scopes
 */
export class OAuthRiskAnalyzer {
  /**
   * Risk patterns for Microsoft Graph API scopes
   */
  private static readonly MICROSOFT_RISK_PATTERNS: ScopeRiskPattern[] = [
    // Critical - Full access scopes
    { pattern: /\b\.readwrite\.all\b/i, points: 35, reason: 'Full read/write access', category: 'write' },
    { pattern: /\ball\./i, points: 30, reason: 'Organization-wide access', category: 'admin' },

    // Email access
    { pattern: /\bmail\.send/i, points: 30, reason: 'Email sending capability', category: 'write' },
    { pattern: /\bmail\.readwrite/i, points: 25, reason: 'Email read/write access', category: 'write' },
    { pattern: /\bmail\.read\b/i, points: 20, reason: 'Email read access', category: 'data-access' },

    // File system access
    { pattern: /\bfiles\.readwrite\.all/i, points: 30, reason: 'Full file system access', category: 'write' },
    { pattern: /\bfiles\.readwrite/i, points: 20, reason: 'File read/write access', category: 'write' },
    { pattern: /\bfiles\.read\.all/i, points: 15, reason: 'All files read access', category: 'data-access' },

    // User and directory access
    { pattern: /\buser\.readwrite\.all/i, points: 35, reason: 'Modify all users', category: 'admin' },
    { pattern: /\buser\.read\.all/i, points: 25, reason: 'Read all user profiles', category: 'data-access' },
    { pattern: /\bdirectory\.readwrite\.all/i, points: 40, reason: 'Full directory control', category: 'admin' },
    { pattern: /\bdirectory\.read\.all/i, points: 25, reason: 'Read directory data', category: 'data-access' },

    // Group management
    { pattern: /\bgroup\.readwrite\.all/i, points: 30, reason: 'Modify all groups', category: 'admin' },
    { pattern: /\bgroup\.read\.all/i, points: 15, reason: 'Read all groups', category: 'data-access' },

    // Contacts and calendar
    { pattern: /\bcontacts\.readwrite/i, points: 20, reason: 'Contacts read/write', category: 'write' },
    { pattern: /\bcontacts\.read/i, points: 15, reason: 'Contacts read access', category: 'data-access' },
    { pattern: /\bcalendars\.readwrite/i, points: 20, reason: 'Calendar read/write', category: 'write' },
    { pattern: /\bcalendars\.read/i, points: 15, reason: 'Calendar read access', category: 'data-access' },

    // Teams and Sites
    { pattern: /\bteam\.readwrite\.all/i, points: 30, reason: 'Modify all Teams', category: 'admin' },
    { pattern: /\bsites\.readwrite\.all/i, points: 30, reason: 'Modify all SharePoint sites', category: 'write' },

    // Application permissions (app-only, not delegated)
    { pattern: /\bapplication\./i, points: 15, reason: 'Application-level permissions', category: 'admin' },

    // Device management
    { pattern: /\bdevice\.readwrite\.all/i, points: 35, reason: 'Modify all devices', category: 'admin' },

    // Role management
    { pattern: /\brolemanagement\.readwrite/i, points: 40, reason: 'Modify admin roles', category: 'admin' },
    { pattern: /\bdirectoryroles\.readwrite/i, points: 40, reason: 'Modify directory roles', category: 'admin' },
  ];

  /**
   * Risk patterns for Google API scopes
   */
  private static readonly GOOGLE_RISK_PATTERNS: ScopeRiskPattern[] = [
    // Gmail access
    { pattern: /gmail\.send/i, points: 30, reason: 'Gmail send capability', category: 'write' },
    { pattern: /gmail\.modify/i, points: 25, reason: 'Gmail modify access', category: 'write' },
    { pattern: /gmail\.readonly/i, points: 20, reason: 'Gmail read access', category: 'data-access' },
    { pattern: /gmail\.insert/i, points: 25, reason: 'Gmail insert messages', category: 'write' },

    // Google Drive
    { pattern: /drive\.file/i, points: 15, reason: 'Drive file access', category: 'data-access' },
    { pattern: /drive\.appdata/i, points: 10, reason: 'Drive app data', category: 'data-access' },
    { pattern: /drive\.readonly/i, points: 15, reason: 'Drive read access', category: 'data-access' },
    { pattern: /drive\b/i, points: 30, reason: 'Full Drive access', category: 'write' },

    // Google Calendar
    { pattern: /calendar\.events/i, points: 15, reason: 'Calendar events access', category: 'data-access' },
    { pattern: /calendar\.readonly/i, points: 10, reason: 'Calendar read access', category: 'data-access' },
    { pattern: /calendar\b/i, points: 20, reason: 'Full calendar access', category: 'write' },

    // Google Contacts
    { pattern: /contacts\.readonly/i, points: 15, reason: 'Contacts read access', category: 'data-access' },
    { pattern: /contacts\b/i, points: 20, reason: 'Contacts read/write', category: 'write' },

    // Admin SDK
    { pattern: /admin\.directory\.user/i, points: 35, reason: 'User directory management', category: 'admin' },
    { pattern: /admin\.directory\.group/i, points: 30, reason: 'Group management', category: 'admin' },
    { pattern: /admin\.directory\.device/i, points: 35, reason: 'Device management', category: 'admin' },
    { pattern: /admin\.directory\.domain/i, points: 40, reason: 'Domain management', category: 'admin' },

    // Google Cloud Platform
    { pattern: /cloud-platform/i, points: 35, reason: 'Cloud platform access', category: 'admin' },
    { pattern: /compute/i, points: 30, reason: 'Compute engine access', category: 'admin' },
  ];

  /**
   * Generic OAuth risk patterns (for unknown providers)
   */
  private static readonly GENERIC_RISK_PATTERNS: ScopeRiskPattern[] = [
    { pattern: /\bwrite\b/i, points: 15, reason: 'Write access', category: 'write' },
    { pattern: /\bdelete\b/i, points: 20, reason: 'Delete capability', category: 'delete' },
    { pattern: /\badmin\b/i, points: 30, reason: 'Administrative access', category: 'admin' },
    { pattern: /\bmanage\b/i, points: 25, reason: 'Management permissions', category: 'admin' },
    { pattern: /\bfull/i, points: 20, reason: 'Full access scope', category: 'admin' },
  ];

  /**
   * Assess risk of OAuth permissions
   */
  static assessPermissions(scopes: string[]): OAuthRiskAssessment {
    let score = 0;
    const reasons = new Set<string>();
    const criticalScopes: string[] = [];
    const categoryScores: Record<string, number> = {
      'data-access': 0,
      'admin': 0,
      'write': 0,
      'delete': 0
    };

    // Detect provider type
    const isMicrosoft = scopes.some(s =>
      s.includes('.microsoft.com') ||
      s.includes('graph') ||
      /\.(read|readwrite)(\.|$)/i.test(s)
    );

    const isGoogle = scopes.some(s =>
      s.includes('googleapis.com') ||
      s.includes('google.com') ||
      s.includes('gmail') ||
      s.includes('drive')
    );

    // Select appropriate patterns
    let patterns = [...this.GENERIC_RISK_PATTERNS];
    if (isMicrosoft) {
      patterns = [...this.MICROSOFT_RISK_PATTERNS, ...this.GENERIC_RISK_PATTERNS];
    } else if (isGoogle) {
      patterns = [...this.GOOGLE_RISK_PATTERNS, ...this.GENERIC_RISK_PATTERNS];
    }

    // Analyze each scope
    for (const scope of scopes) {
      let scopeMatched = false;

      for (const riskPattern of patterns) {
        if (riskPattern.pattern.test(scope)) {
          score += riskPattern.points;
          reasons.add(riskPattern.reason);
          categoryScores[riskPattern.category] += riskPattern.points;
          scopeMatched = true;

          // Track critical scopes (high point values)
          if (riskPattern.points >= 25) {
            criticalScopes.push(scope);
          }
        }
      }

      // Penalty for very long permission strings (may indicate broad access)
      if (!scopeMatched && scope.length > 100) {
        score += 5;
        reasons.add('Unusually long scope definition');
      }
    }

    // Bonus penalties for dangerous combinations
    if (categoryScores.admin > 0 && categoryScores.write > 0) {
      score += 10;
      reasons.add('Combination of admin and write permissions');
    }

    if (categoryScores.admin > 0 && categoryScores.delete > 0) {
      score += 15;
      reasons.add('Combination of admin and delete permissions');
    }

    // Excessive permissions penalty
    if (scopes.length > 15) {
      score += 10;
      reasons.add(`Excessive permissions (${scopes.length} scopes)`);
    }

    // Cap score at 100
    score = Math.min(score, 100);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 75) {
      riskLevel = 'critical';
    } else if (score >= 50) {
      riskLevel = 'high';
    } else if (score >= 25) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      riskLevel,
      riskScore: score,
      reasons: Array.from(reasons),
      criticalScopes
    };
  }

  /**
   * Generate human-readable risk explanation
   */
  static explainRisk(assessment: OAuthRiskAssessment): string {
    const { riskLevel, riskScore, reasons, criticalScopes } = assessment;

    let explanation = `Risk Level: ${riskLevel.toUpperCase()} (Score: ${riskScore}/100)\n\n`;

    if (reasons.length > 0) {
      explanation += 'Risk Factors:\n';
      reasons.forEach((reason, index) => {
        explanation += `${index + 1}. ${reason}\n`;
      });
    }

    if (criticalScopes.length > 0) {
      explanation += `\nCritical Scopes (${criticalScopes.length}):\n`;
      criticalScopes.forEach((scope, index) => {
        explanation += `${index + 1}. ${scope}\n`;
      });
    }

    return explanation;
  }

  /**
   * Compare two scope lists to detect permission escalation
   */
  static detectPermissionEscalation(
    oldScopes: string[],
    newScopes: string[]
  ): { hasEscalation: boolean; addedScopes: string[]; removedScopes: string[] } {
    const oldSet = new Set(oldScopes);
    const newSet = new Set(newScopes);

    const addedScopes = newScopes.filter(s => !oldSet.has(s));
    const removedScopes = oldScopes.filter(s => !newSet.has(s));

    // Check if added scopes are higher risk than before
    const oldRisk = this.assessPermissions(oldScopes);
    const newRisk = this.assessPermissions(newScopes);

    const hasEscalation = newRisk.riskScore > oldRisk.riskScore + 10; // 10 point threshold

    return {
      hasEscalation,
      addedScopes,
      removedScopes
    };
  }
}
