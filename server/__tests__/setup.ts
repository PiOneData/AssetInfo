/**
 * Jest setup file
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-jwt-testing';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/assetinfo_test';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
