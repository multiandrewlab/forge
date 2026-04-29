import type { FullConfig } from '@playwright/test';

// v1 placeholder. When file uploads in fork specs land, this will clear MinIO
// e2e bucket residue. For the journey smoke, the per-test reset endpoint is
// enough.
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // intentionally empty
}
