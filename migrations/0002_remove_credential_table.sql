-- Remove Credential table since we're switching to JWT authentication
DROP INDEX "Credential_userId_key";
DROP INDEX "Credential_credentialId_key";
DROP INDEX "Credential_credentialId_idx";
DROP INDEX "Credential_userId_idx";
DROP TABLE "Credential";

-- Add email and role columns to User table if they don't exist
-- (they already exist in the current schema, but this ensures compatibility)
-- Note: SQLite doesn't support IF NOT EXISTS for columns, so we'll handle this gracefully
