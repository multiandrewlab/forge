# Project Scaffolding & Docker Compose Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Forge monorepo with npm workspaces, Docker Compose infrastructure, and all development tooling so that future issues can build on a working foundation.

**Architecture:** npm workspaces monorepo with three packages (`client`, `server`, `shared`). Docker Compose provides PostgreSQL, MinIO, and Ollama for local dev. App processes run natively via `npm run dev`, not in containers.

**Tech Stack:** Vue 3 + Vite + Tailwind v4 + PrimeVue (client), Fastify (server), Zod (shared validation), Vitest (testing), ESLint flat config + Prettier (linting), Husky + lint-staged (pre-commit).

**Spec:** `docs/superpowers/specs/2026-04-11-project-scaffolding-design.md`
**Issue:** GitHub #13

---

## Chunk 1: Root Configuration & Shared Package

### Task 1: Root Workspace Configuration

**Files:**

- Modify: `package.json`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update root `package.json` with workspaces and scripts**

```json
{
  "name": "forge",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/shared", "packages/server", "packages/client"],
  "scripts": {
    "build": "npm run build --workspaces",
    "pretest": "npm run build --workspace=packages/shared",
    "test": "vitest run",
    "test:coverage": "npm run pretest && vitest run --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepare": "husky"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-vue": "^10.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^15.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  },
  "lint-staged": {
    "*.{ts,vue,js}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,yaml,yml}": ["prettier --write"]
  }
}
```

Note: Keep existing `repository`, `bugs`, `homepage` fields from current package.json.

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "coverage"]
}
```

- [ ] **Step 3: Update `.gitignore`**

Append to existing `.gitignore`:

```
# TypeScript build info
*.tsbuildinfo
```

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json .gitignore
git commit -m "feat: configure npm workspaces and TypeScript base config"
```

---

### Task 2: Shared Package

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/validators/index.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@forge/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/src/constants/index.ts`**

```typescript
export const ContentType = {
  Snippet: 'snippet',
  Prompt: 'prompt',
  Document: 'document',
  Link: 'link',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const Visibility = {
  Public: 'public',
  Private: 'private',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const AuthProvider = {
  Google: 'google',
  Local: 'local',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];
```

- [ ] **Step 4: Create `packages/shared/src/types/index.ts`**

```typescript
import type { AuthProvider, ContentType, Visibility } from '../constants/index.js';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  authProvider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
  contentType: ContentType;
  language: string | null;
  visibility: Visibility;
  isDraft: boolean;
  forkedFromId: string | null;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  voteCount: number;
  viewCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
  readingTime: number | null;
}
```

- [ ] **Step 5: Create `packages/shared/src/validators/index.ts`**

```typescript
import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z.object({
  title: z.string().min(1).max(255),
  contentType: z.enum([
    ContentType.Snippet,
    ContentType.Prompt,
    ContentType.Document,
    ContentType.Link,
  ]),
  language: z.string().nullable().optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).default(Visibility.Public),
  isDraft: z.boolean().default(true),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```typescript
export * from './constants/index.js';
export * from './types/index.js';
export * from './validators/index.js';
```

- [ ] **Step 7: Install dependencies and build**

```bash
npm install
npm run build --workspace=packages/shared
```

Expected: `tsc` compiles successfully, `dist/` directory created.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package with types, validators, and constants"
```

---

## Chunk 2: Server Package (TDD)

### Task 3: Server Package Setup & Health Endpoint

**Files:**

- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/routes/health.ts`
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/server.ts`
- Test: `packages/server/src/__tests__/health.test.ts`
- Create: `packages/server/src/plugins/.gitkeep`
- Create: `packages/server/src/services/.gitkeep`
- Create: `packages/server/src/db/migrations/.gitkeep`
- Create: `packages/server/src/db/queries/.gitkeep`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@forge/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^11.0.0",
    "@forge/shared": "*",
    "fastify": "^5.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 3: Create `packages/server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p packages/server/src/{plugins,services,db/migrations,db/queries,routes,__tests__}
touch packages/server/src/plugins/.gitkeep
touch packages/server/src/services/.gitkeep
touch packages/server/src/db/migrations/.gitkeep
touch packages/server/src/db/queries/.gitkeep
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

- [ ] **Step 6: Write the failing test**

Create `packages/server/src/__tests__/health.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npx vitest run --config packages/server/vitest.config.ts
```

Expected: FAIL — `buildApp` not found / module not found.

- [ ] **Step 8: Create `packages/server/src/routes/health.ts`**

```typescript
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    return { status: 'ok' };
  });
}
```

- [ ] **Step 9: Create `packages/server/src/app.ts`**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors);
  await app.register(healthRoutes);

  return app;
}
```

- [ ] **Step 10: Create `packages/server/src/server.ts`**

```typescript
import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

- [ ] **Step 11: Run test to verify it passes**

