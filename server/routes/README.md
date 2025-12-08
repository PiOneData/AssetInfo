# Routes Directory

This directory contains modular route handlers for the AssetVault API.

## Structure

Each route module follows this pattern:

```
category.routes.ts
- Handles all /api/category/* endpoints
- Imports required middleware and services
- Exports Express Router
```

## Current Status

| Module | Status | Routes | Notes |
|--------|--------|--------|-------|
| auth | ✅ Migrated | 3 | Complete |
| users | 🔄 Planned | 19 | High priority |
| tickets | 🔄 Planned | 12 | High priority |
| assets | 🔄 Planned | 13 | High priority |
| vendors | 🔄 Planned | 4 | Medium priority |
| licenses | 🔄 Planned | 2 | Medium priority |
| Others | ⏳ Legacy | 30+ | See routes.legacy.ts |

## Migration Process

See `/MIGRATION_GUIDE.md` for detailed migration instructions.

## Adding a New Route Module

1. Create `category.routes.ts` in this directory
2. Use `auth.routes.ts` as a template
3. Import and configure middleware
4. Add to `index.ts`
5. Test thoroughly
6. Remove from `routes.legacy.ts`

## Best Practices

- One category per file
- Use TypeScript strict mode
- Add JSDoc comments for each route
- Include error handling
- Validate inputs with Zod schemas
- Use proper HTTP status codes
- Log important events

## Example

```typescript
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";

const router = Router();

/**
 * GET /api/example
 * Example endpoint
 */
router.get("/", authenticateToken, async (req, res) => {
  res.json({ message: "Hello" });
});

export default router;
```
