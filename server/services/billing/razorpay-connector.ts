/**
 * Razorpay Billing Connector
 *
 * Integrates with Razorpay API to fetch invoices and subscription data
 * Priority for Indian market
 */

import Razorpay from 'razorpay';
import { storage } from '../../storage';
import type { InsertSaasInvoice } from '@shared/schema';

interface RazorpayInvoice {
  id: string;
  entity: string;
  customer_id: string;
  customer_details: {
    name: string;
    email: string;
    contact?: string;
    billing_address?: any;
  };
  line_items: Array<{
    id: string;
    name: string;
    description?: string;
    amount: number;
    quantity: number;
  }>;
  amount: number;
  currency: string;
  status: 'issued' | 'paid' | 'partially_paid' | 'cancelled' | 'expired';
  issued_at: number;
  paid_at?: number;
  cancelled_at?: number;
  expired_at?: number;
  due_date?: number;
  payment_id?: string;
}

export interface RazorpayConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Razorpay Billing Connector
 */
export class RazorpayBillingConnector {
  private razorpay: Razorpay;
  private tenantId: string;

  constructor(config: RazorpayConfig, tenantId: string) {
    this.razorpay = new Razorpay({
      key_id: config.apiKey,
      key_secret: config.apiSecret
    });
    this.tenantId = tenantId;
  }

  /**
   * Test connection to Razorpay
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try fetching a small list of invoices to test credentials
      await this.razorpay.invoices.all({ count: 1 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Fetch all invoices from Razorpay
   */
  async fetchInvoices(fromDate?: Date, toDate?: Date): Promise<RazorpayInvoice[]> {
    const params: any = { count: 100 };

    if (fromDate) {
      params.from = Math.floor(fromDate.getTime() / 1000);
    }
    if (toDate) {
      params.to = Math.floor(toDate.getTime() / 1000);
    }

    try {
      console.log('[Razorpay] Fetching invoices with params:', params);
      const response = await this.razorpay.invoices.all(params);

      console.log(`[Razorpay] Fetched ${response.items?.length || 0} invoices`);

      return response.items || [];
    } catch (error) {
      console.error('[Razorpay] Error fetching invoices:', error);
      throw new Error(`Failed to fetch Razorpay invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract vendor name from invoice
   */
  private extractVendorName(invoice: RazorpayInvoice): string {
    // Use customer name as vendor (in Razorpay, customer = the SaaS vendor billing you)
    return invoice.customer_details.name || 'Unknown Vendor';
  }

  /**
   * Extract app name from line items
   */
  private extractAppName(invoice: RazorpayInvoice): string | undefined {
    if (invoice.line_items && invoice.line_items.length > 0) {
      // Use first line item name as potential app name
      return invoice.line_items[0].name;
    }
    return undefined;
  }

  /**
   * Convert Razorpay invoice to AssetInfo invoice
   */
  private convertToInvoice(rzInvoice: RazorpayInvoice, appId?: string): Partial<InsertSaasInvoice> {
    return {
      tenantId: this.tenantId,
      appId: appId,
      invoiceNumber: rzInvoice.id,
      vendor: this.extractVendorName(rzInvoice),
      amount: rzInvoice.amount / 100, // Convert paise to rupees
      currency: rzInvoice.currency.toUpperCase(),
      totalAmount: rzInvoice.amount / 100,
      invoiceDate: new Date(rzInvoice.issued_at * 1000),
      dueDate: rzInvoice.due_date ? new Date(rzInvoice.due_date * 1000) : undefined,
      paidDate: rzInvoice.paid_at ? new Date(rzInvoice.paid_at * 1000) : undefined,
      status: this.mapStatus(rzInvoice.status),
      externalInvoiceId: rzInvoice.id,
      metadata: {
        source: 'razorpay',
        customerId: rzInvoice.customer_id,
        customerEmail: rzInvoice.customer_details.email,
        lineItems: rzInvoice.line_items,
        appName: this.extractAppName(rzInvoice),
        paymentId: rzInvoice.payment_id
      }
    };
  }

  /**
   * Map Razorpay status to AssetInfo status
   */
  private mapStatus(rzStatus: string): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    switch (rzStatus) {
      case 'paid':
      case 'partially_paid':
        return 'paid';
      case 'cancelled':
      case 'expired':
        return 'cancelled';
      case 'issued':
      default:
        // Check if overdue by comparing due date
        return 'pending';
    }
  }

  /**
   * Sync invoices to database
   */
  async syncInvoices(fromDate?: Date, toDate?: Date): Promise<{
    synced: number;
    created: number;
    updated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    try {
      const invoices = await this.fetchInvoices(fromDate, toDate);

      console.log(`[Razorpay] Processing ${invoices.length} invoices for tenant ${this.tenantId}`);

      for (const rzInvoice of invoices) {
        try {
          const invoice = this.convertToInvoice(rzInvoice);

          // Check if invoice already exists by external ID
          const existing = await storage.getSaasInvoiceByExternalId(
            rzInvoice.id,
            this.tenantId
          );

          if (existing) {
            await storage.updateSaasInvoice(existing.id, this.tenantId, invoice);
            updated++;
            console.log(`[Razorpay] Updated invoice ${rzInvoice.id}`);
          } else {
            await storage.createSaasInvoice(invoice as InsertSaasInvoice);
            created++;
            console.log(`[Razorpay] Created invoice ${rzInvoice.id}`);
          }
        } catch (error) {
          const errorMsg = `Failed to process invoice ${rzInvoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[Razorpay] ${errorMsg}`);
        }
      }

      return {
        synced: invoices.length,
        created,
        updated,
        errors
      };
    } catch (error) {
      const errorMsg = `Failed to fetch invoices: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(`[Razorpay] ${errorMsg}`);
      return { synced: 0, created: 0, updated: 0, errors };
    }
  }

  /**
   * Get invoice details by ID
   */
  async getInvoice(invoiceId: string): Promise<RazorpayInvoice> {
    try {
      return await this.razorpay.invoices.fetch(invoiceId);
    } catch (error) {
      throw new Error(`Failed to fetch invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
