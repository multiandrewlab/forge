# Issue #13: Project Scaffolding & Docker Compose — Design Spec

## Overview

Set up the Forge monorepo with npm workspaces, configure all tooling, and create Docker Compose infrastructure for local development. This is the foundation issue — all other issues depend on it.

**Approach:** Full issue spec implementation with two modern adaptations: Tailwind v4 (CSS-based config) and ESLint flat config.

## Monorepo Structure

```
forge/
├── packages/
│   ├── client/          # Vue 3 + Vite + Tailwind v4 + PrimeVue
│   │   ├── src/
│   │   │   ├── assets/
│   │   │   │   └── main.css       # Tailwind v4 entry (@import "tailwindcss" + @theme)
│   │   │   ├── components/        # .gitkeep
│   │   │   ├── composables/       # .gitkeep
│   │   │   ├── layouts/           # .gitkeep
│   │   │   ├── pages/
│   │   │   │   └── HomePage.vue   # Placeholder page
│   │   │   ├── stores/            # .gitkeep
│   │   │   ├── plugins/
│   │   │   │   └── router.ts
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── server/          # Fastify + TypeScript
│   │   ├── src/
│   │   │   ├── plugins/           # .gitkeep
│   │   │   ├── routes/
│   │   │   │   └── health.ts      # GET /api/health → { status: "ok" }
│   │   │   ├── services/          # .gitkeep
│   │   │   ├── db/
│   │   │   │   ├── migrations/    # .gitkeep
│   │   │   │   └── queries/       # .gitkeep
│   │   │   ├── app.ts             # Fastify app factory
│   │   │   └── server.ts          # Entry point (listen)
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/          # Zod schemas + TypeScript types
│       ├── src/
│       │   ├── types/
│       │   │   └── index.ts       # User, Post interfaces
│       │   ├── validators/
│       │   │   └── index.ts       # Zod schemas (createPostSchema, loginSchema)
│       │   ├── constants/
│       │   │   └── index.ts       # ContentType, Visibility, AuthProvider enums
│       │   └── index.ts           # Barrel export
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.client          # Multi-stage: node alpine build → nginx serve
│   ├── Dockerfile.server          # Multi-stage: node alpine build → node alpine run
│   └── init-db.sql                # CREATE EXTENSION uuid-ossp, pg_trgm, unaccent
│
├── docker-compose.yml             # PostgreSQL, MinIO, Ollama (infra only, not app)
├── package.json                   # npm workspaces root
├── tsconfig.base.json             # Shared strict TS config
├── eslint.config.js               # ESLint flat config
├── .prettierrc
├── .env.example
└── vitest.workspace.ts            # Workspace-level Vitest config
```

## Shared Package (`@forge/shared`)

- Exports TypeScript types, Zod validators, and constants
- Dependencies: `zod`
- Builds with `tsc` (no bundler needed)
- `tsconfig.json` extends `tsconfig.base.json` with `composite: true`
- Client and server depend on it via `"@forge/shared": "*"`

**Sample types:** `User`, `Post` interfaces matching the design spec schema.
**Sample validators:** `createPostSchema`, `loginSchema` using Zod.
**Sample constants:** `ContentType` (`snippet | prompt | document | link`), `Visibility` (`public | private`), `AuthProvider` (`google | local`).

## Server Package (`@forge/server`)

