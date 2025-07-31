\<!-- AGENT.md --\>

---

topic: agent

audience: master-agent

deps: \[db, session, app, security, commands, routes\]

version: 2025-07-30

---

\# RedwoodSDK Cloudflare Starter – Repository Guide

\*\*Overview:\*\* The \*RedwoodSDK Cloudflare Starter Template\* is a
full-stack boilerplate optimized for Cloudflare’s edge network. It
combines the RedwoodSDK framework with Cloudflare Workers, Durable
Objects, a D1 SQLite database, and R2 object storage to deliver
high-performance SSR and an interactive React UI. The stack is set up
with TypeScript, Prisma for ORM, Vite for rapid builds, and a WebAuthn
passkey-based authentication flow. This template aims to let developers
focus on app features rather than infrastructure – out of the box it
achieves sub-50 ms server response times for SSR, password-less logins,
and \<200 ms development rebuilds via HMR:

\*\*Key components:\*\*

\- \*\*RedwoodSDK Framework\*\* – Provides server-side rendering (SSR)
and React Server Component support.

\- \*\*Cloudflare Workers\*\* – Globally distributed serverless runtime
for handling requests at the edge.

\- \*\*Durable Objects\*\* – Cloudflare’s built-in stateful objects for
per-user session storage. (see @~/session/AGENT.md for session
management details.)

\- \*\*D1 Database + Prisma\*\* – Cloudflare D1 (SQLite) for persistent
SQL storage, (see @~/prisma/AGENT.md for schema and query details)
accessed via the Prisma type-safe ORM.

\- \*\*R2 Object Storage\*\* – S3-like storage on Cloudflare for files
and media.

\- \*\*WebAuthn Passkeys\*\* – Modern password-less authentication using
device credentials.

\- \*\*Vite Build Tool\*\* – Enables fast hot-reload during development
and optimized ESM bundles for production.

\- \*\*Dev Containers\*\* – Dockerized development environment for
consistency across machines.

\- \*\*Wrangler CLI\*\* – Tool for building, previewing, and deploying
the app to Cloudflare Workers.

\## Documentation Topics

\- \*\*Database & ORM\*\* – see \*\*@~/prisma/AGENT.md\*\* for database
schema and Prisma usage details.

\- \*\*Authentication & Sessions\*\* – see \*\*@~/session/AGENT.md\*\*
for WebAuthn login flows and session management.

\- \*\*UI & Rendering (SSR/RSC)\*\* – see \*\*@~/src/app/AGENT.md\*\*
for frontend architecture and server-side rendering details.

\- \*\*URL Routing Patterns\*\* – see \*\*@~/src/routes/AGENT.md \*\*
for route matching examples including static paths, dynamic URL
parameters, and wildcard patterns.

\- \*\*Security & Compliance\*\* – see \*\*@~/security/AGENT.md\*\* for
security best practices, headers, and policies.

\- \*\*Development and Deployment\*\* – see \*\*@~/ scripts/AGENT.md
\*\* for setup instructions, build/test commands, and deployment steps.

\## AMP Agent Usage Guidelines

\- You should use this guide (AGENT.md) to understand the project
structure and direct queries to the appropriate \*\*sub-agent\*\*
document. Based on a user’s question, identify which sub-topic (db,
session, security, etc.) is relevant and delegate that query to the
corresponding \*\*sub-agent\*\* document.

\- Each \*\*sub-agent\*\* document is written for a specific domain.
Sub-agents should confine their answers to information from their own
document. If a query spans multiple domains (for example, involves both
session \*and\* security), you should coordinate by providing each
relevant doc to your respective sub-agent or synthesizing answers from
multiple docs.

\- \*\*Dependencies:\*\* The frontmatter \`deps\` field in each document
lists related topics. You can load those additional docs if needed. For
instance, the session doc depends on the security doc. These
relationships help you decide if multiple docs should be consulted for a
complex query.

\- \*\*Division of Labor:\*\* You handle overall reasoning, planning,
and final answer composition. Sub-agents focus on their specialty (e.g.
the \*\*db\*\* sub-agent answers questions about data models or queries,
the \*\*app\*\* sub-agent handles frontend or SSR questions, etc.). If a
sub-agent encounters a question outside its scope, it should signal you
and you should involve the correct domain expert ( \*\* sub-agent\*\*).

\- \*\*Accuracy and Security:\*\* All agents must ensure that answers
adhere to the project’s security and privacy policies (see
\*\*@~/security/AGENT.md\*\*). For example, if the user asks for code
that handles login, the session sub-agent should mention relevant
security steps (input validation, cookie flags, etc.) from the security
guidelines. You should audit and integrate these details into the final
answer (this is effectively an “AI-audit” step to verify no insecure or
incorrect info is given).

\- \*\*Maintainability:\*\* You and sub-agents should always rely on the
latest docs. If a user’s question seems to conflict with the documents
(outdated info), \*\*sub-agents\*\* should prefer the documentation
truth.

\- \*\*Tone and Detail:\*\* Sub-agents\*\* should provide clear, concise
explanations or code examples based on their docs when asked. You are
responsible for merging these into a coherent, human-friendly response.
Always prioritize information from the docs and use cross-references
(using the \`@~/...\` links) if pointing the user to another part of the
documentation is helpful.
