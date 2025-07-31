---

title: "Database & ORM"

description: "Covers the project's database layer using Cloudflare D1
(SQLite) and the Prisma ORM. Describes the database schema, how Prisma
is used for data access, and how the application manages persistent data
and connections."

version: "2025-07-28"

audience: sub-agent

deps: \[session, commands, security\]

slug: db

---

\# Database & ORM

\## Overview

This project uses \*\*Cloudflare D1\*\* as its primary database,
accessed via an ORM (Prisma). D1 is Cloudflare’s serverless SQL database
(with SQLite semantics) that offers low-latency access and built-in
durability. The RedwoodSDK standard starter comes pre-configured to work
with D1 – on first deployment, a D1 database is provisioned
automatically and bound to the Cloudflare Worker. The database binding
(named \`"DB"\` by default) is defined in \*\*\`wrangler.jsonc\`\*\*,
enabling the code to access the database through the Worker \`env\`
object.

We use \*\*Prisma\*\* as the ORM to interact with the D1 database. The
schema is defined in \*\*\`prisma/schema.prisma\`\*\*, and the project
includes the \`@prisma/adapter-d1\` to bridge Prisma with D1. The Prisma
client is initialized at runtime (e.g. via \`setupDb(env)\` in
\*\*\`src/db/db.ts\`\*\*) using the D1 binding and a connection URL from
environment variables. This provides a convenient API (\`db\`) for
performing database queries in our server code. For example, after a
user logs in, the framework uses \`db.user.findUnique()\` to retrieve
the user record by ID from D1. All persistent application data (such as
user accounts, etc.) is stored in the D1 database (see
@~/session/AGENT.md for how authentication uses these records and see
@~/security/AGENT.md for the auth flow).

\## Migrations

Prisma’s migration system is not fully compatible with D1 yet, so
RedwoodSDK uses a custom workflow for database migrations. We have
special npm scripts in \*\*\`package.json\`\*\* for managing schema
changes:

\- \*\*\`migrate:new\`\*\* – Generate a new migration file (SQL) based
on Prisma schema changes. This uses Redwood’s built-in migration
generator to create a new file under \*\*\`migrations/\`\*\* (with an
incremental timestamped name) containing the necessary DDL statements.

\- \*\*\`migrate:dev\`\*\* – Regenerate the Prisma client and apply
pending migrations to the local D1 database (using the Wrangler CLI in
local mode).

\- \*\*\`migrate:prd\`\*\* – Apply migrations to the production D1
database (using Wrangler in remote mode).

To add or modify database tables, update the Prisma schema file, then
run \`npm run migrate:new "describe_the_change"\` to create a new
migration. This will also apply the migration locally during
development. For local development, apply migrations by running \`npm
run migrate:dev\`, which will compile the Prisma client and execute the
SQL on the D1 database (through Miniflare). In production, running \`npm
run release\` (see @~/scripts/AGENT.md) will ensure all new migrations
are applied to the Cloudflare D1 database (either automatically or via
the \`migrate:prd\` script) before deploying.

\*\*Do not manually edit or repurpose existing migration SQL files.\*\*
Each database schema change should be captured in a new migration file
to preserve history. The initial project setup includes an
\*\*\`migrations/0001_init.sql\`\*\* file with the base schema. The
Prisma client generation (\`@prisma/client\`) is tied to the schema, so
after changing the schema and creating a migration, ensure the client is
updated (our dev migration script handles running \`prisma generate\`
for you).

\## Usage and Best Practices

In this codebase, database access is typically performed within
server-side code (e.g. React Server Components or API routes) via the
\`db\` client. Because RedwoodSDK runs on Cloudflare Workers, database
queries are fast and executed close to the user when possible. Keep in
mind that D1 (being essentially SQLite under the hood) works best for
\*\*transactional\*\* queries and moderately sized datasets; complex
analytic queries or heavy workloads might require optimization or an
external database.

\### \*\*Initializing the Database\*\*

On each Worker start or request, we ensure the database is ready by
calling a setup function (which handles connecting to D1 using the bound
credentials). The binding information for D1 is stored in
\*\*\`wrangler.jsonc\`\*\* under \`d1_databases\` – you can find the
database name and UUID there, bound to the variable \`env.DB\`. No
additional configuration is needed for local development, because the
first \`npm run dev\` will create a local D1 instance (inside the
\`.wrangler/state/\` directory) and Prisma will connect to it using the
\`DATABASE_URL\` in \*\*\`.dev.vars\`\*\*.

\### \*\*Seeding Data\*\*

For convenience, the project includes a \*\*\`src/scripts/seed.ts\`\*\*
script which can be run to seed the database with initial data. This
script uses the same \`db\` client to insert records. If you need to
initialize or reset the development database, running the seed script
(e.g. \`npx tsx src/scripts/seed.ts\`) is a straightforward way to
populate default data.

\### \*\*Data Consistency:\*\*

Because application server instances run in a distributed manner on
Cloudflare’s network, D1 provides \*\*eventual consistency\*\*
guarantees. Simple create/read/update operations are ACID within a
single request, but globally there may be replication lag. If strict
consistency is required for certain flows (e.g. real-time feeds or
cross-Worker synchronization), consider using Durable Objects (which
offer single-instance consistency) or other strategies. (For example,
session data in this app is stored in a Durable Object to ensure
consistency — see @~/session/AGENT.md.)

In summary, you should focus on managing the Prisma schema and migration
files when implementing changes to data models. Always use the provided
migration scripts to evolve the schema, ensure new queries are performed
via the \`db\` client, and maintain the integrity of data relationships
in D1. By following these practices, the project’s data layer will
remain robust and in sync with the application’s needs.
