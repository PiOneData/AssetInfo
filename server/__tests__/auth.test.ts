import { describe, it, expect, beforeEach } from '@jest/globals';
import { generateToken, verifyToken, hashPassword, comparePassword, checkPermission } from '../services/auth';

describe('Authentication Service', () => {
  describe('Password Hashing', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hashed = await hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(password);
      expect(hashed.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hashed = await hashPassword(password);
      const isValid = await comparePassword(password, hashed);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hashed = await hashPassword(password);
      const isValid = await comparePassword(wrongPassword, hashed);

      expect(isValid).toBe(false);
    });
  });

  describe('JWT Tokens', () => {
    const mockUser = {
      id: 'test-user-id',
      username: 'test@example.com',
      email: 'test@example.com',
      password: 'hashed',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      tenantId: 'test-tenant-id',
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      avatar: null,
      phone: null,
      department: null,
      jobTitle: null,
      manager: null,
      lastLoginAt: null,
      invitedBy: null,
      userID: 1,
    };

    it('should generate a valid JWT token', () => {
      const token = generateToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should verify a valid token', () => {
      const token = generateToken(mockUser);
      const payload = verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload?.userId).toBe(mockUser.id);
      expect(payload?.email).toBe(mockUser.email);
      expect(payload?.role).toBe(mockUser.role);
      expect(payload?.tenantId).toBe(mockUser.tenantId);
    });

    it('should reject an invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const payload = verifyToken(invalidToken);

      expect(payload).toBeNull();
    });

    it('should reject a tampered token', () => {
      const token = generateToken(mockUser);
      const tamperedToken = token.slice(0, -10) + 'tampered';
      const payload = verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });
  });

  describe('Role-Based Permissions', () => {
    it('should allow admin to access admin-required resources', () => {
      const result = checkPermission('admin', 'admin');
      expect(result).toBe(true);
    });

    it('should allow admin to access technician-required resources', () => {
      const result = checkPermission('admin', 'technician');
      expect(result).toBe(true);
    });

    it('should allow super-admin to access admin-required resources', () => {
      const result = checkPermission('super-admin', 'admin');
      expect(result).toBe(true);
    });

    it('should deny technician access to admin-required resources', () => {
      const result = checkPermission('technician', 'admin');
      expect(result).toBe(false);
    });

    it('should allow technician to access technician-required resources', () => {
      const result = checkPermission('technician', 'technician');
      expect(result).toBe(true);
    });

    it('should deny access for unknown roles', () => {
      const result = checkPermission('unknown-role', 'admin');
      expect(result).toBe(false);
    });
  });
});
