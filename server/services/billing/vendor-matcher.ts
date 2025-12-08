/**
 * AI-Powered Vendor Matcher
 *
 * Uses AI to intelligently match invoice vendors with existing SaaS apps
 * Handles vendor name variations, typos, and normalization
 */

import { storage } from '../../storage';
import { openai } from '../openai';

export interface VendorMatchResult {
  matched: boolean;
  appId?: string;
  appName?: string;
  confidence: number;
  reasoning?: string;
}

/**
 * Vendor Matcher using AI
 */
export class AIVendorMatcher {
  constructor(private tenantId: string) {}

  /**
   * Match vendor name to existing SaaS app using AI
   */
  async matchVendor(vendorName: string): Promise<VendorMatchResult> {
    // Get all existing SaaS apps
    const apps = await storage.getSaasApps(this.tenantId, {});

    if (apps.length === 0) {
      return { matched: false, confidence: 0 };
    }

    // Try simple exact match first (fast path)
    const exactMatch = this.findExactMatch(vendorName, apps);
    if (exactMatch) {
      return {
        matched: true,
        appId: exactMatch.id,
        appName: exactMatch.name,
        confidence: 1.0,
        reasoning: 'Exact name match'
      };
    }

    // Try fuzzy matching (medium confidence)
    const fuzzyMatch = this.findFuzzyMatch(vendorName, apps);
    if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
      return fuzzyMatch;
    }

    // Use AI for complex matching (high accuracy but slower)
    try {
      const aiMatch = await this.findAIMatch(vendorName, apps);
      return aiMatch;
    } catch (error) {
      console.error('[VendorMatcher] AI matching failed:', error);
      // Fall back to fuzzy match if AI fails
      return fuzzyMatch || { matched: false, confidence: 0 };
    }
  }

  /**
   * Find exact match (case-insensitive)
   */
  private findExactMatch(vendorName: string, apps: any[]): any | null {
    const normalized = vendorName.toLowerCase().trim();

    for (const app of apps) {
      if (app.name.toLowerCase().trim() === normalized) {
        return app;
      }
      if (app.vendor && app.vendor.toLowerCase().trim() === normalized) {
        return app;
      }
    }

    return null;
  }

  /**
   * Find fuzzy match using string similarity
   */
  private findFuzzyMatch(vendorName: string, apps: any[]): VendorMatchResult | null {
    const normalized = this.normalizeVendorName(vendorName);
    let bestMatch: any = null;
    let bestScore = 0;

    for (const app of apps) {
      // Check app name
      const appNameNormalized = this.normalizeVendorName(app.name);
      const nameScore = this.calculateSimilarity(normalized, appNameNormalized);

      if (nameScore > bestScore) {
        bestScore = nameScore;
        bestMatch = app;
      }

      // Check vendor name if available
      if (app.vendor) {
        const vendorNormalized = this.normalizeVendorName(app.vendor);
        const vendorScore = this.calculateSimilarity(normalized, vendorNormalized);

        if (vendorScore > bestScore) {
          bestScore = vendorScore;
          bestMatch = app;
        }
      }
    }

    if (bestScore > 0.6) {
      return {
        matched: true,
        appId: bestMatch.id,
        appName: bestMatch.name,
        confidence: bestScore,
        reasoning: 'Fuzzy name matching'
      };
    }

    return null;
  }

  /**
   * Find match using AI
   */
  private async findAIMatch(vendorName: string, apps: any[]): Promise<VendorMatchResult> {
    const appList = apps.map(app => ({
      id: app.id,
      name: app.name,
      vendor: app.vendor
    }));

    const prompt = `You are a SaaS application matching expert. Given an invoice vendor name, match it to the most likely SaaS application from the provided list.

VENDOR NAME FROM INVOICE: "${vendorName}"

EXISTING SAAS APPLICATIONS:
${JSON.stringify(appList, null, 2)}

Analyze the vendor name and determine which application it most likely corresponds to. Consider:
- Company name variations (e.g., "Slack Technologies" vs "Slack")
- Common abbreviations
- Parent company names
- Product vs company names

Return a JSON object with:
{
  "matched": true/false,
  "appId": "ID of matched app or null",
  "appName": "Name of matched app or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
}

If no reasonable match exists, return matched: false with confidence 0.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at matching vendor names to SaaS applications. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const result = JSON.parse(content);
    return result;
  }

  /**
   * Normalize vendor name for comparison
   */
  private normalizeVendorName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(inc|corp|corporation|ltd|limited|llc|technologies|tech|software)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const distance = this.levenshteinDistance(shorter, longer);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Batch match multiple vendors
   */
  async matchVendors(vendorNames: string[]): Promise<Map<string, VendorMatchResult>> {
    const results = new Map<string, VendorMatchResult>();

    for (const vendorName of vendorNames) {
      const result = await this.matchVendor(vendorName);
      results.set(vendorName, result);

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}
