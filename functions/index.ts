import { createDatabaseClient } from './_qoder/backend.mjs';
import { createApp, createDbLeaseStore } from './app.mjs';

const app = createApp({
  env: Deno.env.toObject(),
  leaseStore: createDbLeaseStore(createDatabaseClient()),
});

Deno.serve(app);
