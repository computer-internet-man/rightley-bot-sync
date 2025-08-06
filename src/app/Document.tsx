import React from 'react';

export const Document: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AI Concierge MVP</title>
      <link rel="modulepreload" href="/src/client.tsx" />
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body className="bg-gray-50 min-h-screen">
      <div id="root">{children}</div>
      <script>import("/src/client.tsx")</script>
    </body>
  </html>
);
