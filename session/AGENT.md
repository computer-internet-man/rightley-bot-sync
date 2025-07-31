---

title: "Authentication & Sessions"

description: "Explains the project's passwordless authentication (via
WebAuthn passkeys) and session management, including the use of
Cloudflare Durable Objects for server-side session storage and the
session lifecycle (verification, user lookup, login/logout). No password
database to breach, phish-resistant login. "

version: "2025-07-28"

audience: sub-agent

deps: \[security, db\]

slug: session

---

\# Authentication & Sessions

\## Overview

User authentication in this project is passwordless and session-based,
leveraging \*\*WebAuthn passkeys\*\* for login and \*\*Cloudflare
Durable Objects\*\* for session storage. The RedwoodSDK starter comes
with authentication ‘baked in’– users register or log in using passkeys
(biometric or device authenticators) instead of passwords, and their
session state is maintained on the server side.

Session data is persisted in a single Durable Object instance per
session, and a secure cookie is used on the client to reference the
session. This design provides strong security (no passwords to steal,
and session state is centralized) and scalability across Cloudflare’s
edge.

RedwoodSDK’s server-side rendering ensures that user authentication
status is evaluated on every request (including the initial page load),
so the UI you send is always consistent with the user's login state.

\## Session Lifecycle

When a client makes a request, the system checks for an authentication
session as follows:

