# Architecture Documentation

## Overview

AssetVault has been refactored from a monolithic architecture to a modular, scalable structure following best practices for enterprise applications.

## Project Structure

```
AssetInfo/
├── client/                   # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components (21 pages)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utility functions
│   │   └── contexts/        # React contexts
├── server/                   # Express backend (TypeScript)
│   ├── routes/              # Modular route handlers
│   │   ├── index.ts         # Route aggregator
│   │   ├── auth.routes.ts   # Authentication routes
│   │   └── *.routes.ts      # Other route modules (TODO)
│   ├── middleware/          # Express middleware
│   │   ├── auth.middleware.ts      # Authentication/authorization
│   │   └── security.middleware.ts  # Security (CORS, Helmet, etc.)
│   ├── services/            # Business logic layer
│   │   ├── auth.ts          # Authentication service
│   │   ├── openai.ts        # AI integration
│   │   ├── email.ts         # Email service
│   │   └── *.ts             # Other services
│   ├── compliance/          # Compliance scoring engine
│   ├── utils/               # Utility functions
│   ├── __tests__/           # Unit and integration tests
│   ├── swagger.config.ts    # API documentation config
│   ├── storage.ts           # Data access layer
│   ├── db.ts                # Database connection
│   ├── index.ts             # Development server
│   ├── production.ts        # Production server
│   └── routes.legacy.ts     # Legacy routes (being migrated)
├── shared/                   # Shared code between client/server
│   ├── schema.ts            # Zod schemas and TypeScript types
│   └── utils.ts             # Shared utilities
├── migrations/              # Database migrations (Drizzle)
├── build/                   # Agent installer scripts
├── static/                  # Static assets
└── server/data/             # Geographic data files
```

## Architecture Layers

### 1. Presentation Layer (Client)

**Technology Stack:**
- React 18.3 with TypeScript
- Vite for build tooling
- TanStack Query for server state
- Wouter for routing
- Tailwind CSS for styling
- Shadcn/UI component library

**Key Patterns:**
- Functional components with hooks
- Server state via React Query
- Protected routes with role-based access
- Responsive design with mobile support

### 2. API Layer (Server Routes)

**Architecture:** RESTful API with modular routing

**Route Organization:**
```
/api/auth          → Authentication (login, register, verify)
/api/assets        → Asset management
/api/users         → User management
/api/tickets       → Service desk
/api/compliance    → Compliance and risk
/api/ai            → AI features
/api/reports       → Analytics and reporting
/api/discovery     → Asset discovery
... (see routes/index.ts for full list)
```

**Security Middleware Stack:**
1. CORS configuration
2. Helmet security headers
3. Rate limiting
4. Request logging
5. Authentication verification
6. Role-based authorization

### 3. Business Logic Layer (Services)

**Services:**
- `auth.ts` - JWT, password hashing, permissions
- `openai.ts` - AI recommendations and queries
- `openauditSync.ts` - Hardware inventory sync
- `deviceEnrichment.ts` - Asset data enrichment
- `email.ts` - Email notifications

**Pattern:** Service layer abstracts business logic from routes

### 4. Data Access Layer (Storage)

**File:** `server/storage.ts`

**Pattern:** Repository pattern with interface

```typescript
interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>
  createUser(user: InsertUser): Promise<User>
  // ... 100+ methods for all entities
}
```

**Benefits:**
- Single source of truth for data access
- Easy to mock for testing
- Type-safe database operations
- Tenant isolation enforced at this layer

### 5. Database Layer

**Technology:** PostgreSQL with Drizzle ORM

**Schema Tables (13):**
- users
- tenants
- assets
- softwareLicenses
- assetUtilization
- recommendations
- aiResponses
- userPreferences
- auditLogs
- masterData
- tickets
- ticketComments
- ticketActivities

**Migration Strategy:**
- Version-controlled migrations in `/migrations`
- Automatic migration application
- Rollback support

## Security Architecture

### Authentication Flow

```
1. User submits credentials → /api/auth/login
2. Validate email/password
3. Generate JWT token (7-day expiry)
4. Return token + user data
5. Client stores token in localStorage
6. Client sends token in Authorization header
7. Server verifies token on each request
8. Request proceeds or returns 401/403
```

### Authorization Model

**Role Hierarchy:**
```
Super Admin (highest)
    ↓
  Admin
    ↓
IT Manager
    ↓
Technician (lowest)
```

**Permission System:**
- Hierarchical: Higher roles have all lower role permissions
- Enforced at middleware level
- Checked before route handler execution

### Multi-Tenancy

**Strategy:** Shared database with row-level tenant isolation

**Implementation:**
- Every table has `tenantId` column
- All queries filtered by authenticated user's tenantId
- Middleware enforces tenant context
- Prevents cross-tenant data leakage

## API Documentation

### Swagger/OpenAPI

**Access:** `http://localhost:5050/api-docs` (development only)

**Features:**
- Interactive API explorer
- Auto-generated from code
- Request/response schemas
- Authentication testing

**Configuration:** `server/swagger.config.ts`

## Testing Strategy

### Unit Tests

**Framework:** Jest with ts-jest

