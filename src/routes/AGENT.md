---

title: "URL Routing Patterns"

description: "Illustrates RedwoodSDK’s URL routing with examples of
static routes, parameterized routes (with path variables), and wildcard
routes. Explains route matching order (first match wins) and how dynamic
path segments and wildcards are captured in request parameters."

version: "2025-07-28"

audience: sub-agent

deps: \[security, db, app, session\]

slug: routes

---

\# URL Routing Patterns

\*\*RedwoodSDK\*\*’s router allows you to define routes in three primary
ways to match different URL patterns: \*\*static routes\*\*,
\*\*parameterized routes\*\*, and \*\*wildcard routes\*\*. Routes are
checked in the order they are defined, and the first match wins.

\## 1. Static Routes (Exact Matches)

These routes match a specific path exactly, with no variables. For
example:

\`\`\`javascript

route("/", handler) // matches exactly "/"

route("/about", handler) // matches exactly "/about"

\`\`\`

Use static routes for pages or endpoints that have a fixed URL. If the
incoming request path differs even slightly (e.g. \`/about/us\` vs
\`/about\`), a static route for \`/about\` will not match it.

\## 2. Parameterized Routes (Dynamic Segments)

These routes include variables in the path, indicated by a colon prefix
(\`:\`). They match a pattern and capture parts of the URL as
parameters. Examples:

\`\`\`javascript

route("/users/:id", handler) // matches "/users/123" or "/users/abc"

route("/users/:id/edit", handler) // matches "/users/123/edit"

route("/teams/:teamId/members/:member", handler)

// matches"/teams/42/members/jane"

\`\`\`

\* Sections starting with \`:\` are parameterized segments that match a
single segment.

\* Captured values are available in \`params\`, e.g. \`params.id\` or
\`params.teamId\`.

\* All \`params\` are strings; convert as needed (e.g.,
\`Number(params.id)\`).

\## 3. Wildcard Routes (Catch-All)

Wildcard routes use an asterisk (\`\*\`) to match “anything” in that
part of the URL, capturing an arbitrary number of segments. Examples:

\`\`\`javascript

route("/files/\*", handler) // matches "/files/anything..."

route("/files/\*/preview", handler) // matches
"/files/\<anything\>/preview"

route("/files/\*/download/\*", handler) // matches
"/files/\<anything\>/download/\<anything\>"

\`\`\`

\* Each \`\*\` captures into \`params.\$0\`, \`params.\$1\`, etc., in
order of appearance.

\* For \`route("/files/\*")\`:

\* \`/files/report.pdf\` → \`params.\$0 = "report.pdf"\`

\* \`/files/a/b/c.png\` → \`params.\$0 = "a/b/c.png"\`

\* For \`route("/files/\*/preview")\`:

\* \`/files/abc/preview\` → \`params.\$0 = "abc"\`

\* \`/files/a/b/c/preview\` → \`params.\$0 = "a/b/c"\`

\* For two wildcards (\`/files/\*/download/\*\`):

\* \`/files/photos/download/image.png\` → \`params.\$0 = "photos"\`,
\`params.\$1 = "image.png"\`

\> \*\*Important:\*\* Always define more specific routes before wildcard
routes to avoid unintended matches.

\### \*\*Summary:\*\*

\* \*\*Static\*\* for fixed URLs

\* \*\*Parameterized\*\* for single-segment variables (\`:param\`)

\* \*\*Wildcard\*\* for multi-segment catch-alls (\`\*\`)

Handlers receive a \`params\` object with captured values
(\`params.paramName\` or \`params.\$n\`). Choose the appropriate pattern
for your route’s requirements.

\## 4. Additional Recommendations for Routing Patterns

\### Handler Context

Route handlers receive a params object and have access to the full
request context (e.g. the request and ctx objects). You can utilize
context data inside any handler.

\### Authentication Guards (Protected Routes)

RedwoodSDK supports using an array of handler functions (called
interrupters) for each route, which allows inserting checks like
authentication before the main handler runs. For example, an
isAuthenticated interrupter can gate access to certain routes, ensuring
only logged-in users can reach them (see @~/security/AGENT.md for
details on protecting routes). Interrupters are essentially middleware
functions that run \*\*per-route\*\* to short-circuit requests – for
example, an auth check that returns a 401 response if the user isn’t
logged in.

\`\`\`

function isAuthenticated({ ctx }) {

if (!ctx.user) return new Response("Unauthorized", { status: 401 });

}

route("/admin/dashboard", \[isAuthenticated, dashboardHandler\]);

\`\`\`

\### Middleware & Context

Global middleware functions run before any route matching, allowing you
to populate the ctx (context) for each request. For instance, a session
middleware might populate ctx.session, and another middleware could load
user data from the database into ctx.user. (Refer to @~/session/AGENT.md
for details on setting up context and see @~/prisma/AGENT.md for working
with data in middleware.)

\### Routing Hierarchy (Nested Routes)

It’s possible to group related routes under a common URL prefix using
the \`prefix()\` function. For example, you can bundle all admin routes
under an /admin/\* base path in one module. This helps organize routes
logically.

\`\`\`

prefix("/admin", () =\> {

route("/users", usersHandler);

route("/settings", settingsHandler);

});

\`\`\`

\### React Server Components (RSC)

Route handlers aren’t limited to returning plain response objects – they
can return JSX/React components as well. RedwoodSDK will server-render
these components to HTML, stream them to the client, and hydrate them
for interactivity. In practice, this means you can build page responses
as React components on the server. (See @~/src/app/AGENT.md for details
on server-rendered UI in RedwoodSDK.)

\### Hydration and Documents

RedwoodSDK’s routing integrates with the framework’s Document system for
managing the HTML shell and hydration scripts. You can specify different
Document components for different route groups using the render()
function in \`defineApp\`. This determines the \<html\>/\<head\>
structure for those routes and ensures the appropriate client-side
hydration scripts are included. (For more information, see
@~/src/app/AGENT.md on customizing the HTML shell and hydration.)

\### Trailing Slash Handling

RedwoodSDK’s router normalizes trailing slashes in URLs. In practice,
/about and /about/ are treated equivalently, so no special configuration
is needed to handle trailing slashes.

\### Unmatched Routes (404s)

By default, if no route matches an incoming request, RedwoodSDK returns
a 404 Not Found. You can override this by defining a catch-all route
(e.g. \`route("\*", notFoundHandler)\`) as the last route to handle
unmatched requests.

\### Default Error Handling

By default, RedwoodSDK will return a generic 500 Internal Server Error
if a route handler throws an uncaught exception or fails to produce a
response. There isn’t a custom error page by default. If you want to
customize error responses, you can implement error-handling middleware
or use a utility (e.g., an \`ErrorResponse\` class) to catch exceptions
and generate an appropriate response.

\### Preloading and Code-Splitting

You may also consider performance optimizations.
