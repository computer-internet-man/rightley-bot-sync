import { setupDrizzleDb, drizzleDb } from "./db/client";

// Re-export everything from the new Drizzle client
export * from "./db/client";

// Keep the existing setupDb function for backward compatibility
export const setupDb = async (env: Env) => {
  return setupDrizzleDb(env);
};

// Export the db instance using the same name as before
export { drizzleDb as db };