**Coverage:**
- Authentication service
- Permission checks
- Business logic services
- Utility functions

**Run:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Integration Tests (TODO)

- API endpoint testing with supertest
- Database integration tests
- Multi-tenant isolation tests

### E2E Tests (TODO)

- Playwright or Cypress
- Critical user flows
- Cross-browser testing

## Performance Optimizations

### Client-Side

1. **Code Splitting:** Vite automatic chunking
2. **React Query Caching:** Reduces API calls
3. **Lazy Loading:** Route-based code splitting
4. **Image Optimization:** Proper sizing and formats

### Server-Side

1. **Response Compression:** Gzip middleware
2. **Database Indexing:** Optimized queries
3. **Caching Strategy:** Redis (future enhancement)
4. **Connection Pooling:** PostgreSQL pool

## Deployment Architecture

### Development

```bash
npm run dev    # Runs tsx server with hot reload
```

**Features:**
- Hot module replacement
- Source maps
- Detailed error messages
- Swagger UI enabled

### Production

```bash
npm run build  # Builds client + server
npm start      # Runs production server
```

**Features:**
- Minified bundles
- Production optimizations
- Security headers enforced
- Swagger UI disabled

### Environment Configuration

```
Development: NODE_ENV=development
Production:  NODE_ENV=production
Testing:     NODE_ENV=test
```

## Data Flow

### Typical Request Flow

```
1. Client sends HTTP request
   ↓
2. CORS middleware checks origin
   ↓
3. Helmet adds security headers
   ↓
4. Rate limiter checks request count
   ↓
5. Body parser processes payload
   ↓
6. Authentication middleware verifies JWT
   ↓
7. Authorization middleware checks role
   ↓
8. Route handler executes
   ↓
9. Service layer processes business logic
   ↓
10. Storage layer queries database
    ↓
11. Response sent to client
    ↓
12. Audit log created (if needed)
```

## Error Handling

### Client-Side

```typescript
// React Query handles errors automatically
const { data, error, isLoading } = useQuery(...)
if (error) {
  // Show error toast
}
```

### Server-Side

```typescript
// Global error handler in server/index.ts
app.use((err, req, res, next) => {
  const status = err.status || 500
  const message = err.message || "Internal Server Error"
  res.status(status).json({ message })
})
```

## Migration Plan

### From Monolith to Modular

**Current Status:** In progress

**Completed:**
- ✅ Auth routes extracted
- ✅ Middleware modularized
- ✅ Security layer added
- ✅ Testing infrastructure set up

**TODO:**
- ⏳ Extract assets routes
- ⏳ Extract users routes
- ⏳ Extract tickets routes
- ⏳ Extract other route modules
- ⏳ Remove routes.legacy.ts

**Strategy:**
1. Create new route module
2. Move code from routes.legacy.ts
3. Add tests for module
4. Update routes/index.ts
5. Verify functionality
6. Repeat for next module

## Monitoring & Observability (Future)

### Recommended Tools

1. **APM:** New Relic or DataDog
2. **Error Tracking:** Sentry
3. **Logging:** Winston → ELK Stack
4. **Metrics:** Prometheus + Grafana
5. **Uptime:** Pingdom or UptimeRobot

### Key Metrics to Track

- Request latency (p50, p95, p99)
- Error rates by endpoint
- Database query performance
- Authentication success/failure rates
- API rate limit hits
- Memory and CPU usage

## Scalability Considerations

### Current Capacity

- Single server architecture
- PostgreSQL single instance
- Suitable for: Up to 10,000 assets, 500 users

### Scaling Strategy

**Vertical Scaling (Phase 1):**
- Increase server resources
- Optimize database queries
- Add database indexes

**Horizontal Scaling (Phase 2):**
- Load balancer (nginx)
- Multiple app servers
- Redis session store
- Database read replicas

**Microservices (Phase 3 - Future):**
- Separate services for:
  - Authentication
  - Asset management
  - AI/recommendations
  - Reporting
- Message queue (RabbitMQ/Kafka)
- Service mesh (Istio)

## Best Practices

### Code Organization

1. **One responsibility per file**
2. **Clear naming conventions**
3. **Consistent error handling**
4. **Type safety everywhere**
5. **Comments for complex logic**

### Git Workflow

1. Feature branches from main
2. Descriptive commit messages
3. Pull request reviews
4. Automated tests pass before merge
5. Squash and merge

### Database

1. Always use migrations
2. Never modify production DB directly
3. Backup before schema changes
4. Index frequently queried columns
5. Use transactions for multi-step operations

## Troubleshooting

### Common Issues

**"Port already in use"**
```bash
lsof -ti:5050 | xargs kill -9
```

**"Database connection failed"**
- Check DATABASE_URL in .env
- Verify PostgreSQL is running
- Check network connectivity

**"Module not found"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**"Jest tests failing"**
- Check NODE_ENV=test is set
- Verify test database is accessible
- Clear Jest cache: `npm test -- --clearCache`

## Contributing

See CONTRIBUTING.md for detailed guidelines on:
- Code style
- Testing requirements
- PR process
- Documentation standards

## License

MIT License - see LICENSE file for details