- Dependencies: `fastify`, `@fastify/cors`, `@fastify/cookie`, `zod`, `@forge/shared`
- Dev dependencies: `vitest`, `tsx`, TypeScript types
- Deferred deps (installed in future issues): `pg`, `node-pg-migrate`, `bcrypt`, `jsonwebtoken`, `@fastify/websocket` (issue #8)

**`src/app.ts`** — Fastify app factory. Registers CORS plugin and health route. Exports the app instance for both server startup and testing.

**`src/server.ts`** — Entry point. Imports app, reads `PORT` from env (default 3001), calls `app.listen()`.

**`src/routes/health.ts`** — Route plugin: `GET /api/health` returns `{ status: "ok" }`.

**Empty structure directories** with `.gitkeep`: `plugins/`, `services/`, `db/migrations/`, `db/queries/`.

**Test:** One test that starts the app, hits `GET /api/health`, asserts `{ status: "ok" }`.

## Client Package (`@forge/client`)

- Dependencies: `vue`, `vue-router`, `pinia`, `primevue`, `@forge/shared` (verify `@primevue/themes` is still a separate package — PrimeVue 4 may bundle themes in the main `primevue` package; install only if npm registry confirms it exists)
- Dev dependencies: `vite`, `@vitejs/plugin-vue`, `@tailwindcss/vite`, `tailwindcss`, `vitest`, `@vue/test-utils`, `jsdom`, `typescript`
- Deferred deps (installed in future issues): `@vueuse/core`, `vue-codemirror`, `shiki`

**`src/main.ts`** — Creates Vue app, installs Pinia, vue-router, PrimeVue. Mounts to `#app`.

**`src/App.vue`** — Root component with `<RouterView />`.

**`src/pages/HomePage.vue`** — Placeholder page with "Forge" heading. Satisfies the "serves a placeholder page" AC.

**`src/plugins/router.ts`** — Vue Router with single `/` route to HomePage.

**`src/assets/main.css`** — Tailwind v4 entry:
```css
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --color-surface: #1e1e2e;
}
```

**`vite.config.ts`** — Vue plugin, `@tailwindcss/vite` plugin, proxy `/api` and `/ws` to `localhost:3001`.

**`index.html`** — Standard Vite HTML entry with `<div id="app">`.

**Test:** One test that mounts `App.vue` and asserts it renders without errors.

**Empty structure directories** with `.gitkeep`: `components/`, `composables/`, `layouts/`, `stores/`.

## Docker Compose

Three infrastructure services only — app runs locally via `npm run dev`, not in containers. **Note:** The parent design spec mentions client/server in docker-compose; this is an intentional deviation for local dev ergonomics. A future issue can add app service definitions for staging/production.

**PostgreSQL** (`postgres:16-alpine`):
- Port 5432, database `forge`, user `forge`, password `forge_dev`
- Mounts `docker/init-db.sql` to `/docker-entrypoint-initdb.d/`
- Healthcheck: `pg_isready -U forge`

**MinIO** (`minio/minio:latest`):
- Ports 9000 (API) and 9001 (console)
- User `forge_minio`, password `forge_minio_secret`
- Healthcheck: `curl -f http://localhost:9000/minio/health/live` (`mc` CLI is not present in the minio/minio image)

**Ollama** (`ollama/ollama:latest`):
- Port 11434
- Persistent volume for models
- Healthcheck: `curl -f http://localhost:11434/api/tags` (`ollama list` fails with no models on fresh startup)

Named volumes: `pgdata`, `minio_data`, `ollama_data`.

**`docker/init-db.sql`:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

**`docker/Dockerfile.client`** — Multi-stage: node alpine build, nginx serve. Production only, not in compose.

**`docker/Dockerfile.server`** — Multi-stage: node alpine build, node alpine run. Production only, not in compose.

## Tooling

### ESLint (`eslint.config.js`)
- Flat config with `@eslint/js`, `typescript-eslint`, `eslint-plugin-vue`
- Strict TypeScript rules: no `any`, no unused vars
- Vue 3 recommended rules
- Ignores `dist/`, `node_modules/`, `coverage/`

### Prettier (`.prettierrc`)
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Husky (`.husky/pre-commit`)
- Runs `npx lint-staged`
- lint-staged config in root `package.json`: ESLint + Prettier on staged `.ts`, `.vue`, `.js` files

### Vitest
- `vitest.workspace.ts` at root defines two test projects: `packages/server`, `packages/client`
- Server uses Node environment, client uses jsdom
- `npm test` → `vitest run` across all workspaces
- `npm run test:coverage` → `vitest run --coverage` with `@vitest/coverage-v8`
- Coverage provider configured at workspace level: `coverage: { provider: 'v8' }` in `vitest.workspace.ts`
- Coverage enforced via `.coverage-thresholds.json` (100% lines/branches/functions/statements)

### TypeScript (`tsconfig.base.json`)
- `strict: true`, `noUncheckedIndexedAccess: true`
- `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`
- `declaration: true`
- No `any` enforced by both TS strict mode and ESLint
- **Note:** `composite: true` is set only in `packages/shared/tsconfig.json` (the referenced project), not in the base config. The server package overrides to `module: NodeNext` / `moduleResolution: NodeNext` in its own tsconfig.

### Environment (`.env.example`)
Full variable list from issue spec:
- `DATABASE_URL`, `MINIO_*`, `JWT_*`, `GOOGLE_*`, `LLM_*`, `OLLAMA_*`

### `.gitignore`
Extended with `*.tsbuildinfo` for TypeScript project references.

## Acceptance Criteria Mapping

| AC | How It's Met |
|----|-------------|
| `npm install` installs all workspace deps | npm workspaces in root `package.json` |
| `docker compose up` brings up PG, MinIO, Ollama healthy | Healthchecks on all 3 services |
| TypeScript compiles in all 3 packages | `tsconfig.json` per package extending `tsconfig.base.json` |
| Vite dev server starts with placeholder page | `HomePage.vue` with "Forge" heading |
| Fastify responds to `GET /api/health` with `{ status: "ok" }` | `routes/health.ts` |
| Shared exports importable by client and server | Workspace dependency `@forge/shared` |
| Zod configured with sample schema | `validators/index.ts` with `createPostSchema` |
| ESLint + Prettier on pre-commit | Husky + lint-staged |
| `.env.example` documents all env vars | Full variable list from issue spec |
| Vitest configured for server and client | `vitest.workspace.ts` + per-package configs |

## Definition of Done

- All acceptance criteria met
- `npm run build` succeeds in all packages
- `docker compose up` reaches healthy state
- `npm test` runs and exits 0
- ESLint + Prettier pass on all files
