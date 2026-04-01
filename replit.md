# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (for app data), MongoDB (connected dynamically by users)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (MongoDB management backend)
│   └── mongo-vision/       # React + Vite frontend (MongoVision UI)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## MongoVision Application

MongoVision is a full-stack advanced MongoDB database visualization and management tool designed to be better than MongoDB Compass.

### Features
- **Connection Manager**: Connect to any MongoDB URI (local, Atlas, with/without auth)
- **Database Explorer**: Sidebar with databases → collections tree, document counts
- **Document Viewer**: Virtualized table with JSON tree expansion, inline editing, filtering, sorting, pagination
- **Schema Analyzer**: Automatically infers schema from sample documents with field types, prevalence bars, inconsistency detection
- **Query Builder**: Raw JSON filter/sort/limit, aggregation pipeline editor, real-time results
- **Index Manager**: View, create, drop indexes with usage stats
- **Performance Insights**: Query explain plans, collection scan vs index scan detection, index suggestions
- **Data Visualization**: Dynamic charts (Bar, Line, Pie) using Recharts with configurable axes
- **Import/Export**: JSON and CSV import/export
- **Saved Queries**: Save and pin frequently used queries

### Architecture
- **Frontend**: `artifacts/mongo-vision/` — React + Vite + Tailwind, dark mode default (midnight blue + emerald green)
- **Backend**: `artifacts/api-server/` — Express with MongoDB native driver
- **MongoDB connection sessions** are held in-memory in `artifacts/api-server/src/lib/mongodb.ts`
- **Saved queries** are also held in-memory (session-scoped, restart resets them)

### Key Backend Files
- `artifacts/api-server/src/lib/mongodb.ts` — Connection session management
- `artifacts/api-server/src/routes/connections.ts` — Connection CRUD + test/stats
- `artifacts/api-server/src/routes/databases.ts` — Database listing + stats
- `artifacts/api-server/src/routes/collections.ts` — Collection CRUD
- `artifacts/api-server/src/routes/documents.ts` — Document CRUD + bulk ops
- `artifacts/api-server/src/routes/query.ts` — Query execution, aggregation, explain
- `artifacts/api-server/src/routes/schema.ts` — Schema analysis
- `artifacts/api-server/src/routes/indexes.ts` — Index management
- `artifacts/api-server/src/routes/importexport.ts` — Import/export
- `artifacts/api-server/src/routes/savedqueries.ts` — Saved queries

### Key Frontend Files
- `artifacts/mongo-vision/src/pages/home.tsx` — Connection manager home page
- `artifacts/mongo-vision/src/pages/connect.tsx` — New connection form
- `artifacts/mongo-vision/src/pages/explorer.tsx` — Main workspace (all tabs)
- `artifacts/mongo-vision/src/index.css` — Theme colors (dark: midnight blue + emerald)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
