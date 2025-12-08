/**
 * Stripe Billing Connector
 *
 * Integrates with Stripe API to fetch invoices and subscription data
 * Global payment platform integration
 */

import Stripe from 'stripe';
import { storage } from '../../storage';
import type { InsertSaasInvoice } from '@shared/schema';

export interface StripeConfig {
  apiKey: string;
}

/**
 * Stripe Billing Connector
 */
export class StripeBillingConnector {
  private stripe: Stripe;
  private tenantId: string;

  constructor(config: StripeConfig, tenantId: string) {
    this.stripe = new Stripe(config.apiKey, {
      apiVersion: '2024-11-20.acacia'
    });
    this.tenantId = tenantId;
  }

  /**
   * Test connection to Stripe
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Test by fetching account information
      await this.stripe.balance.retrieve();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Fetch all invoices from Stripe
   */
  async fetchInvoices(fromDate?: Date, toDate?: Date): Promise<Stripe.Invoice[]> {
    const params: Stripe.InvoiceListParams = { limit: 100 };

    if (fromDate) {
      params.created = {
        gte: Math.floor(fromDate.getTime() / 1000)
      };
    }

    if (toDate) {
      if (!params.created) params.created = {};
      (params.created as any).lte = Math.floor(toDate.getTime() / 1000);
    }

    const invoices: Stripe.Invoice[] = [];

    try {
      console.log('[Stripe] Fetching invoices with params:', params);

      for await (const invoice of this.stripe.invoices.list(params)) {
        invoices.push(invoice);
      }

      console.log(`[Stripe] Fetched ${invoices.length} invoices`);

      return invoices;
    } catch (error) {
      console.error('[Stripe] Error fetching invoices:', error);
      throw new Error(`Failed to fetch Stripe invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract vendor name from Stripe customer
   */
  private async getVendorName(customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string> {
    if (!customerId) return 'Unknown Vendor';

    try {
      // If customer is already expanded object
      if (typeof customerId !== 'string') {
        if ('deleted' in customerId && customerId.deleted) {
          return 'Deleted Customer';
        }
        return customerId.name || customerId.email || 'Unknown Vendor';
      }

      // Fetch customer details
      const customer = await this.stripe.customers.retrieve(customerId);
      if ('deleted' in customer && customer.deleted) {
        return 'Deleted Customer';
      }
      return customer.name || customer.email || 'Unknown Vendor';
    } catch (error) {
      console.warn(`[Stripe] Failed to fetch customer ${customerId}:`, error);
      return 'Unknown Vendor';
    }
  }

  /**
   * Extract product/app name from line items
   */
  private extractAppName(invoice: Stripe.Invoice): string | undefined {
    if (invoice.lines && invoice.lines.data.length > 0) {
      const firstLine = invoice.lines.data[0];
      return firstLine.description || undefined;
    }
    return undefined;
  }

  /**
   * Convert Stripe invoice to AssetInfo invoice
   */
  private async convertToInvoice(stripeInvoice: Stripe.Invoice, appId?: string): Promise<Partial<InsertSaasInvoice>> {
    const vendor = await this.getVendorName(stripeInvoice.customer);

    return {
      tenantId: this.tenantId,
      appId: appId,
      invoiceNumber: stripeInvoice.number || stripeInvoice.id,
      vendor,
      amount: (stripeInvoice.amount_due || 0) / 100, // Convert cents to dollars
      currency: stripeInvoice.currency.toUpperCase(),
      taxAmount: stripeInvoice.tax ? stripeInvoice.tax / 100 : undefined,
      totalAmount: (stripeInvoice.total || stripeInvoice.amount_due || 0) / 100,
      invoiceDate: new Date(stripeInvoice.created * 1000),
      dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : undefined,
      paidDate: stripeInvoice.status_transitions.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : undefined,
      status: this.mapStatus(stripeInvoice.status),
      externalInvoiceId: stripeInvoice.id,
      metadata: {
        source: 'stripe',
        customerId: typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id,
        subscriptionId: typeof stripeInvoice.subscription === 'string' ? stripeInvoice.subscription : stripeInvoice.subscription?.id,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        appName: this.extractAppName(stripeInvoice),
        paymentIntent: typeof stripeInvoice.payment_intent === 'string' ? stripeInvoice.payment_intent : stripeInvoice.payment_intent?.id
      }
    };
  }

  /**
   * Map Stripe status to AssetInfo status
   */
  private mapStatus(stripeStatus: Stripe.Invoice.Status | null): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    switch (stripeStatus) {
      case 'paid':
        return 'paid';
      case 'void':
        return 'cancelled';
      case 'uncollectible':
        return 'overdue';
      case 'open':
        // Check if past due
        return 'pending';
      case 'draft':
      default:
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

      console.log(`[Stripe] Processing ${invoices.length} invoices for tenant ${this.tenantId}`);

      for (const stripeInvoice of invoices) {
        try {
          const invoice = await this.convertToInvoice(stripeInvoice);

          // Check if invoice already exists by external ID
          const existing = await storage.getSaasInvoiceByExternalId(
            stripeInvoice.id,
            this.tenantId
          );

          if (existing) {
            await storage.updateSaasInvoice(existing.id, this.tenantId, invoice);
            updated++;
            console.log(`[Stripe] Updated invoice ${stripeInvoice.id}`);
          } else {
            await storage.createSaasInvoice(invoice as InsertSaasInvoice);
            created++;
            console.log(`[Stripe] Created invoice ${stripeInvoice.id}`);
          }
        } catch (error) {
          const errorMsg = `Failed to process invoice ${stripeInvoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[Stripe] ${errorMsg}`);
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
      console.error(`[Stripe] ${errorMsg}`);
      return { synced: 0, created: 0, updated: 0, errors };
    }
  }

  /**
   * Get invoice details by ID
   */
  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      throw new Error(`Failed to fetch invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch subscriptions
   */
  async fetchSubscriptions(): Promise<Stripe.Subscription[]> {
    const subscriptions: Stripe.Subscription[] = [];

    try {
      for await (const subscription of this.stripe.subscriptions.list({ limit: 100 })) {
        subscriptions.push(subscription);
      }

      console.log(`[Stripe] Fetched ${subscriptions.length} subscriptions`);
      return subscriptions;
    } catch (error) {
      console.error('[Stripe] Error fetching subscriptions:', error);
      throw error;
    }
  }
}
