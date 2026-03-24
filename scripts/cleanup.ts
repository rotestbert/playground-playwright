/**
 * cleanup.ts — reset all adapter tables to a clean (empty) state.
 *
 * Run with:
 *   npm run db:cleanup
 *
 * In CI / test pipelines, call this after every test suite run to ensure
 * each run starts from a known blank state.
 *
 * If you're using a real database adapter (e.g. Prisma), replace the
 * MemoryAdapter import with your adapter and call adapter.reset() or
 * perform the equivalent truncation there.
 *
 * For HTTP API / GraphQL end-to-end tests against a live server, add the
 * server-specific teardown logic in the `cleanupRemote()` function below.
 */

import { MemoryAdapter } from '../src/factories/index.js';

// ─── In-memory cleanup ────────────────────────────────────────────────────────

async function cleanupMemory(): Promise<void> {
  const adapter = new MemoryAdapter();
  await adapter.reset();
  console.log('✅ MemoryAdapter reset — all tables cleared.');
}

// ─── Remote / real-DB cleanup (placeholder) ──────────────────────────────────

async function cleanupRemote(): Promise<void> {
  const baseUrl = process.env['BASE_URL'] ?? process.env['GRAPHQL_URL'];

  if (!baseUrl) {
    console.log('ℹ️  No BASE_URL / GRAPHQL_URL set — skipping remote cleanup.');
    return;
  }

  // TODO: replace with actual teardown endpoint calls, e.g.:
  //   await fetch(`${baseUrl}/api/test/reset`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`ℹ️  Remote cleanup against ${baseUrl} — add your teardown logic here.`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧹 Starting cleanup...\n');
  await cleanupMemory();
  await cleanupRemote();
  console.log('\n✅ Cleanup complete.\n');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
