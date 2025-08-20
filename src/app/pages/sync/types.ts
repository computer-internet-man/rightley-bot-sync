export type Provider = "athena" | "freed" | "spruce" | "gmail" | "todoist";

// Athena FHIR Appointment
export type AthenaAppointment = {
  resourceType: "Appointment";
  id: string;
  status: "booked" | "cancelled" | "fulfilled" | "noshow";
  description: string;
  start: string;
  end: string;
  participant: Array<{
    actor: { reference: string; display: string };
    status: "accepted" | "declined" | "tentative";
  }>;
};

// Freed AI Scribe SOAP Note
export type FreedNote = {
  id: string;
  type: "soap";
  patient: { id: string; name: string };
  subjective: string;
  objective: string;
  assessment: Array<{ code: string; description: string }>;
  plan: string;
  createdAt: string;
};

// Spruce Contact/Webhook Event
export type SpruceEvent = {
  object: "event";
  type: "contact.created" | "conversation.created";
  data: {
    object: {
      object: "contact";
      id: string;
      displayName: string;
      phoneNumbers: Array<{
        label: string;
        value: string;
        displayValue: string;
      }>;
      created: string;
    };
  };
};

// Gmail Messages List Response
export type GmailMessages = {
  messages: Array<{ id: string; threadId: string }>;
  resultSizeEstimate: number;
  nextPageToken?: string;
};

// Todoist REST v1 Shapes
export type TodoistProject = {
  id: number;
  name: string;
  comment_count: number;
  order: number;
  url: string;
};

export type TodoistTask = {
  id: number;
  content: string;
  project_id: number;
  due: {
    date: string;
    timezone: string | null;
    is_recurring: boolean;
    string: string;
    lang: string;
  } | null;
};

export type SyncResult =
  | { provider: "athena"; appointment: AthenaAppointment }
  | { provider: "freed"; note: FreedNote }
  | { provider: "spruce"; event: SpruceEvent }
  | { provider: "gmail"; messages: GmailMessages }
  | { provider: "todoist"; project: TodoistProject; task: TodoistTask };
