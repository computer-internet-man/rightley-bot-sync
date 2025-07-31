---

title: "UI & Rendering (SSR/RSC)"

description: "Discusses the front-end structure and rendering process of
the application. Explains RedwoodSDK's server-side rendering of React
components and the use of React Server Components (RSC), including how
client components are marked for interactivity, the role of Suspense for
streaming content, and how pages are hydrated on the client side."

version: "2025-07-28"

audience: sub-agent

deps: \[routes, security\]

slug: app

---

\# UI & Rendering (SSR/RSC)

\## Overview

You are responsible for the front-end interface and rendering logic,
leveraging RedwoodSDK’s server-side rendering and React Server
Components. You will also create and maintain the React components and
pages that make up the user interface, following RedwoodSDK conventions.
You must understand how the application’s pages are rendered on the
Cloudflare edge, how interactive components are handled (including
hydration on the client), and how routing is configured. Your primary
responsibilities are to:

1\. Render the React UI on the server (SSR) and stream HTML to clients.

2\. Hydrate interactive components on the client side for UI
interactivity.

3\. Manage the routing configuration of the app (define routes, attach
middleware/guards).

4\. Ensure the application’s pages integrate with global middleware
(e.g. auth) and follow RedwoodSDK’s patterns.

5\. Respect RedwoodSDK’s runtime constraints (Cloudflare Workers
environment).

\## Server-Side Rendering with React

The web UI is built with \*\*React\*\*, and RedwoodSDK enables
\*\*Server-Side Rendering (SSR)\*\* using \*\*React Server Components
(RSC)\*\* by default. In practice, this means every React component is
rendered to HTML on the Cloudflare Worker before being sent to the
client. By default, all components in our app are treated as \*\*server
components\*\* – they execute on the server, can fetch data directly
(e.g. from the database or session), and output HTML that is streamed to
the browser. This yields fast initial load times and allows using secure
server-only logic within the UI. The client receives a stream of HTML,
resulting in very quick Time-to-Interactive since the bulk of rendering
work is done at the edge server.

