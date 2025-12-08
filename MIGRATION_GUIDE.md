# Route Migration Guide

## Current Status

The monolithic `routes.legacy.ts` (4,510 lines) has been analyzed and a modular structure created.

## Migration Strategy

### Phase 1: COMPLETED ✅
- [x] Created modular infrastructure
- [x] Extracted authentication routes → `auth.routes.ts`
- [x] Created middleware layer (auth, security)
- [x] Set up route aggregator (`routes/index.ts`)

### Phase 2: IN PROGRESS 🔄
**Priority route modules to extract:**

1. **users.routes.ts** (19 routes) - User management
2. **tickets.routes.ts** (12 routes) - Service desk
3. **assets.routes.ts** (13 routes) - Asset management
4. **vendors.routes.ts** (4 routes) - Vendor management
5. **licenses.routes.ts** (2 routes) - License management

### Phase 3: TODO 📋
**Remaining modules:**

- recommendations.routes.ts (3 routes)
- ai.routes.ts (2 routes)
- geographic.routes.ts (4 routes)
- dashboard.routes.ts (1 route)
- search.routes.ts (1 route)
- notifications.routes.ts (1 route)
- audit-logs.routes.ts (2 routes)
- master.routes.ts (3 routes)
- org.routes.ts (2 routes)
- software.routes.ts (2 routes)
- sync.routes.ts (2 routes)
- webhook.routes.ts (1 route)
- agent.routes.ts (1 route)
- enrollment.routes.ts (2 routes)
- dev.routes.ts (2 routes - already protected)
- debug.routes.ts (1 route)

## Route Extraction Process

### Step 1: Identify Route Boundaries

For each category, find all routes in `routes.legacy.ts`:

```bash
grep -n "app\.(get|post|put|delete|patch)(\"\/api\/CATEGORY" server/routes.legacy.ts
```

### Step 2: Extract Route Handler

Copy the entire route handler including:
- Route definition
- Request/response types
- All middleware
- Error handling
- Complete function body

### Step 3: Create Module File

Template structure:

```typescript
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
// ... other imports

const router = Router();

/**
 * GET /api/category/endpoint
 * Description of what this endpoint does
 */
router.get("/endpoint", authenticateToken, async (req: Request, res: Response) => {
  // Handler code
});

export default router;
```

### Step 4: Update Routes Index

Add to `server/routes/index.ts`:

```typescript
import categoryRoutes from "./category.routes";
app.use("/api/category", categoryRoutes);
```

### Step 5: Test

1. Start dev server: `npm run dev`
2. Test all endpoints in the module
3. Verify authentication works
4. Check error handling

### Step 6: Remove from Legacy

Once verified working:
1. Comment out routes in `routes.legacy.ts`
2. Test again
3. Delete commented code
4. Commit changes

## Automation Helper

Use this command to extract a route section:

```bash
# Get line numbers for a category
grep -n "/api/users" server/routes.legacy.ts

# Extract specific line range
sed -n 'START,ENDp' server/routes.legacy.ts > temp_routes.txt
```

## Benefits of Migration

- **Maintainability**: Each module is ~200-400 lines vs 4,510
- **Testability**: Can test modules in isolation
- **Team collaboration**: Multiple devs can work on different modules
- **Code review**: Easier to review smaller files
- **Performance**: Better code splitting potential
- **Documentation**: Each module can have focused docs

## Estimated Effort

| Module | Routes | Estimated Lines | Effort |
|--------|--------|----------------|---------|
| users | 19 | ~800 | 4 hours |
| tickets | 12 | ~600 | 3 hours |
| assets | 13 | ~1200 | 5 hours |
| vendors | 4 | ~200 | 1 hour |
| licenses | 2 | ~100 | 0.5 hours |
| **Remaining** | 30+ | ~1500 | 6 hours |
| **Total** | 80+ | ~4400 | ~20 hours |

## Current File Structure

```
server/routes/
├── index.ts                 # Route aggregator ✅
├── auth.routes.ts           # Authentication ✅
├── users.routes.ts          # TODO
├── tickets.routes.ts        # TODO
├── assets.routes.ts         # TODO
├── vendors.routes.ts        # TODO
└── ...                      # Other modules TODO
```

## Testing Checklist

For each migrated module:

- [ ] All routes respond correctly
- [ ] Authentication middleware works
- [ ] Authorization (roles) enforced
- [ ] Validation errors handled
- [ ] Database queries work
- [ ] No TypeScript errors
- [ ] Postman/API tests pass

## Notes

- Keep `routes.legacy.ts` until ALL routes migrated
- Both old and new routes can coexist during migration
- No breaking changes - URLs stay the same
- Middleware reused across all modules

## Questions?

See:
- `ARCHITECTURE.md` - Overall system architecture
- `server/routes/auth.routes.ts` - Example of completed module
- `server/middleware/auth.middleware.ts` - Middleware reference
