export const ASSISTANT_TONES = [
  'professional',
  'friendly',
  'concise',
  'empathetic',
  'formal',
] as const;

export type AssistantTone = (typeof ASSISTANT_TONES)[number];

export const KNOWLEDGE_SCOPES = ['public', 'staff_only'] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const KNOWLEDGE_LOCATION_SCOPES = [
  'business_wide',
  'assigned_location',
  'selected_locations',
] as const;
export type KnowledgeLocationScope = (typeof KNOWLEDGE_LOCATION_SCOPES)[number];

export const ASSISTANT_VERSION_STATUSES = ['draft', 'published', 'superseded'] as const;
export type AssistantVersionStatus = (typeof ASSISTANT_VERSION_STATUSES)[number];

export interface ApprovedToolDefinition {
  readonly id: 'lookup_availability' | 'request_lead_capture' | 'request_appointment_booking' | 'request_human_handoff';
  readonly description: string;
  readonly defaultAllowed: false;
}

export const APPROVED_TOOL_REGISTRY: readonly ApprovedToolDefinition[] = [
  {
    id: 'lookup_availability',
    description: 'Read-only lookup of configured appointment slot availability.',
    defaultAllowed: false,
  },
  {
    id: 'request_lead_capture',
    description: 'Propose consented capture of visitor contact details and intent.',
    defaultAllowed: false,
  },
  {
    id: 'request_appointment_booking',
    description: 'Propose a pending appointment booking request requiring approval.',
    defaultAllowed: false,
  },
  {
    id: 'request_human_handoff',
    description: 'Escalate a visitor conversation to an authenticated human operator.',
    defaultAllowed: false,
  },
] as const;

export type ApprovedToolId = (typeof APPROVED_TOOL_REGISTRY)[number]['id'];

export const APPROVED_TOOL_IDS = new Set<string>(APPROVED_TOOL_REGISTRY.map((tool) => tool.id));

export const MODEL_SETTINGS_LIMITS = {
  temperatureMin: 0,
  temperatureMax: 1,
  maxOutputTokensMin: 64,
  maxOutputTokensMax: 2048,
  maxContextMessagesMin: 1,
  maxContextMessagesMax: 20,
} as const;

export interface AssistantModelSettings {
  temperature: number;
  maxOutputTokens: number;
  maxContextMessages: number;
}

export const DEFAULT_MODEL_SETTINGS: AssistantModelSettings = {
  temperature: 0.2,
  maxOutputTokens: 512,
  maxContextMessages: 10,
};

export interface Assistant {
  id: string;
  businessId: string;
  locationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantVersion {
  id: string;
  assistantId: string;
  businessId: string;
  versionNumber: number;
  status: AssistantVersionStatus;
  displayName: string;
  description: string | null;
  welcomeMessage: string;
  systemInstructions: string;
  language: string;
  tone: AssistantTone;
  fallbackMessage: string;
  modelSettings: AssistantModelSettings;
  allowedTools: ApprovedToolId[];
  allowedKnowledgeScopes: KnowledgeScope[];
  knowledgeLocationScope: KnowledgeLocationScope;
  knowledgeLocationIds: string[];
  createdByUserId: string | null;
  publishedByUserId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantWithVersions {
  assistant: Assistant;
  publishedVersion: AssistantVersion | null;
  draftVersion: AssistantVersion | null;
}

/**
 * Visitor-safe projection of a published assistant version.
 * Private configuration such as systemInstructions, modelSettings, tool scopes,
 * and knowledge visibility settings must never appear on public endpoints.
 */
export interface PublicAssistantProfile {
  assistantId: string;
  businessId: string;
  locationId: string | null;
  versionNumber: number;
  displayName: string;
  description: string | null;
  welcomeMessage: string;
  language: string;
  tone: AssistantTone;
}

export interface AssistantConfigFields {
  displayName: string;
  description: string | null;
  welcomeMessage: string;
  systemInstructions: string;
  language: string;
  tone: AssistantTone;
  fallbackMessage: string;
  modelSettings: AssistantModelSettings;
  allowedTools: ApprovedToolId[];
  allowedKnowledgeScopes: KnowledgeScope[];
  knowledgeLocationScope: KnowledgeLocationScope;
  knowledgeLocationIds: string[];
}

export interface CreateAssistantInput extends AssistantConfigFields {
  locationId: string | null;
}

export type DraftVersionOverrides = Partial<AssistantConfigFields>;