1\. \*\*Session Cookie Check:\*\* The browser sends a \`session_id\`
cookie. The server (in \`src/worker.tsx\` middleware) inspects this
cookie. If none is present, the user is treated as not logged in.

2\. \*\*Token Verification:\*\* If a session cookie is present, the
server verifies its signature to ensure it was issued by our app and not
tampered with. (The session ID is cryptographically signed using a
secret key, so any modification will be detected – see
@~/security/AGENT.md for how the key is managed).

3\. \*\*Session Fetch (Durable Object):\*\* If the cookie’s signature is
valid, the server loads session details from the Durable Object store.
The Durable Object (defined in \`src/session/durableObject.ts\`) holds
data like the user’s unique ID and any other session state. We use a
helper \`sessions.load(request)\` to retrieve this data (backed by the
Durable Object) and attach it to the request context as \`ctx.session\`.

4\. \*\*User Lookup:\*\* If the session data indicates an authenticated
user (e.g. it contains a \`userId\`), the server then loads the full
user profile from the database (via \`db.user.findUnique({ where: { id:
ctx.session.userId } })\`). The user record is fetched from D1 using
Prisma (see @~/prisma/AGENT.md for how the user model is defined) and
attached to \`ctx.user\` for use by subsequent route handlers or page
components.

5\. \*\*Authenticated Context:\*\* Downstream, application code can
check \`ctx.user\` to determine if the request is authenticated. For
example, protected routes will redirect to the login page if
\`ctx.user\` is not set. The presence of \`ctx.user\` indicates a
verified login session.

If at any step the verification fails (e.g. cookie is invalid or session
not found), the session is considered not active. The middleware will
ensure any stale or invalid cookie is cleared
(\`sessions.remove(request, headers)\`) and typically redirect the user
to the login page.

Sessions are \*\*stateful\*\* and stored server-side in a \*\*Durable
Object\*\* for several reasons. Using a Durable Object means each
session’s data lives in one location (per session), eliminating the need
to sync session state across multiple instances or regions. It also
means when a session is active, it’s kept in memory for fast access, and
when a session is terminated (logout), it’s removed in one place. This
simplifies revocation and avoids issues with stale session data. In
effect, the Durable Object acts as an in-memory session store with
persistence and global uniqueness (Cloudflare ensures only one instance
of a given Durable Object is active at a time).

\## Authentication Flow (WebAuthn Passkeys)

The application uses \*\*passkeys (WebAuthn)\*\* for user
authentication, providing a phish-resistant and user-friendly login
experience. The flow for logging in or registering is as follows:

\### Registration: (Passkey Setup)

A new user chooses a username (or identifier). The client calls a server
function (a ‘server action’) to \`startPasskeyRegistration\`. The server
(in \`src/app/pages/user/functions.ts\`) generates a WebAuthn
\*\*registration challenge\*\* (via the \`@simplewebauthn/server\`
library) and temporarily saves it in the user’s session (Durable Object)
using \`sessions.save()\`. The challenge is sent back to the client. The
user’s authenticator (e.g. device or security key) uses this challenge
to create a public-private key pair, returning a signed \*\*registration
response\*\*. The client then calls \`finishPasskeyRegistration\`
(server function) with this response. The server verifies it (ensuring
the challenge matches and the signature is valid) and, if successful,
stores the new credential public key (and user ID) in the database for
future logins (see @~/prisma/AGENT.md for the user/credentials schema).
The session is now associated with the new user’s ID, and the user is
considered logged in.

\### Login: (Passkey Authentication)

The user initiates login (e.g. presses ‘Login with passkey’). The client
calls \`startPasskeyLogin\` (server action), which generates a WebAuthn
\*\*authentication challenge\*\* and saves it in the session (similar to
registration). The challenge is sent to the client, and the user’s
authenticator device signs it with their private key. The client then
calls \`finishPasskeyLogin\` with the signed result. The server verifies
the signature using the stored public key for that user. If verification
passes, the session is updated with the user’s ID, marking the session
as authenticated. From this point on, \`ctx.user\` will be populated on
each request as described above. If the login fails (e.g. signature
mismatch), the server will not attach a user, and an error state is
returned to the client (the UI can display "Login failed" accordingly).

This passkey-based approach means \*\*no passwords are ever stored\*\*
or transmitted, greatly reducing certain security risks. Users can use
platform authenticators (like Face ID, Touch ID, Windows Hello) or
security keys – these are tied to the domain (via WebAuthn) and cannot
be phished easily. For more on why passkeys enhance security, “see the
WebAuthn guide\[^1\] for more on why passkeys enhance security.”

Additionally, ‘\*\*Cloudflare Turnstile\[^2\]\*\*’ is integrated as an
optional step during registration (the starter includes Turnstile for
bot prevention). If enabled, the registration flow will require a
Turnstile challenge to be solved before allowing the creation of a new
account, preventing automated scripts from creating mass fake users.
This is handled on the frontend and verified on the server. Turnstile’s
response token can be verified via a server call if configured.

\## Session Management & Logout

Session data primarily consists of the user’s ID and any pending
WebAuthn challenges during auth flows. The \`session_id\` itself is a
secure random identifier (e.g., a UUIDv4) that maps to a specific
Durable Object instance for that session. The cookie sent to the client
contains only a session identifier (no sensitive data) and is HTTP-only.
It is signed with our \`AUTH_SECRET_KEY\` (HMAC) to prevent tampering.
The cookie’s lifespan and other flags (Secure, SameSite) are configured
to ensure it’s only sent over HTTPS and only used by our domain.

To \*\*log out\*\* a user, the server can simply remove their session
Durable Object entry and instruct the client to clear the session
cookie. In our code, calling \`sessions.remove(request, headers)\` will
delete the session data and set an expired cookie in the response
headers. The next request from that client will then be treated as
unauthenticated. Typically, a logout action will trigger a redirect to
the home or login page after clearing the session. Sessions are set to
expire after X days of inactivity by default (configured via the
cookie’s max-age), to balance security and user convenience. This can be
adjusted as needed.

Durable Objects ensure that session invalidation is immediate and global
– once removed, any other edge location will defer to the centralized
store (which no longer has the session) and treat the session as ended.
This makes logouts and credential revocations straightforward and
reliable.

\## Best Practices

For the \*\*Authentication & Sessions sub-agent\*\*, keep in mind the
following when making changes or additions:

\- \*\*Do not introduce passwords or insecure identifiers.\*\* The
system is designed around passkeys; if adding a different auth method
(e.g. email login), ensure proper hashing and never store plain
credentials.

\- \*\*Maintain session security.\*\* If adjusting cookie settings or
session duration, preserve the HTTP-only and Secure attributes. Any new
cookie-based info should be signed or encrypted as appropriate. The
\`AUTH_SECRET_KEY\` (see @~/security/AGENT.md) must remain secret; use
Cloudflare Secrets for production and never commit it to the repo.

\- \*\*Use the provided helpers.\*\* Leverage \`sessions.save()\`,
\`sessions.load()\`, and \`sessions.remove()\` rather than manipulating
Durable Object storage directly. These abstractions handle the
underlying details and make future changes (like moving session store or
changing format) easier.

\- \*\*Check \`ctx.user\` for protected actions.\*\* When writing new
functions or routes that require authentication, include a guard to
verify \`ctx.user\` is present (as shown in the \`/protected\` route
example). If not, respond with a redirect or error. This ensures that
server-side functions and pages don’t inadvertently allow anonymous
access to restricted data.

\- \*\*Monitor Durable Object usage.\*\* Each active session corresponds
to an instance in the Cloudflare network. While DOs scale well, you
should ensure cleanup (e.g. \`sessions.remove\`) is called on logout to
avoid orphaned sessions. Also be mindful of the default DO storage
limits (if storing more data in sessions in the future).

By following these guidelines, the authentication system will remain
secure, scalable, and user-friendly. It provides a robust foundation
(modern passkey auth + durable sessions) that should rarely need
low-level changes – instead, focus on using these components to build
features like role-based access control or multi-factor auth if
required, in line with the established patterns.

\[^1\]: https://webauthn.guide/

\[^2\]:
https://www.cloudflare.com/application-services/products/turnstile/