```bash
npx vitest run --config packages/server/vitest.config.ts
```

Expected: PASS — 1 test passing.

- [ ] **Step 12: Build the server package**

```bash
npm run build --workspace=packages/server
```

Expected: `tsc` compiles with no errors.

- [ ] **Step 13: Commit**

```bash
git add packages/server/
git commit -m "feat: add server package with Fastify health endpoint"
```

---

## Chunk 3: Client Package (TDD)

### Task 4: Client Package Setup & Placeholder Page

**Files:**

- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/vitest.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.ts`
- Create: `packages/client/src/App.vue`
- Create: `packages/client/src/assets/main.css`
- Create: `packages/client/src/pages/HomePage.vue`
- Create: `packages/client/src/plugins/router.ts`
- Create: `packages/client/env.d.ts`
- Test: `packages/client/src/__tests__/App.test.ts`
- Create: `packages/client/src/components/.gitkeep`
- Create: `packages/client/src/composables/.gitkeep`
- Create: `packages/client/src/layouts/.gitkeep`
- Create: `packages/client/src/stores/.gitkeep`

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "@forge/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@forge/shared": "*",
    "pinia": "^3.0.0",
    "primevue": "^4.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@vue/test-utils": "^2.4.0",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "vue-tsc": "^2.0.0"
  }
}
```

Note: `@primevue/themes` may or may not be a separate package in PrimeVue 4. During `npm install`, check if it exists. If PrimeVue 4 bundles themes in the main package, skip it.

- [ ] **Step 2: Create `packages/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "outDir": "dist",
    "rootDir": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 3: Create `packages/client/env.d.ts`**

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
```

- [ ] **Step 4: Create `packages/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create `packages/client/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p packages/client/src/{components,composables,layouts,stores,pages,plugins,assets,__tests__}
touch packages/client/src/components/.gitkeep
touch packages/client/src/composables/.gitkeep
touch packages/client/src/layouts/.gitkeep
touch packages/client/src/stores/.gitkeep
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

- [ ] **Step 8: Write the failing test**

Create `packages/client/src/__tests__/App.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '../App.vue';
import HomePage from '../pages/HomePage.vue';

describe('App', () => {
  it('renders without errors', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: HomePage }],
    });

    const wrapper = mount(App, {
      global: {
        plugins: [router, createPinia()],
      },
    });

    await router.isReady();

    expect(wrapper.html()).toContain('Forge');
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

```bash
npx vitest run --config packages/client/vitest.config.ts
```

Expected: FAIL — `App.vue` not found.

- [ ] **Step 10: Create `packages/client/src/assets/main.css`**

```css
@import 'tailwindcss';

@theme {
  --color-primary: #f06a11ff;
  --color-surface: #1e1e2e;
}
```

- [ ] **Step 11: Create `packages/client/src/plugins/router.ts`**

```typescript
import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
  ],
});

export default router;
```

- [ ] **Step 12: Create `packages/client/src/pages/HomePage.vue`**

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-primary">Forge</h1>
      <p class="mt-4 text-lg text-gray-400">Internal Developer Knowledge-Sharing Platform</p>
    </div>
  </div>
</template>
```

- [ ] **Step 13: Create `packages/client/src/App.vue`**

```vue
<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
```

- [ ] **Step 14: Create `packages/client/src/main.ts`**

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './plugins/router';
import './assets/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue);

app.mount('#app');
```

- [ ] **Step 15: Create `packages/client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forge</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 16: Run test to verify it passes**

```bash
npx vitest run --config packages/client/vitest.config.ts
```

Expected: PASS — 1 test passing.

- [ ] **Step 17: Build the client package**

```bash
npm run build --workspace=packages/client
```

Expected: `vue-tsc` and `vite build` succeed with no errors.

- [ ] **Step 18: Commit**

```bash
git add packages/client/
git commit -m "feat: add client package with Vue 3, Tailwind v4, and PrimeVue"
```

---

## Chunk 4: Docker, Tooling, Environment & Verification

### Task 5: Docker Compose & Infrastructure

**Files:**

- Create: `docker-compose.yml`
- Create: `docker/init-db.sql`
- Create: `docker/Dockerfile.client`
- Create: `docker/Dockerfile.server`

- [ ] **Step 1: Create `docker/init-db.sql`**

```sql
-- PostgreSQL extensions for Forge
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: forge
      POSTGRES_USER: forge
      POSTGRES_PASSWORD: forge_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U forge']
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    ports:
      - '9000:9000'
      - '9001:9001'
    environment:
      MINIO_ROOT_USER: forge_minio
      MINIO_ROOT_PASSWORD: forge_minio_secret
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 5s
      timeout: 3s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    ports:
      - '11434:11434'
    volumes:
      - ollama_data:/root/.ollama
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:11434/api/tags']
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  pgdata:
  minio_data:
  ollama_data:
```

