export const TONES = ['professional', 'friendly', 'concise', 'empathetic', 'formal'] as const;
export interface AssistantConfig {
  displayName: string; description: string | null; systemInstructions: string;
  language: string; tone: typeof TONES[number]; welcomeMessage: string; fallbackMessage: string;
  modelSettings: { temperature: number; maxOutputTokens: number; maxContextMessages: number };
  allowedTools: string[]; allowedKnowledgeScopes: ('public' | 'staff_only')[];
  knowledgeLocationScope: 'business_wide' | 'assigned_location' | 'selected_locations';
  knowledgeLocationIds: string[];
}
export interface AssistantVersion extends AssistantConfig {
  id: string; assistantId: string; businessId: string; versionNumber: number;
  status: 'draft' | 'published' | 'superseded'; publishedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface Assistant {
  id: string; businessId: string; locationId: string | null; scope: 'business' | 'location';
  draftVersion: AssistantVersion | null; publishedVersion: AssistantVersion | null;
}
export interface ApprovedTool { id: string; description: string; defaultAllowed: false }
export const emptyConfig = (): AssistantConfig => ({
  displayName: '', description: null, systemInstructions: '', language: 'en', tone: 'professional',
  welcomeMessage: '', fallbackMessage: '', modelSettings: { temperature: 0.2, maxOutputTokens: 512, maxContextMessages: 10 },
  allowedTools: [], allowedKnowledgeScopes: ['public'], knowledgeLocationScope: 'business_wide', knowledgeLocationIds: [],
});
export function configFromVersion(version: AssistantConfig): AssistantConfig {
  const { displayName, description, systemInstructions, language, tone, welcomeMessage, fallbackMessage,
    modelSettings, allowedTools, allowedKnowledgeScopes, knowledgeLocationScope, knowledgeLocationIds } = version;
  return { displayName, description, systemInstructions, language, tone, welcomeMessage, fallbackMessage,
    modelSettings, allowedTools, allowedKnowledgeScopes, knowledgeLocationScope, knowledgeLocationIds };
}
