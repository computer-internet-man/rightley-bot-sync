export default function SyncPage() {
  return (
    <main>
      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: 16 }}>Sync Integrations</h1>
        <p style={{ marginBottom: 24, color: "#666" }}>
          Mock sync against 5 healthcare providers. Click any button to see realistic API response shapes.
        </p>
        <SyncClientWrapper />
      </div>
    </main>
  );
}

// Lazy load client component to avoid bundling in server tree
async function SyncClientWrapper() {
  const { default: SyncClient } = await import("./SyncClient");
  return <SyncClient />;
}
