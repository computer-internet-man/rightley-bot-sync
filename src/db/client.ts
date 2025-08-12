import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DrizzleClient = ReturnType<typeof createDrizzleClient>;

export const createDrizzleClient = (database: D1Database) => {
  return drizzle(database, { schema });
};

export let drizzleDb: DrizzleClient;

export const setupDrizzleDb = (env: Env) => {
  drizzleDb = createDrizzleClient(env.DB);
  return drizzleDb;
};

// Re-export schema and types for convenience
export * from './schema';
