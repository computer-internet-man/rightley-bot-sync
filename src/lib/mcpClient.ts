// MCP (Model Context Protocol) JSON-RPC client for patient search integration
// Handles initialization handshake, session management, and protocol compliance

import type { Env } from '../worker';

// JSON-RPC types
type JsonRpcRequest = {
  id: string;
  jsonrpc: "2.0";
  method: string;
  params?: any;
};

type JsonRpcResponse<T = unknown> = {
  id: string;
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
};

// Patient data structure from MCP service
export interface McpPatient {
  id: string;
  name: string;
  dob: string;
  gender: string;
  contact: string;
  notes: string;
}

// MCP protocol state management
interface McpState {
  protocolVersion?: string;
  sessionId?: string;
  initialized: boolean;
  initializing?: Promise<void>;
}

// Module-level state (persists for worker isolate lifetime)
const state: McpState = { initialized: false };

/**
 * Creates headers for MCP requests with proper authentication and session management
 */
const makeHeaders = (env: Env): HeadersInit => {
  const headers: HeadersInit = {
    "Authorization": `Bearer ${env.MCP_KEY}`,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  
  if (state.protocolVersion) {
    headers["MCP-Protocol-Version"] = state.protocolVersion;
  }
  
  if (state.sessionId) {
    headers["MCP-Session-Id"] = state.sessionId;
  }
  
  return headers;
};

/**
 * Initialize MCP connection with proper handshake
 * This runs once per worker isolate and caches the session
 */
async function initialize(env: Env): Promise<void> {
  if (state.initialized) return;
  
  // If already initializing, wait for existing initialization
  if (state.initializing) return state.initializing;
  
  state.initializing = (async () => {
    try {
      const payload: JsonRpcRequest = {
        id: crypto.randomUUID(),
        jsonrpc: "2.0",
        method: "initialize"
      };
      
      const response = await fetch(env.MCP_SERVICE_URL, {
        method: "POST",
        headers: makeHeaders(env),
        body: JSON.stringify(payload),
      });
      
      // Extract protocol headers from response
      state.protocolVersion = response.headers.get("MCP-Protocol-Version") || undefined;
      state.sessionId = response.headers.get("MCP-Session-Id") || undefined;
      
      if (!response.ok) {
        throw new Error(`MCP initialize failed: ${response.status} ${response.statusText}`);
      }
      
      const body: JsonRpcResponse = await response.json();
      
      if (body.error) {
        throw new Error(`MCP initialize error: ${body.error.message}`);
      }
      
      state.initialized = true;
      console.log('[MCP] Initialized successfully', {
        protocolVersion: state.protocolVersion,
        hasSessionId: !!state.sessionId
      });
      
    } catch (error) {
      // Reset state on failure so next call can retry
      state.initializing = undefined;
      throw error;
    }
  })();
  
  return state.initializing;
}

/**
 * Search for patients using MCP service
 * @param query - Patient name to search for
 * @param env - Environment variables including MCP_KEY and MCP_SERVICE_URL
 * @returns Array of matching patients
 */
export async function searchMcpPatients(query: string, env: Env): Promise<McpPatient[]> {
  // Ensure MCP connection is initialized
  await initialize(env);
  
  // Parse the query to extract first and last names
  const nameParts = query.trim().split(' ');
  const firstname = nameParts[0] || query;
  const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstname;
  
  const request: JsonRpcRequest = {
    id: crypto.randomUUID(),
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "search_patients",
      arguments: {
        firstname: firstname,
        lastname: lastname,
        limit: 10
      }
    }
  };
  
  try {
    const response = await fetch(env.MCP_SERVICE_URL, {
      method: "POST",
      headers: makeHeaders(env),
      body: JSON.stringify(request),
    });
    
    // Update headers if they change mid-flight
    const newProtocolVersion = response.headers.get("MCP-Protocol-Version");
    const newSessionId = response.headers.get("MCP-Session-Id");
    
    if (newProtocolVersion) state.protocolVersion = newProtocolVersion;
    if (newSessionId) state.sessionId = newSessionId;
    
    if (!response.ok) {
      throw new Error(`MCP search failed: ${response.status} ${response.statusText}`);
    }
    
    const body: JsonRpcResponse<{ content: Array<{ type: string; text: string }>; isError: boolean }> = await response.json();
    
    if (body.error) {
      throw new Error(`MCP search error: ${body.error.message}`);
    }
    
    if (body.result?.isError) {
      throw new Error('MCP search returned an error result');
    }
    
    // Parse the JSON text content from the MCP response
    const textContent = body.result?.content?.[0]?.text;
    if (!textContent) {
      console.log(`[MCP] No content returned for query: "${query}"`);
      return [];
    }
    
    const parsedContent = JSON.parse(textContent);
    const patients = parsedContent.patients || [];
    
    console.log(`[MCP] Found ${patients.length} patients for query: "${query}"`);
    
    // Convert MCP patient format to our expected format
    return patients.map((patient: any): McpPatient => ({
      id: patient.patientId || patient.id || '',
      name: patient.name || '',
      dob: patient.dateOfBirth || patient.dob || '',
      gender: patient.sex || patient.gender || '',
      contact: patient.contactInfo?.homePhone || patient.contact || '',
      notes: patient.status || ''
    }));
    
  } catch (error) {
    console.error('[MCP] Search failed:', error);
    // Return empty array on failure to allow fallback to mock data
    return [];
  }
}

/**
 * Convert MCP patient data to our internal patient brief format
 */
export function convertMcpPatientToBrief(patient: McpPatient) {
  const now = new Date().toISOString();
  return {
    // Use string ID to avoid collisions with database IDs
    id: `mcp-${patient.id}`,
    patientId: patient.id,
    patientName: patient.name,
    dateOfBirth: patient.dob,
    gender: patient.gender,
    contactInfo: patient.contact,
    briefText: patient.notes || "Patient demographic information from MCP service",
    currentMedications: "",
    allergies: "",
    medicalHistory: "",
    doctorNotes: "",
    patientInquiry: "",
    doctorId: null,
    // What the UI expects - doctor object structure
    doctor: {
      id: "mcp-provider",
      email: "external@mcp",
      username: "mcp-provider",
      role: "external",
      createdAt: now,
    },
    createdAt: now,
    updatedAt: now,
    source: "mcp" as const
  };
}
