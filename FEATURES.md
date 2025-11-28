# FEATURES

## Overview
AssetVault is a full-stack IT asset management platform composed of a React + Vite SPA, an Express/Drizzle backend, and optional enrollment agents that report inventory via Open-AudIT integrations. The system centralizes hardware, software, compliance, and AI-driven insights for tenants authenticated through role-based access control.

## Core Features

1. **Authentication & RBAC**
   - Login/registration flow backed by JWT tokens (`/api/auth/login`, `/api/auth/verify`).
   - Role hierarchy (Super Admin, Admin, IT Manager, Technician) enforced via middleware utilities (`requireRole`, `checkPermission`).
   - User settings page for profile updates, password changes, preferences, and account deletion safeguards.

2. **Dashboard & Metrics**
   - `client/src/pages/dashboard.tsx` renders draggable tiles for hardware/software/peripherals/others, unused assets, unused licenses, expiring warranties/licences, discovery jobs, and recent activities.
   - `/api/dashboard/metrics` aggregates counts, lifecycle statuses, ticket stats, and unused assets/licenses using Drizzle queries in `server/storage.ts`.

3. **Assets Management**
   - Assets page supports grid/table view with filtering, sorting, drag-resizable columns, and CRUD (create/edit/delete) through `AssetForm` and `/api/assets` routes.
   - Hardware, software, peripherals, and others categories with enrichment (serial, status, purchase info, warranty dates, custom fields, location tree).
   - Software tab integrates OA agent data, manual software assignment, and linking via `assetSoftwareLinks` table.
   - Bulk upload/download templates and validations for assets (`/api/assets/bulk/*`).

4. **Software & License Inventory**
   - Dedicated software licenses page (`client/src/pages/software.tsx`) with CRUD backed by `/api/licenses` routes.
   - View devices running a software asset via `/api/software/:id/devices` combining OA detections and manual links.

5. **Vendors Module**
   - Vendor list/add/edit flows with contract metadata (type, value, start/end dates, notes) via `/api/vendors` endpoints.
   - Contract value formatting and automatic refresh of vendor list after operations.

6. **Tickets & Activity**
   - Tickets page features filters, assignment management, status updates, comments, and history using `/api/tickets/*` routes.
   - Activity logs page surfaces audit entries from `auditLogs` table with pagination.

7. **Compliance & Risk**
   - Compliance overview, license/warranty drill-down, and score detail pages (`client/src/pages/compliance*.tsx`).
   - `/api/compliance/overview` delivers weighted score, issues, high-risk assets, license/warranty stats; `/api/compliance/score-details` provides breakdown for each control.
   - UI includes expandable tables showing full asset metadata per violation type and high-risk asset summaries.

8. **AI Assistant & Recommendations**
   - Floating AI assistant (`FloatingAIAssistant`) enabling natural language queries against ITAM data via `/api/ai/query` and LLM integration defined in `server/services/openai.ts`.
   - AI recommendations module (dashboard tile + recommendations page) fetches structured insights, supports Accept/Dismiss/Delete, and respects role gating.

9. **Discovery & Enrollment Support**
   - Discovery jobs UI monitors OA/Open-AudIT imports, agent enrollment tokens, and sync health through `/api/discovery/*` and `/api/enrollment-tokens/*` APIs.
   - Enrollment scripts/reporting managed via utilities under `server/utils(openAuditClient, openauditSync)` with cron scheduler in `server/index.ts`.

10. **Notifications & World Map**
    - Role-based notifications component surfaces pending tasks (compliance reviews, license renewals) via `/api/notifications`.
    - World map component visualizes asset distribution using geocoding endpoints (`/api/geographic/*`).

11. **Settings & Users**
    - Team management (users listing, role updates, activation/deactivation, invitations) via `/api/users/*`.
    - Settings includes org info, theme preferences, enrollment token management, and deletion safeguards with cascading cleanup.

12. **Utilities & Shared Infrastructure**
    - Extensive shared schema using Drizzle, Zod validations, and helper utilities (`auditLogger`, `email services`, `password generator`).
    - Global search (`/api/search`) spanning assets, users, vendors, tickets with role-aware filtering.

