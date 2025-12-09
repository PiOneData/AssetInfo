/**
 * Phase 6 Integration Tests
 * Tests for Access Requests, JIT Access, SoD, and Anomaly Detection
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../index';
import { storage } from '../storage';

describe('Phase 6: Advanced Features Integration Tests', () => {
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let appId: string;
  let sodRuleId: string;
  let accessRequestId: string;
  let jitSessionId: string;

  beforeAll(async () => {
    // Setup test data
    // In a real implementation, this would use a test database
    // For now, we'll use mock IDs
    tenantId = 'test-tenant-id';
    userId = 'test-user-id';
    appId = 'test-app-id';
  });

  describe('Access Requests Workflow', () => {
    it('should submit an access request', async () => {
      const response = await request(app)
        .post('/api/access-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          requesterId: userId,
          appId: appId,
          accessType: 'admin',
          justification: 'Need admin access for project setup',
          durationType: 'temporary',
          durationHours: 720,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('riskLevel');
      expect(response.body).toHaveProperty('sodConflicts');

      accessRequestId = response.body.requestId;
    });

    it('should get pending requests for approver', async () => {
      const response = await request(app)
        .get(`/api/access-requests/pending/approver/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should approve an access request', async () => {
      const response = await request(app)
        .post(`/api/access-requests/${accessRequestId}/review`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          decision: 'approved',
          approverId: userId,
          notes: 'Approved for project work',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should check overdue requests', async () => {
      const response = await request(app)
        .post('/api/access-requests/check-overdue')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('JIT Access Workflow', () => {
    it('should request temporary elevated access', async () => {
      const response = await request(app)
        .post('/api/jit-access')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: userId,
          appId: appId,
          accessType: 'admin',
          justification: 'Emergency production fix',
          durationHours: 4,
          requiresMfa: true,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('requiresMfa');

      jitSessionId = response.body.sessionId;
    });

    it('should get active JIT sessions', async () => {
      const response = await request(app)
        .get('/api/jit-access/active/all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should verify MFA for JIT session', async () => {
      const response = await request(app)
        .post(`/api/jit-access/${jitSessionId}/verify-mfa`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    it('should extend JIT session', async () => {
      const response = await request(app)
        .post(`/api/jit-access/${jitSessionId}/extend`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          additionalHours: 2,
          justification: 'Need more time to complete fix',
        });

      expect(response.status).toBe(200);
    });

    it('should revoke JIT session', async () => {
      const response = await request(app)
        .post(`/api/jit-access/${jitSessionId}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Work completed',
        });

      expect(response.status).toBe(200);
    });

    it('should auto-revoke expired sessions', async () => {
      const response = await request(app)
        .post('/api/jit-access/revoke-expired')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Segregation of Duties Workflow', () => {
    it('should create SoD rule', async () => {
      const response = await request(app)
        .post('/api/sod/rules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Financial Controls: Accounting & Payments',
          appId1: 'app-accounting-id',
          appId2: 'app-payments-id',
          severity: 'critical',
          rationale: 'Same user should not manage both accounting and payments',
          complianceFramework: 'SOX',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Financial Controls: Accounting & Payments');

      sodRuleId = response.body.id;
    });

    it('should get all SoD rules', async () => {
      const response = await request(app)
        .get('/api/sod/rules')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should check for SoD violations', async () => {
      const response = await request(app)
        .post('/api/sod/check')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: userId,
          appId: appId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('violations');
      expect(response.body).toHaveProperty('hasViolations');
    });

    it('should scan all users for violations', async () => {
      const response = await request(app)
        .post('/api/sod/scan')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalUsers');
      expect(response.body).toHaveProperty('violationsFound');
    });

    it('should get compliance report', async () => {
      const response = await request(app)
        .get('/api/sod/compliance-report?framework=SOX')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('framework');
      expect(response.body).toHaveProperty('complianceStatus');
      expect(response.body).toHaveProperty('violationsBySeverity');
    });

    it('should toggle SoD rule', async () => {
      const response = await request(app)
        .post(`/api/sod/rules/${sodRuleId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Anomaly Detection Workflow', () => {
    let anomalyId: string;

    it('should analyze user event for anomalies', async () => {
      const response = await request(app)
        .post('/api/anomalies/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: userId,
          userName: 'Test User',
          userEmail: 'test@example.com',
          appId: appId,
          appName: 'Test App',
          eventType: 'login',
          timestamp: new Date(),
          ipAddress: '192.168.1.1',
          location: 'US-CA',
        });

      expect(response.status).toBe(200);
    });

    it('should get all anomalies', async () => {
      const response = await request(app)
        .get('/api/anomalies')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        anomalyId = response.body[0].id;
      }
    });

    it('should get open anomalies', async () => {
      const response = await request(app)
        .get('/api/anomalies/open/all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should get anomaly statistics', async () => {
      const response = await request(app)
        .get('/api/anomalies/statistics/30')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalDetected');
      expect(response.body).toHaveProperty('byStatus');
      expect(response.body).toHaveProperty('bySeverity');
      expect(response.body).toHaveProperty('falsePositiveRate');
    });

    it('should investigate anomaly', async () => {
      if (!anomalyId) {
        return; // Skip if no anomalies exist
      }

      const response = await request(app)
        .post(`/api/anomalies/${anomalyId}/investigate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Investigating unusual login pattern',
        });

      expect(response.status).toBe(200);
    });

    it('should resolve anomaly', async () => {
      if (!anomalyId) {
        return; // Skip if no anomalies exist
      }

      const response = await request(app)
        .post(`/api/anomalies/${anomalyId}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          isFalsePositive: true,
          notes: 'User was traveling, legitimate access',
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Risk Scoring Integration', () => {
    it('should calculate risk score for access request with multiple factors', async () => {
      const response = await request(app)
        .post('/api/access-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          requesterId: userId,
          appId: 'high-risk-app-id', // Assume high-risk app
          accessType: 'owner', // High privilege
          justification: 'Need owner access',
          durationType: 'permanent',
        });

      expect(response.status).toBe(201);
      expect(response.body.riskScore).toBeGreaterThan(50); // Should be high/critical
      expect(['high', 'critical']).toContain(response.body.riskLevel);
    });
  });

  describe('Auto-Revocation & SLA Tracking', () => {
    it('should track SLA for access requests', async () => {
      const response = await request(app)
        .post('/api/access-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          requesterId: userId,
          appId: appId,
          accessType: 'member',
          justification: 'Standard access',
          durationType: 'permanent',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('slaDueAt');

      // Check SLA due date is set appropriately (24h or 48h)
      const slaDueAt = new Date(response.body.slaDueAt);
      const now = new Date();
      const hoursDiff = (slaDueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      expect(hoursDiff).toBeGreaterThan(0);
      expect(hoursDiff).toBeLessThanOrEqual(48);
    });
  });

  afterAll(async () => {
    // Cleanup test data
    // In a real implementation, this would clean up the test database
  });
});
