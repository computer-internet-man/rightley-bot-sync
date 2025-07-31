---

title: "Development and Deployment"

description: "Provides instructions for setting up, developing, and
deploying the application. Includes how to run the development server
(with Vite and Wrangler), execute tests, build the project, and deploy
to Cloudflare Workers using the Wrangler CLI (including secret and
environment configuration)."

version: "2025-07-28"

audience: sub-agent

deps: \[db, security, session\]

slug: commands

---

\# Development and Deployment

This project uses common npm scripts (via \`pnpm\`) for development,
building, and deployment. Here are the primary commands you’ll use:

\## Development Commands

\- \*\*Start the development server:\*\* \`pnpm run dev\`

This launches the Vite development server with RedwoodSDK’s plugin. Use
this during development to get live reload and an interactive local
environment. By default, the dev server is available at
\*\*http://localhost:5173\*\*. When running \`dev\`, RedwoodSDK serves
your application with server-side rendering enabled; you'll see console
logs from the Cloudflare Worker simulation and can interact with the app
in your browser. The dev server will also watch for file changes and
reload as needed.

\- \*\*Build the project:\*\* \`pnpm run build\`

This produces an optimized production build of your app. It runs Vite’s
build process, bundling the client-side assets and preparing the
server-side worker script. After this, you’ll have a ready-to-deploy
bundle (bundled into the \`dist/\` directory by default). Generally, you
won’t need to run \`build\` manually unless you want to preview or test
the production output, because the \`release\` command (below) runs it
internally.

\- \*\*Deploy to Cloudflare (Release):\*\* \`pnpm run release\`

This command builds your application and deploys it to Cloudflare
Workers. RedwoodSDK integrates with Cloudflare’s Wrangler to publish the
worker. Running \`release\` will create the production bundle and then
upload it to Cloudflare, making it live. The first time you run this,
you might be prompted to set up your Workers environment (for example,
it may ask you to create a \*\*workers.dev\*\* subdomain if you haven’t
already). Follow any prompts or instructions (e.g., visit the Cloudflare
dashboard to finalize setup). After a successful release, your app will
be accessible at the domain configured in your Cloudflare project (often
\`\<project\>.\<your workers subdomain\>.workers.dev\`, unless you’ve
bound a custom domain).

\- \*\*Database migrations:\*\* If you are using the database (D1 with
Prisma), there are helper commands to manage schema changes (see
\*\*@~/prisma/AGENT.md \*\* for more details). Typically:

\- \`pnpm run migrate:new "\<migration_name\>"\` to create a new
migration from your Prisma schema changes.

\- \`pnpm run migrate:dev\` to apply migrations locally (and regenerate
the Prisma client).

\- \`pnpm run migrate:prd\` to apply migrations in production (on the
remote D1 database).

These commands wrap the Cloudflare D1 migration process via Wrangler.

\*Usage notes:\* All these commands assume you’re using \*\*pnpm\*\* (as
the starter recommends). If you prefer \`npm\` or \`yarn\`, equivalent
scripts exist (e.g., \`npm run dev\` or \`yarn run dev\`) provided your
package manager is configured. Ensure you’ve installed dependencies
(\`pnpm install\`) before running \`dev\` or \`build\`. For deployment,
you should have authenticated Wrangler with your Cloudflare account (the
first deploy will guide you through this if not done).

Finally, RedwoodSDK is essentially a layer on Vite and Cloudflare
Workers, so you can also use any underlying tool commands as needed (for
example, using \`npx wrangler dev\` to preview the worker, though \`pnpm
run dev\` handles that in a more integrated way).

\## Environment Variables and Secrets

\- \*\*Local development (\`.env\`):\*\* Create a \`.env\` file at the
project root to store any environment-specific values needed during
development (e.g. API keys, database URLs). RedwoodSDK will
automatically symlink this file to Cloudflare’s \`.dev.vars\` when you
run the dev server, making those variables available to your Worker in
local mode. Configure all required secrets (e.g. AUTH_SECRET_KEY) in
Cloudflare before deployment – see @~/security/AGENT.md for the role of
these keys in the app security. After adding new environment variables,
run \`npx wrangler types\` to update the Worker’s environment type
definitions (this prevents TypeScript errors when accessing \`env\`
variables in code)

\- \*\*Production (Cloudflare secrets):\*\* \`npx wrangler secret put
\<NAME\>\`

Use Cloudflare’s Wrangler CLI to securely store sensitive values (like
API keys or database connection strings) as encrypted secrets in the
Workers environment. The CLI will prompt for the value and then bind it
to your Worker. Make sure to add all required secrets (for example, a
\`DATABASE_URL\` for Prisma or other API tokens) before running \`pnpm
run release\` so that the deployed Worker has access to them. You can
also manage secrets via the Cloudflare dashboard UI, but using the CLI
is typically faster. If you are using multiple Cloudflare environments
(e.g. a staging vs. production setup), be sure to set secrets for each
environment separately (for instance, run the secret command with an
\`--env \<envName\>\` flag to target a specific environment)

\- \*\*Non-secret config variables:\*\* For configuration values that
aren’t sensitive (such as feature flags or IDs), you can define them in
your Wrangler config file under a \`\[vars\]\` section. These plaintext
variables will be attached to the Worker environment at publish time For
example, in your \`wrangler.toml\` you might have:

\`\`\`toml

\[vars\]

API_HOST = "https://api.example.com"

FEATURE_FLAG = "enabled"

\`\`\`

Such values are accessible via the \`env\` object in your code (e.g.
\`env.API_HOST\`). Do not put secrets or credentials in \`\[vars\]\`,
since they would appear in config files in plain text. Always use
encrypted secrets for sensitive data.

\- \*\*Cloudflare D1 (database) setup:\*\* \`npx wrangler d1 create
\<DB_NAME\>\`

If your project uses Cloudflare D1 (e.g. a SQLite database with Prisma),
you need to provision the database and configure its binding before
deployment. Run the above command (with your desired database name) to
create a new D1 instance in your Cloudflare account. The CLI will output
a snippet containing the binding, \`database_name\`, and \`database_id\`
– add that to your Wrangler configuration (usually in \`wrangler.toml\`
or \`wrangler.jsonc\`) under the \`d1_databases\` section.

For example, RedwoodSDK’s default setup uses a binding named \`DB\` for
the D1 database. Ensuring this is in place means your Worker will have
access to the database at runtime. Perform this one-time setup (and any
similar setup for other services like KV namespaces or Durable Objects -
details in @~/session/AGENT.md ) before running the \`release\`
deployment, so that all environment bindings and secrets are properly
configured when you publish the Worker.