- [ ] **Step 3: Create `docker/Dockerfile.client`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
RUN npm ci --workspace=packages/shared --workspace=packages/client
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/client

FROM nginx:alpine
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 4: Create `docker/Dockerfile.server`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci --workspace=packages/shared --workspace=packages/server
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/server

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/server/package.json packages/server/
RUN npm ci --workspace=packages/shared --workspace=packages/server --omit=dev
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/server/dist packages/server/dist/
EXPOSE 3001
CMD ["node", "packages/server/dist/server.js"]
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker/
git commit -m "feat: add Docker Compose with PostgreSQL, MinIO, and Ollama"
```

---

### Task 6: Vitest Workspace & Coverage Configuration

**Files:**

- Create: `vitest.workspace.ts`
- Create: `vitest.config.ts`

Note: `.coverage-thresholds.json` already exists in the repo with 100% thresholds. The Vitest coverage config must match those thresholds.

- [ ] **Step 1: Create `vitest.workspace.ts`**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/server/vitest.config.ts',
  'packages/client/vitest.config.ts',
]);
```

- [ ] **Step 2: Create root `vitest.config.ts` with coverage configuration**

`defineWorkspace` does not accept a top-level `coverage` key — coverage is a global setting. Create a separate root `vitest.config.ts` that Vitest reads alongside the workspace file:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
```

- [ ] **Step 3: Verify tests run from root**

```bash
npm test
```

Expected: 2 tests passing (1 server, 1 client).

- [ ] **Step 4: Verify coverage runs and thresholds are enforced**

```bash
npm run test:coverage
```

Expected: Coverage report generated. All files at 100%. Vitest enforces thresholds — would fail if any metric dropped below 100%.

- [ ] **Step 5: Commit**

```bash
git add vitest.workspace.ts vitest.config.ts
git commit -m "feat: add Vitest workspace configuration with coverage thresholds"
```

---

### Task 7: ESLint & Prettier Configuration

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc`
- Modify: `.husky/pre-commit`

- [ ] **Step 1: Create `eslint.config.js`**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.gitkeep'],
  },
);
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Update `.husky/pre-commit`**

Replace contents with:

```
npx lint-staged
```

- [ ] **Step 4: Run lint and fix any issues**

```bash
npm run lint:fix
npm run format
```

Fix any errors that come up. Common issues: import ordering, trailing whitespace, quote style.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc .husky/pre-commit
git add -u  # pick up any lint-fixed files
git commit -m "feat: add ESLint flat config, Prettier, and lint-staged pre-commit"
```

---

### Task 8: Environment Configuration

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Replace the current contents with:

```bash
# Copy this file to .env and fill in your values
# NEVER commit .env — it is in .gitignore

# Database
DATABASE_URL=postgresql://forge:forge_dev@localhost:5432/forge

# MinIO (S3-compatible storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=forge_minio
MINIO_SECRET_KEY=forge_minio_secret

# JWT Authentication
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production

# Google OAuth (leave blank to disable)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# AI / LLM
LLM_PROVIDER=ollama
LLM_MODEL=gemma4
OLLAMA_BASE_URL=http://localhost:11434
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add full environment variable documentation"
```

---

### Task 9: Final Verification

Run all acceptance criteria checks:

- [ ] **Step 1: Verify `npm install` works**

```bash
rm -rf node_modules packages/*/node_modules
npm install
```

Expected: All workspace dependencies installed successfully.

- [ ] **Step 2: Verify TypeScript compiles in all packages**

```bash
npm run build
```

Expected: `tsc` succeeds for shared, server. `vue-tsc && vite build` succeeds for client.

- [ ] **Step 3: Verify Vite dev server starts**

```bash
npm run dev --workspace=packages/client &
sleep 3
curl -s http://localhost:3000 | grep -q "Forge"
kill %1
```

Expected: Vite dev server starts, placeholder page contains "Forge".

- [ ] **Step 4: Verify Fastify health endpoint**

```bash
npm run dev --workspace=packages/server &
sleep 2
curl -s http://localhost:3001/api/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Verify shared imports work**

Already verified implicitly — both client and server depend on `@forge/shared` and build successfully. The validators import from constants, types import from constants.

- [ ] **Step 6: Verify tests pass**

```bash
npm test
```

Expected: 2 tests passing.

- [ ] **Step 7: Verify coverage**

```bash
npm run test:coverage
```

Expected: 100% coverage across all metrics.

- [ ] **Step 8: Verify ESLint + Prettier pass**

```bash
npm run lint
npm run format:check
```

Expected: No errors, no formatting issues.

- [ ] **Step 9: Verify Docker Compose (if Docker available)**

```bash
docker compose up -d
docker compose ps
```

Expected: All 3 services healthy. If Docker is not available, skip this step — it can be verified manually.

- [ ] **Step 10: Clean up Docker**

```bash
docker compose down -v
```
