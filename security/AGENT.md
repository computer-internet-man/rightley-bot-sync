---

title: "Security & Compliance"

description: "Details the application's security measures and compliance
practices. Covers default HTTP security headers (CSP, HSTS, etc.),
secure cookie usage for sessions, passkey (WebAuthn) authentication,
secret management via environment variables, and data residency/GDPR
considerations."

version: "2025-07-28 "

audience: sub-agent

deps: \[session, db, app, commands, routes\]

slug: security

---

\# Security & Compliance

\## Overview

This document outlines the app’s built-in security measures (HTTP
headers, secure cookies, WebAuthn-based auth) and compliance practices
(secret management data residency, GPDR considerations).It highlights
how RedwoodSDK on Cloudflare provides a secure-by-default foundation and
what to maintain when extending the app.

\## Default Security Measures

This project follows security best practices out-of-the-box, thanks to
RedwoodSDK’s standard setup. Several HTTP security headers are set on
every response via middleware in \*\*\`app/headers.ts\`\*\* (see
@~/src/routes/AGENT.md for how middleware is configured and how
header-setting functions integrate into the request pipeline).

\- \*\*Content Security Policy (CSP):\*\* By default, the CSP restricts
sources of content to only allow our own origin for most things. It
includes a unique nonce for scripts (generated per request) so that
inline scripts can safely run only if they include that nonce. For
example, the default CSP will allow scripts from \`'self'\` (our domain)
with the proper \`'nonce-\<value\>'\`, and also permits Cloudflare’s
challenge domain for Turnstile scripts. It disallows things like
\`eval()\` and object embeds by default. This helps prevent XSS attacks
by ensuring only trusted scripts execute.

\- \*\*Strict-Transport-Security (HSTS):\*\* In production, the app
sends \`Strict-Transport-Security: max-age=63072000; includeSubDomains;
preload\`. This forces browsers to use HTTPS for our domain and all
subdomains for the next two years, preventing protocol downgrade
attacks.

\- \*\*X-Content-Type-Options:\*\* Set to \`nosniff\`, instructing
browsers not to MIME-sniff files and to stick to declared content types.
This reduces the chance of certain injection attacks by not
misinterpreting content.

\- \*\*Referrer-Policy:\*\* Set to \`no-referrer’, meaning the browser
will not send the referrer header on requests. This protects potentially
sensitive URLs from being leaked.

\- \*\*Permissions-Policy:\*\* Configured to disable certain powerful
browser features by default (\`geolocation=(), microphone=(),
camera=()\` etc.). This means the app cannot use those features unless
explicitly allowed, reducing impact if the app were ever compromised.

\- \*\*Frame Options:\*\* (By using CSP’s \`frame-src 'none'\` or a
similar header) ensure the site cannot be iframed by others in a way
that enables clickjacking. In our CSP, \`object-src 'none'\` and
controlling \`frame-src\` to only Cloudflare’s challenge means we’re
limiting framing to trusted sources.

These headers collectively defend against common web vulnerabilities
(XSS, clickjacking, packet sniffing, etc.). The \*\*Security
sub-agent\*\* should preserve these and update as necessary if new
external resources are introduced (e.g., if you add analytics that
require allowing an external script, you'll need to update the CSP to
include that domain – see below).

Additionally, the application uses \*\*HTTP-only, Secure cookies\*\* for
session management. The session cookie cannot be accessed via
client-side JavaScript, which helps against XSS (even if an attacker
injected script, it can’t steal the cookie). The cookie is marked Secure
so it’s never sent over plaintext HTTP (see @~/session/AGENT.md for
description of session management or cookie-based sessions.)

Another built-in measure is the use of \*\*passkeys (WebAuthn)\*\* for
authentication instead of passwords (see @~/session/AGENT.md for the
full auth flow). This eliminates risks of password database leaks,
credential stuffing, etc. Each login is tied to a device-specific key
and the protocol involves origin-specific challenges, making phishing
and replay attacks far more difficult than traditional passwords.

\## Secret Management and Environment

Secrets and sensitive configuration (like the \`AUTH_SECRET_KEY\` for
signing cookies, or any API keys) are \*\*not stored in the
repository\*\*. RedwoodSDK encourages using environment variables and
Cloudflare’s secret storage:

\- During development, a \*\*\`.dev.vars\`\*\* file is used for secrets
(loaded by Miniflare). This file is listed in \*\*.gitignore\*\* so it
won’t be committed. For example, it might contain
\`AUTH_SECRET_KEY=\<development-secret\>\` among other keys.

\- In production, secrets are set using Cloudflare Wrangler commands
(e.g., \`npx wrangler secret put AUTH_SECRET_KEY\`) and are \*\*injected
into the Worker environment\*\* at deploy time (see @~/scripts/AGENT.md
for environmental variable setup and secret management). Our deployment
process automatically configures the Auth secret and any required
variables. The sub-agent should ensure any new secret (say, an API key
for a third-party service) is added via Wrangler and not hard-coded.

\- The \`AUTH_SECRET_KEY\` specifically should be a long, random string
in production. This key is used to sign session IDs (HMAC) so that the
server can detect if a cookie was forged or altered. Never expose this
key – if rotated, all existing sessions will become invalid (which is
sometimes desirable for force logout).

\- \*\*Turnstile keys:\*\* If Turnstile (Cloudflare’s CAPTCHA) is in
use, its secret key would also be stored as an env variable (likely
configured during deploy). Ensure any such keys are treated with the
same care.

All environment configuration for production is stored in
\*\*\`wrangler.jsonc\`\*\* and secure storage – \*\*no sensitive data is
in the codebase\*\*. This helps with compliance (e.g., secrets aren’t
leaked via source control) and follows the principle of least exposure.

\## Compliance and Data Handling

Running on Cloudflare’s infrastructure means a lot of security
compliance aspects (such as physical security, network security, DDoS
protection) are handled by Cloudflare. Cloudflare data centers are
certified on various compliance standards (SOC 2, ISO 27001, etc.),
which can help meet organizational compliance requirements.

Our application data is primarily in Cloudflare D1 (a hosted SQLite, see
@~/prisma/AGENT.md for the database schema, the use of Prisma ORM, and
how D1 is configured , e.g. via wrangler.jsonc bindings). When creating
the D1 database, one can choose a region (as was done with \`WEUR\` in
our example). If data residency or GDPR compliance is a concern, ensure
to choose a region appropriate for user data and disclose in a privacy
policy which region data is stored in. Cloudflare will keep the data in
that region (with replicas for redundancy). The Durable Objects for
sessions similarly have an id that includes a location hint (often
automatically chosen based on traffic); if needed, one can pin Durable
Objects to locations, but typically Cloudflare manages that.

\*\*Personal Data:\*\* In this starter app, the user data might include
an email or username (and their WebAuthn credentials). All such personal
data is stored in the D1 database and only accessed server-side. To
comply with privacy regulations, you should have processes to delete
user data on request – e.g., providing a way to remove a user’s account
which would delete their database records and Durable Object session
(see @~/session/AGENT.md about session data lifestyle and how sessions
can be invalidated or expire). Since we use Durable Objects for
sessions, simply deleting a user’s record in D1 does not automatically
log them out; consider invalidating any active session (e.g., by
removing their session Durable Object or adding a server check that user
status is still active). This is a design consideration for a production
app.

\*\*Audit Logging:\*\* This starter doesn’t include explicit audit
logging, but Cloudflare Workers logs (if enabled) would record requests.
If compliance requires, consider logging important security events (like
failed login attempts, challenge verifications, etc.) to an external
system or Cloudflare Logpush. But be mindful of not logging sensitive
data unnecessarily.

\## Maintaining and Updating Security

Security is not a one-time setup – as dependencies and requirements
change, so must the security posture:

\- \*\*Dependencies:\*\* Keep an eye on npm package updates (for
example, the WebAuthn library, RedwoodSDK updates, etc.). Security fixes
in those should be pulled in promptly. The sub-agent can use tools to
check for known vulnerabilities in packages.

\- \*\*CSP Adjustments:\*\* If new front-end features require loading
resources from other domains (e.g., a CDN for images or a third-party
script like analytics), update the CSP header in \`app/headers.ts\`
accordingly. Always strive to keep it as restrictive as possible – only
allow what’s needed. Document any changes clearly so that future
maintainers know why a certain domain was allowed.

\- \*\*Testing:\*\* Use tools like Cloudflare’s \*\*ZT1\*\* and other
scanners or browser devtools to verify that our security headers are
intact on responses. Also test that things like login flows are properly
protected (e.g., you cannot bypass auth by hitting an endpoint directly
without a valid session).

\- \*\*Secure Coding:\*\* When modifying server-side code, follow secure
coding practices. For instance, when using \`fetch\` to call external
APIs, validate inputs to that call to avoid SSRF vulnerabilities. When
serializing data to JSON, only include properties that should be public.
The sub-agents writing code (DB, functions, etc.) should always consider
the security implications described in their respective docs and in this
document.

\## Compliance Considerations

Depending on the deployment context, there may be compliance regimes to
consider:

\- \*\*GDPR (EU):\*\* If serving EU residents, ensure there’s a way to
handle data access/deletion requests. As mentioned, user data is in D1;
deleting a user would involve removing their rows. Durable Object data
for sessions is ephemeral (and not personally identifying beyond the
userId reference), and those expire when not used, but you could
explicitly delete a user’s DO if needed.

\- \*\*PCI DSS:\*\* This app doesn’t process payments, but if it did,
you’d have to ensure no card data touches the Worker without proper
encryption and compliance measures (likely out of scope for a Worker;
you’d use a tokenization service).

\- \*\*Accessibility & Other Policies:\*\* While not security,
compliance might also cover accessibility (WCAG) or performance budgets.
RedwoodSDK’s SSR helps with SEO and basic accessibility by delivering
content without requiring JS (see @~/src/app/AGENT.md for how
RedwoodSDK’s SSR system renders React on the edge.)

By using Cloudflare and RedwoodSDK, many low-level security issues are
handled (you don’t manage servers or OS updates, and the framework sets
sane defaults). The key is to maintain those defaults and be vigilant
when extending the app. Each sub-agent (UI, DB, Functions, etc.) should
incorporate security checks ( see @~/src/app/AGENT.md for UI/SSR
security ) relevant to its area (for example, the DB agent should ensure
queries are parameterized via Prisma to avoid injection – Prisma by
default does this, see @~/prisma/AGENT.md). As the Security sub-agent,
your role is to oversee these aspects, update this document when new
security measures or requirements arise, and assist other agents in
following best practices.

In summary, the application is \*\*secure-by-default\*\* with strong
headers, modern auth, and careful session handling. Compliance is eased
by Cloudflare’s robust platform and the lack of sensitive data exposure.
Continue to uphold these standards with any future changes.
