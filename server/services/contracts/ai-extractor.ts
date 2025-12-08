/**
 * AI Contract Extractor
 *
 * Uses AI (OpenAI GPT-4) to extract key information from contract PDFs
 * Extracts dates, costs, terms, and other critical contract data
 */

import pdf from 'pdf-parse';
import { openai } from '../openai';

export interface ExtractedContractData {
  vendor: string;
  startDate?: Date;
  endDate?: Date;
  renewalDate?: Date;
  autoRenew?: boolean;
  annualValue?: number;
  currency?: string;
  billingCycle?: string;
  noticePeriodDays?: number;
  totalLicenses?: number;
  licenseType?: string;
  terms?: string;
  keyPoints?: string[];
  extractionConfidence?: number;
}

/**
 * AI Contract Extractor
 */
export class AIContractExtractor {
  /**
   * Extract contract data from PDF buffer
   */
  async extractFromPDF(pdfBuffer: Buffer): Promise<ExtractedContractData> {
    // Extract text from PDF
    console.log('[AI Extractor] Parsing PDF...');
    const pdfData = await pdf(pdfBuffer);
    const pdfText = pdfData.text;

    console.log(`[AI Extractor] Extracted ${pdfText.length} characters from PDF`);

    // Extract using AI
    return await this.extractFromText(pdfText);
  }

  /**
   * Extract contract data from text using AI
   */
  async extractFromText(pdfText: string): Promise<ExtractedContractData> {
    // Limit text to first 15,000 characters to avoid token limits
    const textToAnalyze = pdfText.substring(0, 15000);

    const prompt = `You are an AI assistant specialized in extracting key information from SaaS contracts and subscription agreements.

Analyze the following contract text and extract ALL the key information you can find. Be thorough and accurate.

CONTRACT TEXT:
${textToAnalyze}

Extract the following information in JSON format:
{
  "vendor": "Company name providing the SaaS service",
  "startDate": "Contract start date in YYYY-MM-DD format (if found)",
  "endDate": "Contract end date in YYYY-MM-DD format (if found)",
  "renewalDate": "Next renewal date in YYYY-MM-DD format (if found)",
  "autoRenew": true/false (if mentioned),
  "annualValue": numeric value of annual contract cost (if found),
  "currency": "USD/INR/EUR/GBP etc (if found)",
  "billingCycle": "monthly/quarterly/annual/other (if found)",
  "noticePeriodDays": number of days notice required for cancellation (if found),
  "totalLicenses": number of licenses/seats/users (if found),
  "licenseType": "per-user/per-device/unlimited/consumption-based (if found)",
  "terms": "Brief 2-3 sentence summary of key terms",
  "keyPoints": ["Array of 3-5 most important contract clauses or obligations"],
  "extractionConfidence": 0.0 to 1.0 score of how confident you are in the extraction
}

IMPORTANT:
- Only include fields where you found explicit information
- Use null for fields not found
- Dates must be in YYYY-MM-DD format
- Be conservative with confidence scores
- Extract currency from context if not explicitly stated
- Look for renewal terms, termination clauses, payment terms
- Return ONLY valid JSON, no additional text`;

    try {
      console.log('[AI Extractor] Sending to OpenAI...');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a contract analysis expert. Extract information accurately and return only valid JSON. Be thorough and include all relevant details found.'
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

      console.log('[AI Extractor] Parsing AI response...');
      const extracted = JSON.parse(content);

      // Convert date strings to Date objects
      const result: ExtractedContractData = {
        vendor: extracted.vendor,
        startDate: extracted.startDate ? this.parseDate(extracted.startDate) : undefined,
        endDate: extracted.endDate ? this.parseDate(extracted.endDate) : undefined,
        renewalDate: extracted.renewalDate ? this.parseDate(extracted.renewalDate) : undefined,
        autoRenew: extracted.autoRenew,
        annualValue: extracted.annualValue,
        currency: extracted.currency,
        billingCycle: extracted.billingCycle,
        noticePeriodDays: extracted.noticePeriodDays,
        totalLicenses: extracted.totalLicenses,
        licenseType: extracted.licenseType,
        terms: extracted.terms,
        keyPoints: extracted.keyPoints || [],
        extractionConfidence: extracted.extractionConfidence || 0.5
      };

      console.log(`[AI Extractor] Extraction complete (confidence: ${result.extractionConfidence})`);

      return result;
    } catch (error) {
      console.error('[AI Extractor] Error extracting contract data:', error);
      throw new Error(`Failed to extract contract data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date | undefined {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return undefined;
      }
      return date;
    } catch {
      return undefined;
    }
  }

  /**
   * Validate extraction result
   */
  validateExtraction(data: ExtractedContractData): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (!data.vendor) {
      warnings.push('Vendor name not found in contract');
    }

    if (!data.startDate && !data.endDate) {
      warnings.push('No contract dates found - unable to track contract lifecycle');
    }

    if (!data.annualValue && !data.billingCycle) {
      warnings.push('No financial information found - unable to track costs');
    }

    if (!data.renewalDate && !data.endDate) {
      warnings.push('No renewal or end date found - unable to set up renewal alerts');
    }

    if (data.extractionConfidence && data.extractionConfidence < 0.5) {
      warnings.push('Low extraction confidence - manual review recommended');
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Extract contract summary (quick overview without full extraction)
   */
  async extractSummary(pdfBuffer: Buffer): Promise<{
    vendor: string;
    estimatedValue: string;
    keyDates: string[];
  }> {
    const pdfData = await pdf(pdfBuffer);
    const textToAnalyze = pdfData.text.substring(0, 5000);

    const prompt = `Quickly summarize this contract in JSON format:
${textToAnalyze}

Return:
{
  "vendor": "Vendor name",
  "estimatedValue": "Estimated contract value with currency",
  "keyDates": ["Array of important dates mentioned"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Extract quick contract summary. Return only JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    return JSON.parse(content);
  }
}