Because we stream HTML, the app can progressively render content as data
is ready. RedwoodSDK’s SSR uses modern streaming techniques (via
Cloudflare Workers) so that users see content without waiting for the
entire page to be ready. If a component needs to wait for data (e.g. an
external API call), we can wrap its usage in React \`\<Suspense\>\`
boundaries to show a fallback loading state. The framework handles
chunking the stream and flushing updates to the client.

RedwoodSDK’s UI layer uses \*\*server-side rendering (SSR) \*\*built on
\*\*React Server Components (RSC)\*\* to deliver fast, interactive
pages. By default, React components execute on the server (often at the
edge) to fetch data and render HTML, which is then streamed to the
client. Any component that needs browser interactivity is explicitly
marked with "use client", ensuring only those parts load as client-side
JavaScript. RedwoodSDK leverages React 18’s \*\*Streaming SSR\*\* with
\*\*Suspense\*\* boundaries – this means the server can send partial
HTML with fallback content while awaiting async data, improving
Time-to-First-Byte. Once the HTML reaches the browser, RedwoodSDK’s
runtime \*\*hydrates\*\* the page by attaching event handlers and state
to the interactive components, so the app becomes fully interactive. In
summary, RedwoodSDK provides a server-first rendering pipeline with
selective client hydration for an efficient, modern React UI.

Notably, RedwoodSDK is designed for Cloudflare’s edge runtime – there
are no Node-specific APIs. The same code runs in development (using
Miniflare) and in production on Cloudflare’s network without changes.
This parity means what you see during dev is very close to real-world
behavior (e.g. caching, KV, etc. all behave as in production). The SSR
environment adheres to Cloudflare Worker constraints (e.g. no
traditional filesystem access, but KV/D1/DO are available).

\## Client Components and Interactivity

For interactivity in the browser, components can be marked as \*\*client
components\*\* using the \`use client\` directive at the top of their
file. A client component will be hydrated on the client-side, enabling
interactions like \`onClick\` handlers or local state. RedwoodSDK’s
bundler (Vite) will split out the necessary JavaScript for those
components and deliver it to the browser.

It’s important to understand that even client components are initially
rendered on the server as HTML (by default) for the first request.
RedwoodSDK will \*\*pre-render client components on the server\*\* on
initial load, then hydrate them on the client. This approach gives the
benefit of SSR (the user sees initial content quickly) but requires
caution if a client component does something that \*only\* makes sense
in a browser environment during its initial render. In those rare cases,
RedwoodSDK provides an escape hatch to disable SSR for specific
components (e.g. a special directive to skip server render). In rare
cases where a component should only run in the browser (e.g. it uses
browser-only APIs on first render), RedwoodSDK allows SSR to be turned
off for that route. This is done by adjusting the router configuration
(disabling SSR for that route or using a Document that doesn’t include
the server-rendered content), ensuring the component renders only on the
client. However, by default you can assume even interactive components
will render on the server without issues.

When adding new UI elements, decide whether they can be server
components or need to be client components:

\- Use server components for content that doesn’t require dynamic
interaction or uses data from our back end. Server components can
directly query the database or use \`ctx\` (context) to access things
like the current user.

\- Use client components for pieces of UI that maintain their own state
or need to respond instantly to user input (e.g. a form with client-side
validation, or a widget that uses browser-only APIs). Mark them with
\`"use client"\` and ensure any required data is passed in as props or
fetched via a server function.

\## Routing and Page Structure

This project does not use a file-system router as some frameworks do;
instead, routes are explicitly defined using RedwoodSDK’s router API
(\*\*\`rwsdk/router\`\*\*). In \*\*\`src/worker.tsx\`\*\*, we call
\`defineApp()\` with an array of routes and middleware. For example, the
starter includes routes like:

\`\`\`

export default defineApp(\[

// ...middleware...

render(Document, \[

route("/", Home),

route("/protected", \[authGuard, Home\]),

prefix("/user", userRoutes),

\]),

\]);

\`\`\`

See @~/src/routes/AGENT.md for routing patterns and nesting and see
@~/security/AGENT.md for the authentication mechanism.

In summary, you will ensure that our application’s React UI is
efficiently delivered via SSR and seamlessly hydrated for interactivity.
When extending the UI, remember to designate components as server or
client appropriately, use \<Suspense\> for async boundaries, and update
the route definitions (in worker.tsx) for new pages or protected
sections. By following these guidelines, you will remain performant and
well-integrated with the rest of the system.

**\## Document Component and HTML Shell**

In RedwoodSDK, the Document component serves as the HTML shell of your
application. It defines the overall HTML structure for every page
render, including:

- The \<html\> and \<head\> tags (with meta tags, title, etc.)

- A \<body\> wrapper for your page content

Unlike many frameworks that impose a fixed document template, RedwoodSDK
lets you fully control this HTML shell on a per-route basis. This is
similar to Next.js’s custom Document, but in RedwoodSDK you can even
tailor different Documents for different sections of your app.

When defining your app’s routes (e.g., in worker.tsx), you explicitly
use the Document component with RedwoodSDK’s router. For example, a
simple app might look like:

\`\`\`

export default defineApp(\[

render(Document, \[

route("/", HomePage),

// You can wrap route groups with guards or middleware:

authGuard(userRoutes), // requires login for all userRoutes

\]),

\]);

\`\`\`

In this configuration, render(Document, \[...routes\]) wraps all the
given routes with our Document component. The Document’s JSX will wrap
each page’s output, inserting the page content into the
Document’s {children} placeholder. In the starter
template, src/app/Document.tsx includes the basic HTML boilerplate and a
script to load the client bundle for hydration.

(In other words, Document is the top-level component defining the
HTML \<head\> and \<body\> for every page, where you can set
global \<meta\> tags, link styles or scripts, and include the
root \<div\> for your React content.)

**\### Authentication Guard Example**

In the snippet above, authGuard(userRoutes) demonstrates RedwoodSDK’s
support for route middleware. Here, userRoutes would be a collection of
routes for user-specific pages, and wrapping it
with authGuard(...) ensures those pages only render for authenticated
users, i.e., you will check the login state and redirect or block as
needed. This approach shows how you can attach middleware or guards to
route groups thanks to RedwoodSDK’s flexible, standards-based router.

**Customizing Documents**

Because you “render the HTML Document” directly, you have fine-grained
control. RedwoodSDK allows defining multiple Document components for
different use cases. For instance, you might have:

- A StaticDocument with no client-side script for purely static pages.

- An ApplicationDocument with standard hydration for interactive app
  pages.

- A RealtimeDocument that sets up live-update connections for certain
  routes.

You can then choose which Document to use on a per-route basis (e.g.,
serving marketing pages with a slim static Document, while your
logged-in app section uses the interactive Document with all necessary
scripts). This per-route Document capability is one of RedwoodSDK’s most
powerful features, giving you control over doctype, scripts, and
hydration strategy on each page.

For example, if a section of your site doesn’t need any client-side
JavaScript, you can omit the \<script\> import in that route’s Document,
delivering just server-rendered HTML for maximum performance (no
hydration needed). On the other hand, for dynamic pages you can include
RedwoodSDK’s client loader (by default, importing src/client.tsx) which
hydrates the React Server Component payload and makes the page
interactive. This selective approach ensures you only send the bytes you
truly need to the browser.
