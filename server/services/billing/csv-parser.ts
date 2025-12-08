/**
 * CSV Invoice Parser
 *
 * Parses CSV files containing invoice data and converts to AssetInfo format
 * Supports manual invoice uploads
 */

import csv from 'csv-parser';
import { Readable } from 'stream';
import type { InsertSaasInvoice } from '@shared/schema';

interface CSVInvoiceRow {
  vendor: string;
  amount: string;
  currency?: string;
  invoice_number?: string;
  invoice_date: string;
  due_date?: string;
  paid_date?: string;
  status?: string;
  app_name?: string;
  department?: string;
  cost_center?: string;
  tax_amount?: string;
  payment_method?: string;
  notes?: string;
}

export interface CSVParseResult {
  invoices: Partial<InsertSaasInvoice>[];
  errors: string[];
  rowsProcessed: number;
  rowsFailed: number;
}

/**
 * CSV Invoice Parser
 */
export class CSVInvoiceParser {
  /**
   * Parse CSV content and convert to invoices
   */
  async parseCSV(csvContent: string, tenantId: string): Promise<CSVParseResult> {
    const invoices: Partial<InsertSaasInvoice>[] = [];
    const errors: string[] = [];
    let rowsProcessed = 0;
    let rowsFailed = 0;

    return new Promise((resolve) => {
      const stream = Readable.from([csvContent]);

      stream
        .pipe(csv({
          mapHeaders: ({ header }) => header.toLowerCase().trim().replace(/\s+/g, '_'),
          skipLines: 0
        }))
        .on('data', (row: CSVInvoiceRow) => {
          rowsProcessed++;
          try {
            const invoice = this.parseRow(row, tenantId);
            invoices.push(invoice);
          } catch (error) {
            rowsFailed++;
            const errorMsg = `Row ${rowsProcessed}: ${error instanceof Error ? error.message : 'Parse error'}`;
            errors.push(errorMsg);
            console.error(`[CSV Parser] ${errorMsg}`);
          }
        })
        .on('end', () => {
          console.log(`[CSV Parser] Parsed ${invoices.length} invoices from ${rowsProcessed} rows (${rowsFailed} failed)`);
          resolve({ invoices, errors, rowsProcessed, rowsFailed });
        })
        .on('error', (error) => {
          const errorMsg = `CSV parse error: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[CSV Parser] ${errorMsg}`);
          resolve({ invoices, errors, rowsProcessed, rowsFailed });
        });
    });
  }

  /**
   * Parse a single CSV row
   */
  private parseRow(row: CSVInvoiceRow, tenantId: string): Partial<InsertSaasInvoice> {
    // Validate required fields
    if (!row.vendor || !row.amount || !row.invoice_date) {
      throw new Error('Missing required fields: vendor, amount, invoice_date');
    }

    // Parse amount
    const amount = this.parseAmount(row.amount);
    if (isNaN(amount) || amount < 0) {
      throw new Error(`Invalid amount: ${row.amount}`);
    }

    // Parse tax amount
    const taxAmount = row.tax_amount ? this.parseAmount(row.tax_amount) : undefined;

    // Parse dates
    const invoiceDate = this.parseDate(row.invoice_date);
    const dueDate = row.due_date ? this.parseDate(row.due_date) : undefined;
    const paidDate = row.paid_date ? this.parseDate(row.paid_date) : undefined;

    return {
      tenantId,
      vendor: row.vendor.trim(),
      amount,
      currency: row.currency?.toUpperCase() || 'USD',
      taxAmount,
      totalAmount: taxAmount ? amount + taxAmount : amount,
      invoiceNumber: row.invoice_number?.trim(),
      invoiceDate,
      dueDate,
      paidDate,
      status: this.parseStatus(row.status, dueDate, paidDate),
      department: row.department?.trim(),
      costCenter: row.cost_center?.trim(),
      paymentMethod: row.payment_method?.trim(),
      notes: row.notes?.trim(),
      metadata: {
        source: 'csv',
        appName: row.app_name?.trim()
      }
    };
  }

  /**
   * Parse amount string (handles various formats)
   */
  private parseAmount(amountStr: string): number {
    // Remove currency symbols, commas, and spaces
    const cleaned = amountStr.replace(/[$€£¥₹,\s]/g, '');
    return parseFloat(cleaned);
  }

  /**
   * Parse date string (supports multiple formats)
   */
  private parseDate(dateStr: string): Date {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    return date;
  }

  /**
   * Parse status string
   */
  private parseStatus(
    status: string | undefined,
    dueDate?: Date,
    paidDate?: Date
  ): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    // If paid date exists, mark as paid
    if (paidDate) return 'paid';

    if (!status) {
      // Auto-detect based on dates
      if (dueDate && dueDate < new Date() && !paidDate) {
        return 'overdue';
      }
      return 'pending';
    }

    const normalized = status.toLowerCase().trim();
    if (normalized === 'paid') return 'paid';
    if (normalized === 'overdue') return 'overdue';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
    return 'pending';
  }

  /**
   * Generate CSV template with examples
   */
  generateTemplate(): string {
    return [
      'vendor,amount,currency,invoice_number,invoice_date,due_date,paid_date,status,app_name,department,cost_center,tax_amount,payment_method,notes',
      'Slack Technologies,999.00,USD,INV-2024-001,2024-01-15,2024-02-15,2024-01-20,paid,Slack,Engineering,ENG-001,179.82,Credit Card,Annual subscription',
      'Google LLC,1200.00,USD,GOOG-2024-002,2024-01-20,2024-02-20,,pending,Google Workspace,IT,IT-001,216.00,Bank Transfer,Business plan',
      'Microsoft Corporation,2500.00,USD,MS-2024-003,2024-01-10,2024-01-25,,overdue,Microsoft 365,Sales,SALES-001,450.00,Credit Card,Enterprise licenses'
    ].join('\n');
  }

  /**
   * Validate CSV headers
   */
  validateHeaders(headers: string[]): { valid: boolean; missingHeaders: string[] } {
    const requiredHeaders = ['vendor', 'amount', 'invoice_date'];
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));

    const missingHeaders = requiredHeaders.filter(
      required => !normalizedHeaders.includes(required)
    );

    return {
      valid: missingHeaders.length === 0,
      missingHeaders
    };
  }

  /**
   * Get supported date formats
   */
  getSupportedDateFormats(): string[] {
    return [
      'YYYY-MM-DD (2024-01-15)',
      'MM/DD/YYYY (01/15/2024)',
      'DD/MM/YYYY (15/01/2024)',
      'ISO 8601 (2024-01-15T00:00:00Z)'
    ];
  }
}
