# Phase 2: Spend Management & License Intelligence - Design Document

**Status**: Design In Progress
**Created**: 2025-12-08
**Branch**: `claude/review-phase-0-planning-0193vs4PTWxbz7sxNXiCgNvL`
**Dependencies**: Phase 0 ✅, Phase 1 ✅

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Billing Integrations](#billing-integrations)
4. [Contract Management](#contract-management)
5. [License Optimization](#license-optimization)
6. [Spend Dashboard](#spend-dashboard)
7. [AI/ML Components](#aiml-components)
8. [Database Schema Extensions](#database-schema-extensions)
9. [API Endpoints](#api-endpoints)
10. [Implementation Plan](#implementation-plan)

---

## Executive Summary

### Goal
Provide complete financial visibility into SaaS spending, automate contract management, and identify license optimization opportunities to reduce costs by 15-30%.

### Key Features
- **Billing Integrations**: Razorpay, Stripe, CSV upload
- **Contract Management**: PDF upload, AI extraction, renewal alerts
- **License Optimization**: Unused seat detection, cost analysis, recommendations
- **Spend Dashboard**: Department/app-wise breakdowns, budget tracking, wastage analysis

### Success Criteria
- Successfully integrate with Razorpay and Stripe
- Extract contract terms from PDFs with 90%+ accuracy
- Identify 20%+ of licenses as underutilized
- Provide actionable cost-saving recommendations
- Achieve 15-30% cost savings for customers

### Timeline
**Estimated**: 4-5 weeks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   AssetInfo Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Billing Integration Layer                   │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Razorpay   │  │   Stripe    │  │     CSV     │  │  │
│  │  │  Connector  │  │  Connector  │  │    Upload   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                    │                    │        │
│           └────────────────────┼────────────────────┘        │
│                               ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         AI-Powered Vendor Detection                  │  │
│  │  - Invoice text analysis                             │  │
│  │  - Vendor name normalization                         │  │
│  │  - Smart matching with existing apps                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                               │                               │
│                               ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Contract Management System                  │  │
│  │  - PDF upload & storage                              │  │
│  │  - AI contract extraction (OpenAI/Claude)            │  │
│  │  - Renewal date tracking                             │  │
│  │  - Alert scheduling                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                               │                               │
│                               ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         License Optimization Engine                   │  │
│  │  - Usage vs. assignment analysis                     │  │
│  │  - Inactive user detection                           │  │
│  │  - Cost per active user calculation                  │  │
│  │  - Tier downgrade recommendations                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                               │                               │
│                               ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Data Storage                             │  │
│  │  - saas_invoices (Phase 0 table)                     │  │
│  │  - saas_contracts (Phase 0 table)                    │  │
│  │  - license_assignments (new)                         │  │
│  │  - cost_allocations (new)                            │  │
│  │  - renewal_alerts (new)                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                               │                               │
│                               ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Spend Dashboard & Analytics                 │  │
│  │  - Department-wise spend                             │  │
│  │  - App-wise cost breakdown                           │  │
│  │  - Budget tracking                                   │  │
│  │  - Wastage heatmap                                   │  │
│  │  - Savings opportunities                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌──────────────────┐                      ┌──────────────────┐
│  Razorpay API    │                      │   Stripe API     │
│  - Invoices      │                      │   - Invoices     │
│  - Subscriptions │                      │   - Subscriptions│
│  - Payments      │                      │   - Customers    │
└──────────────────┘                      └──────────────────┘
```

---

## Billing Integrations

### 2.1 Razorpay Connector (Indian Market Priority)

**Why Razorpay First?**
- India's leading payment gateway
- Strong SaaS subscription support
- Comprehensive invoice API
- Smart routing for Indian businesses

#### Implementation

**File**: `server/services/billing/razorpay-connector.ts`

```typescript
import Razorpay from 'razorpay';
import { storage } from '../../storage';
import type { InsertSaasInvoice } from '@shared/schema';

interface RazorpayInvoice {
  id: string;
  customer_id: string;
  customer_details: {
    name: string;
    email: string;
  };
  line_items: Array<{
    name: string;
    description: string;
    amount: number;
    quantity: number;
  }>;
  amount: number;
  currency: string;
  status: 'issued' | 'paid' | 'cancelled' | 'expired';
  issued_at: number;
  paid_at?: number;
  due_date?: number;
}

export class RazorpayBillingConnector {
  private razorpay: Razorpay;
  private tenantId: string;

  constructor(apiKey: string, apiSecret: string, tenantId: string) {
    this.razorpay = new Razorpay({
      key_id: apiKey,
      key_secret: apiSecret
    });
    this.tenantId = tenantId;
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
      const response = await this.razorpay.invoices.all(params);
      return response.items || [];
    } catch (error) {
      console.error('[Razorpay] Error fetching invoices:', error);
      throw error;
    }
  }

  /**
   * Extract vendor name from invoice line items
   */
  private extractVendorName(invoice: RazorpayInvoice): string {
    // Use customer name as vendor
    return invoice.customer_details.name;
  }

  /**
   * Convert Razorpay invoice to AssetInfo invoice
   */
  private convertToInvoice(rzInvoice: RazorpayInvoice, appId?: string): InsertSaasInvoice {
    return {
      tenantId: this.tenantId,
      appId: appId,
      invoiceNumber: rzInvoice.id,
      vendor: this.extractVendorName(rzInvoice),
      amount: rzInvoice.amount / 100, // Convert paise to rupees
      currency: rzInvoice.currency.toUpperCase(),
      invoiceDate: new Date(rzInvoice.issued_at * 1000),
      dueDate: rzInvoice.due_date ? new Date(rzInvoice.due_date * 1000) : undefined,
      paidDate: rzInvoice.paid_at ? new Date(rzInvoice.paid_at * 1000) : undefined,
      status: this.mapStatus(rzInvoice.status),
      externalInvoiceId: rzInvoice.id,
      metadata: {
        source: 'razorpay',
        customerId: rzInvoice.customer_id,
        customerEmail: rzInvoice.customer_details.email,
        lineItems: rzInvoice.line_items
      }
    };
  }

  /**
   * Map Razorpay status to AssetInfo status
   */
  private mapStatus(rzStatus: string): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    switch (rzStatus) {
      case 'paid':
        return 'paid';
      case 'cancelled':
      case 'expired':
        return 'cancelled';
      case 'issued':
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

      for (const rzInvoice of invoices) {
        try {
          // Try to match vendor with existing SaaS app
          const vendorName = this.extractVendorName(rzInvoice);
          // TODO: Implement smart vendor matching using AI

          const invoice = this.convertToInvoice(rzInvoice);

          // Check if invoice already exists
          const existing = await storage.getSaasInvoiceByExternalId(
            rzInvoice.id,
            this.tenantId
          );

          if (existing) {
            await storage.updateSaasInvoice(existing.id, this.tenantId, invoice);
            updated++;
          } else {
            await storage.createSaasInvoice(invoice);
            created++;
          }
        } catch (error) {
          errors.push(`Failed to process invoice ${rzInvoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        synced: invoices.length,
        created,
        updated,
        errors
      };
    } catch (error) {
      errors.push(`Failed to fetch invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { synced: 0, created: 0, updated: 0, errors };
    }
  }
}
```

### 2.2 Stripe Connector

**File**: `server/services/billing/stripe-connector.ts`

```typescript
import Stripe from 'stripe';
import { storage } from '../../storage';
import type { InsertSaasInvoice } from '@shared/schema';

export class StripeBillingConnector {
  private stripe: Stripe;
  private tenantId: string;

  constructor(apiKey: string, tenantId: string) {
    this.stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' });
    this.tenantId = tenantId;
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

    const invoices: Stripe.Invoice[] = [];

    for await (const invoice of this.stripe.invoices.list(params)) {
      if (toDate && invoice.created > Math.floor(toDate.getTime() / 1000)) {
        break;
      }
      invoices.push(invoice);
    }

    return invoices;
  }

  /**
   * Extract vendor name from Stripe customer
   */
  private async getVendorName(customerId: string): Promise<string> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) return 'Unknown Vendor';
      return customer.name || customer.email || 'Unknown Vendor';
    } catch (error) {
      return 'Unknown Vendor';
    }
  }

  /**
   * Convert Stripe invoice to AssetInfo invoice
   */
  private async convertToInvoice(stripeInvoice: Stripe.Invoice, appId?: string): Promise<InsertSaasInvoice> {
    const vendor = typeof stripeInvoice.customer === 'string'
      ? await this.getVendorName(stripeInvoice.customer)
      : stripeInvoice.customer?.name || 'Unknown Vendor';

    return {
      tenantId: this.tenantId,
      appId: appId,
      invoiceNumber: stripeInvoice.number || stripeInvoice.id,
      vendor,
      amount: stripeInvoice.amount_due / 100, // Convert cents to dollars
      currency: stripeInvoice.currency.toUpperCase(),
      invoiceDate: new Date(stripeInvoice.created * 1000),
      dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : undefined,
      paidDate: stripeInvoice.status_transitions.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : undefined,
      status: this.mapStatus(stripeInvoice.status),
      externalInvoiceId: stripeInvoice.id,
      metadata: {
        source: 'stripe',
        customerId: stripeInvoice.customer,
        subscriptionId: stripeInvoice.subscription,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url
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

      for (const stripeInvoice of invoices) {
        try {
          const invoice = await this.convertToInvoice(stripeInvoice);

          // Check if invoice already exists
          const existing = await storage.getSaasInvoiceByExternalId(
            stripeInvoice.id,
            this.tenantId
          );

          if (existing) {
            await storage.updateSaasInvoice(existing.id, this.tenantId, invoice);
            updated++;
          } else {
            await storage.createSaasInvoice(invoice);
            created++;
          }
        } catch (error) {
          errors.push(`Failed to process invoice ${stripeInvoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        synced: invoices.length,
        created,
        updated,
        errors
      };
    } catch (error) {
      errors.push(`Failed to fetch invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { synced: 0, created: 0, updated: 0, errors };
    }
  }
}
```

### 2.3 CSV Invoice Upload

**File**: `server/services/billing/csv-parser.ts`

```typescript
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
}

export class CSVInvoiceParser {
  /**
   * Parse CSV content and convert to invoices
   */
  async parseCSV(csvContent: string, tenantId: string): Promise<{
    invoices: Partial<InsertSaasInvoice>[];
    errors: string[];
  }> {
    const invoices: Partial<InsertSaasInvoice>[] = [];
    const errors: string[] = [];

    return new Promise((resolve) => {
      const stream = Readable.from([csvContent]);

      stream
        .pipe(csv())
        .on('data', (row: CSVInvoiceRow) => {
          try {
            const invoice = this.parseRow(row, tenantId);
            invoices.push(invoice);
          } catch (error) {
            errors.push(`Row error: ${error instanceof Error ? error.message : 'Parse error'}`);
          }
        })
        .on('end', () => {
          resolve({ invoices, errors });
        })
        .on('error', (error) => {
          errors.push(`CSV parse error: ${error.message}`);
          resolve({ invoices, errors });
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

    return {
      tenantId,
      vendor: row.vendor.trim(),
      amount: parseFloat(row.amount),
      currency: row.currency?.toUpperCase() || 'USD',
      invoiceNumber: row.invoice_number?.trim(),
      invoiceDate: new Date(row.invoice_date),
      dueDate: row.due_date ? new Date(row.due_date) : undefined,
      paidDate: row.paid_date ? new Date(row.paid_date) : undefined,
      status: this.parseStatus(row.status),
      department: row.department?.trim(),
      costCenter: row.cost_center?.trim(),
      metadata: {
        source: 'csv',
        appName: row.app_name?.trim()
      }
    };
  }

  /**
   * Parse status string
   */
  private parseStatus(status?: string): 'pending' | 'paid' | 'overdue' | 'cancelled' {
    if (!status) return 'pending';

    const normalized = status.toLowerCase().trim();
    if (normalized === 'paid') return 'paid';
    if (normalized === 'overdue') return 'overdue';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
    return 'pending';
  }

  /**
   * Generate CSV template
   */
  generateTemplate(): string {
    return [
      'vendor,amount,currency,invoice_number,invoice_date,due_date,paid_date,status,app_name,department,cost_center',
      'Slack,999.00,USD,INV-001,2024-01-15,2024-02-15,2024-01-20,paid,Slack,Engineering,CC-ENG',
      'Google Workspace,1200.00,USD,INV-002,2024-01-20,2024-02-20,,pending,Google Workspace,IT,CC-IT'
    ].join('\n');
  }
}
```

---

## Contract Management

### 2.4 PDF Contract Upload & Storage

**File**: `server/services/contracts/pdf-storage.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class ContractPDFStorage {
  private baseDir: string;

  constructor(baseDir: string = '/data/contracts') {
    this.baseDir = baseDir;
  }

  /**
   * Store uploaded PDF contract
   */
  async storeContract(
    fileBuffer: Buffer,
    fileName: string,
    tenantId: string,
    contractId: string
  ): Promise<string> {
    // Create tenant directory
    const tenantDir = path.join(this.baseDir, tenantId);
    await fs.mkdir(tenantDir, { recursive: true });

    // Generate unique file name
    const fileId = uuidv4();
    const ext = path.extname(fileName);
    const storedFileName = `${contractId}_${fileId}${ext}`;
    const filePath = path.join(tenantDir, storedFileName);

    // Write file
    await fs.writeFile(filePath, fileBuffer);

    // Return relative path
    return `contracts/${tenantId}/${storedFileName}`;
  }

  /**
   * Retrieve contract PDF
   */
  async getContract(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, '..', relativePath);
    return await fs.readFile(fullPath);
  }

  /**
   * Delete contract PDF
   */
  async deleteContract(relativePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, '..', relativePath);
    await fs.unlink(fullPath);
  }
}
```

### 2.5 AI Contract Extraction

**File**: `server/services/contracts/ai-extractor.ts`

```typescript
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
}

export class AIContractExtractor {
  /**
   * Extract contract data from PDF text using AI
   */
  async extractFromText(pdfText: string): Promise<ExtractedContractData> {
    const prompt = `You are an AI assistant specialized in extracting key information from SaaS contracts. Analyze the following contract text and extract the key information.

CONTRACT TEXT:
${pdfText.substring(0, 10000)} // Limit to first 10k chars

Extract the following information in JSON format:
{
  "vendor": "Company name providing the SaaS service",
  "startDate": "Contract start date in YYYY-MM-DD format",
  "endDate": "Contract end date in YYYY-MM-DD format",
  "renewalDate": "Renewal date in YYYY-MM-DD format",
  "autoRenew": true/false,
  "annualValue": numeric value of annual contract,
  "currency": "USD/INR/EUR etc",
  "billingCycle": "monthly/quarterly/annual",
  "noticePeriodDays": number of days notice required,
  "totalLicenses": number of licenses/seats,
  "licenseType": "per-user/per-device/unlimited",
  "terms": "Brief summary of key terms",
  "keyPoints": ["Array of important contract clauses"]
}

Only include fields where you found explicit information. Return valid JSON only.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a contract analysis expert. Extract information accurately and return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const extracted = JSON.parse(content);

      // Convert date strings to Date objects
      return {
        ...extracted,
        startDate: extracted.startDate ? new Date(extracted.startDate) : undefined,
        endDate: extracted.endDate ? new Date(extracted.endDate) : undefined,
        renewalDate: extracted.renewalDate ? new Date(extracted.renewalDate) : undefined
      };
    } catch (error) {
      console.error('[AIExtractor] Error extracting contract data:', error);
      throw new Error('Failed to extract contract data from PDF');
    }
  }
}
```

---

## License Optimization

### 2.6 License Optimization Engine

**File**: `server/services/license-optimizer.ts`

```typescript
import { storage } from '../storage';

export interface LicenseOptimizationResult {
  appId: string;
  appName: string;
  totalLicenses: number;
  usedLicenses: number;
  unusedLicenses: number;
  utilizationRate: number;
  costPerLicense: number;
  wastedCost: number;
  inactiveUsers: Array<{ userId: string; userName: string; lastActive?: Date }>;
  recommendations: string[];
}

export class LicenseOptimizer {
  constructor(private tenantId: string) {}

  /**
   * Analyze all SaaS apps for license optimization opportunities
   */
  async analyzeAll(): Promise<LicenseOptimizationResult[]> {
    const apps = await storage.getSaasApps(this.tenantId, {});
    const results: LicenseOptimizationResult[] = [];

    for (const app of apps) {
      try {
        const result = await this.analyzeApp(app.id);
        if (result.unusedLicenses > 0) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error analyzing app ${app.id}:`, error);
      }
    }

    // Sort by wasted cost descending
    results.sort((a, b) => b.wastedCost - a.wastedCost);

    return results;
  }

  /**
   * Analyze a specific app for license optimization
   */
  async analyzeApp(appId: string): Promise<LicenseOptimizationResult> {
    // Get app details
    const app = await storage.getSaasApp(appId, this.tenantId);
    if (!app) {
      throw new Error('App not found');
    }

    // Get contract details
    const contracts = await storage.getSaasContracts(this.tenantId, { appId });
    const activeContract = contracts.find(c => c.status === 'active');

    const totalLicenses = activeContract?.totalLicenses || 0;
    const costPerLicense = totalLicenses > 0
      ? (activeContract?.annualValue || 0) / totalLicenses
      : 0;

    // Get user access data
    const users = await storage.getSaasAppUsers(appId, this.tenantId);
    const usedLicenses = users.filter(u => u.status === 'active').length;

    // Find inactive users (no activity in 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactiveUsers = users.filter(u =>
      u.status === 'active' &&
      (!u.lastAccessDate || new Date(u.lastAccessDate) < thirtyDaysAgo)
    ).map(u => ({
      userId: u.userId,
      userName: u.userName || 'Unknown',
      lastActive: u.lastAccessDate ? new Date(u.lastAccessDate) : undefined
    }));

    const unusedLicenses = Math.max(0, totalLicenses - usedLicenses);
    const utilizationRate = totalLicenses > 0 ? (usedLicenses / totalLicenses) * 100 : 0;
    const wastedCost = unusedLicenses * costPerLicense;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      totalLicenses,
      usedLicenses,
      unusedLicenses,
      utilizationRate,
      inactiveUsers: inactiveUsers.length
    });

    return {
      appId: app.id,
      appName: app.name,
      totalLicenses,
      usedLicenses,
      unusedLicenses,
      utilizationRate,
      costPerLicense,
      wastedCost,
      inactiveUsers,
      recommendations
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: {
    totalLicenses: number;
    usedLicenses: number;
    unusedLicenses: number;
    utilizationRate: number;
    inactiveUsers: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.unusedLicenses > 0) {
      recommendations.push(
        `Remove ${metrics.unusedLicenses} unused license${metrics.unusedLicenses > 1 ? 's' : ''} to save costs`
      );
    }

    if (metrics.inactiveUsers > 0) {
      recommendations.push(
        `${metrics.inactiveUsers} user${metrics.inactiveUsers > 1 ? 's have' : ' has'} not used the app in 30 days - consider removing access`
      );
    }

    if (metrics.utilizationRate < 50) {
      recommendations.push(
        `Low utilization (${metrics.utilizationRate.toFixed(1)}%) - consider downgrading to a lower tier`
      );
    }

    if (metrics.utilizationRate < 25) {
      recommendations.push(
        `Critical: Only ${metrics.utilizationRate.toFixed(1)}% of licenses are used - evaluate if this app is still needed`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Good utilization - no immediate optimization needed');
    }

    return recommendations;
  }

  /**
   * Calculate potential savings across all apps
   */
  async calculateTotalSavings(): Promise<{
    totalWasted: number;
    currency: string;
    appsWithWaste: number;
    totalUnusedLicenses: number;
  }> {
    const results = await this.analyzeAll();

    return {
      totalWasted: results.reduce((sum, r) => sum + r.wastedCost, 0),
      currency: 'USD', // TODO: Handle multi-currency
      appsWithWaste: results.length,
      totalUnusedLicenses: results.reduce((sum, r) => sum + r.unusedLicenses, 0)
    };
  }
}
```

---

## Spend Dashboard

### 2.7 Spend Analytics API

**File**: `server/routes/spend.routes.ts`

```typescript
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { LicenseOptimizer } from "../services/license-optimizer";

const router = Router();

/**
 * GET /api/spend/overview
 * Get spend overview statistics
 */
router.get("/overview", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const invoices = await storage.getSaasInvoices(req.user!.tenantId, {});

    const totalSpend = invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + (i.totalAmount || i.amount), 0);

    const pendingInvoices = invoices.filter(i => i.status === 'pending');
    const overdueInvoices = invoices.filter(i => i.status === 'overdue');

    // Get license optimization data
    const optimizer = new LicenseOptimizer(req.user!.tenantId);
    const savings = await optimizer.calculateTotalSavings();

    res.json({
      totalSpend,
      currency: 'USD',
      pendingAmount: pendingInvoices.reduce((sum, i) => sum + i.amount, 0),
      overdueAmount: overdueInvoices.reduce((sum, i) => sum + i.amount, 0),
      potentialSavings: savings.totalWasted,
      appsWithWaste: savings.appsWithWaste,
      unusedLicenses: savings.totalUnusedLicenses
    });
  } catch (error) {
    console.error('Failed to fetch spend overview:', error);
    res.status(500).json({ message: "Failed to fetch spend overview" });
  }
});

/**
 * GET /api/spend/by-app
 * Get spend breakdown by application
 */
router.get("/by-app", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const invoices = await storage.getSaasInvoices(req.user!.tenantId, {});

    // Group by app
    const appSpend = new Map<string, { appId: string; appName: string; totalSpend: number }>();

    for (const invoice of invoices) {
      if (!invoice.appId) continue;

      if (!appSpend.has(invoice.appId)) {
        const app = await storage.getSaasApp(invoice.appId, req.user!.tenantId);
        appSpend.set(invoice.appId, {
          appId: invoice.appId,
          appName: app?.name || 'Unknown',
          totalSpend: 0
        });
      }

      const entry = appSpend.get(invoice.appId)!;
      entry.totalSpend += invoice.status === 'paid' ? (invoice.totalAmount || invoice.amount) : 0;
    }

    const result = Array.from(appSpend.values())
      .sort((a, b) => b.totalSpend - a.totalSpend);

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch app spend:', error);
    res.status(500).json({ message: "Failed to fetch app spend" });
  }
});

/**
 * GET /api/spend/license-optimization
 * Get license optimization recommendations
 */
router.get("/license-optimization", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const optimizer = new LicenseOptimizer(req.user!.tenantId);
    const results = await optimizer.analyzeAll();

    res.json(results);
  } catch (error) {
    console.error('Failed to fetch license optimization:', error);
    res.status(500).json({ message: "Failed to fetch license optimization" });
  }
});

