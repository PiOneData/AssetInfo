# Security Enhancements

This document outlines the security improvements implemented in the AssetVault ITAM application.

## Overview of Security Measures

### 1. **CORS (Cross-Origin Resource Sharing) Protection**

**Location:** `server/middleware/security.middleware.ts`

- Configured to allow only trusted origins
- Credentials support enabled for authenticated requests
- Configurable allowed origins via environment variables
- Automatic handling of development and production environments

**Configuration:**
```typescript
// Default allowed origins
- http://localhost:5050 (main app)
- http://localhost:3000 (dev frontend)
- http://localhost:5173 (Vite dev server)
```

### 2. **Rate Limiting**

**Implemented three tiers of rate limiting:**

#### General API Rate Limiter
- **Window:** 15 minutes
- **Max requests:** 1000 per IP
- **Scope:** All `/api/*` endpoints
- **Purpose:** Prevent API abuse and DDoS attacks

#### Authentication Rate Limiter
- **Window:** 15 minutes
- **Max requests:** 5 per IP
- **Scope:** `/api/auth/*` endpoints
- **Purpose:** Prevent brute force password attacks
- **Feature:** Skips counting successful requests

#### Sensitive Operations Limiter
- **Window:** 1 hour
- **Max requests:** 10 per IP
- **Scope:** Password resets, user creation, etc.
- **Purpose:** Limit sensitive operations

### 3. **Security Headers (Helmet.js)**

**Implemented headers:**
- `Content-Security-Policy` - Prevents XSS and injection attacks
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection` - Enables XSS filter
- `Referrer-Policy` - Controls referrer information
- `Permissions-Policy` - Restricts browser features

### 4. **Development Route Protection**

- All `/api/dev/*` routes are automatically blocked in production
- Returns 404 error in production environment
- Prevents accidental exposure of maintenance endpoints

### 5. **Request Payload Limits**

- JSON payload limit: 10MB
- URL-encoded payload limit: 10MB
- Prevents memory exhaustion attacks

### 6. **Response Compression**

- Gzip compression enabled for all responses
- Configurable compression level (default: 6)
- Reduces bandwidth and improves performance

### 7. **JWT Authentication**

**Features:**
- Bearer token authentication
- 7-day token expiration
- Secure token verification
- Role-based access control (RBAC)

**Roles hierarchy:**
1. Technician (lowest)
2. IT Manager
3. Admin
4. Super Admin (highest)

### 8. **Password Security**

- bcrypt hashing with salt rounds: 10
- Minimum complexity enforced by Zod validation
- Secure password comparison
- First-login password change requirement

## Environment Variables

Required security-related environment variables:

```bash
# Required
SESSION_SECRET=your-super-secret-jwt-key-change-this-in-production
DATABASE_URL=postgresql://...

# Optional
CLIENT_URL=http://localhost:5050
PRODUCTION_URL=https://your-domain.com
NODE_ENV=development|production|test
```

## Vulnerability Status

### Fixed Vulnerabilities
- ✅ Updated Express to 4.21.2+
- ✅ Updated Vite to 5.4.20+
- ✅ Updated glob package
- ✅ Updated express-session

### Known Issues
- ⚠️ **xlsx** package (v0.18.5) has 2 high-severity vulnerabilities with no fix available
  - Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
  - ReDoS (GHSA-5pgg-2g8v-p4x9)
  - **Mitigation:** Validate all Excel file inputs, limit file sizes, sanitize data
  - **Alternative:** Consider switching to a different Excel library if needed

## API Documentation

- **Swagger UI:** Available at `/api-docs` (development only)
- **OpenAPI Spec:** Available at `/api-docs.json`
- Auto-generated from code comments and JSDoc

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Security Best Practices

### For Developers

1. **Never commit secrets** - Use `.env` files (already gitignored)
2. **Always validate input** - Use Zod schemas for all endpoints
3. **Sanitize user data** - Especially before database insertion
4. **Use parameterized queries** - Drizzle ORM handles this automatically
5. **Log security events** - All auth attempts are logged to audit trail
6. **Review PR security** - Check for SQL injection, XSS, CSRF vulnerabilities

### For Deployment

1. **Set strong SESSION_SECRET** - Use cryptographically random value
2. **Enable HTTPS** - Always use SSL/TLS in production
3. **Configure CORS** - Set PRODUCTION_URL correctly
4. **Database security** - Use strong passwords, limit access
5. **Regular updates** - Keep dependencies up to date
6. **Monitor logs** - Check audit logs regularly for suspicious activity

## Audit Logging

All security-relevant events are logged:
- Login attempts (successful and failed)
- Password changes
- Role changes
- User creation/deletion
- Data modifications

Logs include:
- User ID and email
- IP address
- User agent
- Timestamp
- Action details
- Success/failure status

## Compliance

This implementation supports:
- **GDPR** - User data protection and audit trails
- **SOC 2** - Access controls and logging
- **ISO 27001** - Information security management
- **HIPAA** - Audit trails and access controls (if handling healthcare data)

## Incident Response

In case of security incident:

1. **Immediate Actions:**
   - Revoke compromised tokens
   - Check audit logs for unauthorized access
   - Identify affected users/data

2. **Investigation:**
   - Review `/api/audit-logs` endpoint
   - Check server logs
   - Analyze attack patterns

3. **Remediation:**
   - Patch vulnerabilities
   - Force password resets if needed
   - Update security rules

4. **Post-Incident:**
   - Document findings
   - Update security measures
   - Inform affected users (if required)

## Security Contacts

For security concerns or to report vulnerabilities:
- Email: security@assetvault.com
- Create private security issue on GitHub

## Updates Log

- **2025-12-08:** Initial security hardening
  - Added CORS, Helmet, Rate Limiting
  - Implemented modular architecture
  - Added API documentation
  - Set up testing infrastructure
  - Protected dev routes
  - Updated vulnerable dependencies
