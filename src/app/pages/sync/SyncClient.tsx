"use client";

import { useState } from "react";
import type { Provider, SyncResult } from "./types";

export default function SyncClient() {
  const [loading, setLoading] = useState<Provider | null>(null);
  const [result, setResult] = useState<Record<Provider, SyncResult | { error: string } | null>>({
    athena: null,
    freed: null,
    spruce: null,
    gmail: null,
    todoist: null
  });

  async function handleSync(provider: Provider) {
    console.log(`[SyncClient] Starting sync for ${provider}`);
    setLoading(provider);
    try {
      console.log(`[SyncClient] Fetching from /sync/api/${provider}`);
      const response = await fetch(`/sync/api/${provider}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const apiData = await response.json();
      console.log(`[SyncClient] API call succeeded for ${provider}:`, apiData);
      
      // Transform API data to match SyncResult format
      const data: SyncResult = { provider, ...apiData };
      setResult(prev => ({ ...prev, [provider]: data }));
    } catch (error) {
      console.error(`[SyncClient] Error syncing ${provider}:`, error);
      setResult(prev => ({ 
        ...prev, 
        [provider]: { error: (error as Error).message } 
      }));
    } finally {
      setLoading(null);
    }
  }

  const providers: Provider[] = ["athena", "freed", "spruce", "gmail", "todoist"];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => handleSync(provider)}
            disabled={loading !== null}
            style={{
              padding: "12px 24px",
              backgroundColor: loading === provider ? "#ccc" : "#007acc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading !== null ? "not-allowed" : "pointer",
              textTransform: "capitalize",
              minWidth: 100
            }}
          >
            {loading === provider ? "Syncing..." : provider}
          </button>
        ))}
      </div>

      <div>
        {providers.map((provider) => (
          <div key={provider} style={{ marginBottom: 24 }}>
            <h3 style={{ 
              textTransform: "capitalize", 
              marginBottom: 8,
              color: "#333"
            }}>
              {provider} Result
            </h3>
            <pre style={{
              background: "#f7f7f7",
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: 16,
              overflow: "auto",
              fontSize: 14,
              lineHeight: 1.4,
              maxHeight: 300
            }}>
              {result[provider] 
                ? JSON.stringify(result[provider], null, 2)
                : "Press the button above to sync mock data."}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