export default router;
```

---

## Implementation Plan

### Week 1: Billing Integrations
- [ ] Install dependencies (razorpay, stripe, csv-parser)
- [ ] Implement Razorpay connector
- [ ] Implement Stripe connector
- [ ] Create CSV parser
- [ ] Add billing integration routes
- [ ] Test invoice sync

### Week 2: AI & Contract Management
- [ ] Implement PDF storage service
- [ ] Add AI contract extraction
- [ ] Create contract upload routes
- [ ] Build renewal alert system
- [ ] Test with sample contracts

### Week 3: License Optimization
- [ ] Implement license optimizer engine
- [ ] Add user activity tracking
- [ ] Create optimization API routes
- [ ] Build recommendations engine
- [ ] Test with real usage data

### Week 4: Spend Dashboard
- [ ] Create spend analytics API
- [ ] Implement department/app breakdowns
- [ ] Build spend dashboard UI
- [ ] Add wastage heatmap
- [ ] Create budget tracking

### Week 5: Testing & Refinement
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Production deployment

---

## Success Metrics

- **Invoice Sync**: 100% successful sync from Razorpay/Stripe
- **Contract Extraction**: 90%+ accuracy
- **Cost Savings**: 15-30% identified waste
- **License Utilization**: Track 100% of licenses
- **User Adoption**: 80%+ of IT managers use spend dashboard

---

Ready to begin implementation!
