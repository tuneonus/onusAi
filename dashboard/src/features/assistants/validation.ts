import { TONES, type AssistantConfig } from './types.ts';
export function validateConfig(config: AssistantConfig, locationId: string | null, activeLocations: readonly string[], tools: readonly string[]): string[] {
  const errors: string[] = [];
  for (const [key, max] of [['displayName', 120], ['systemInstructions', 8000], ['welcomeMessage', 1000], ['fallbackMessage', 1000]] as const) {
    if (!config[key]?.trim() || config[key].trim().length > max) errors.push(`${key} must contain 1–${max} characters.`);
  }
  if (config.description !== null && (!config.description.trim() || config.description.trim().length > 1000)) errors.push('Description must contain 1–1000 characters or be empty.');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(config.language) || config.language.length > 35) errors.push('Enter a language tag such as en or en-US.');
  if (!TONES.includes(config.tone)) errors.push('Select a supported tone.');
  const { temperature, maxOutputTokens, maxContextMessages } = config.modelSettings;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) errors.push('Temperature must be between 0 and 1.');
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 2048) errors.push('Output tokens must be an integer from 64 to 2048.');
  if (!Number.isInteger(maxContextMessages) || maxContextMessages < 1 || maxContextMessages > 20) errors.push('Context messages must be an integer from 1 to 20.');
  if (config.allowedTools.some(id => !tools.includes(id))) errors.push('Select only approved tools.');
  if (config.allowedKnowledgeScopes.some(scope => !['public', 'staff_only'].includes(scope))) errors.push('Unsupported knowledge visibility.');
  if (locationId && !activeLocations.includes(locationId)) errors.push('The assigned location must be active.');
  if (config.knowledgeLocationScope === 'assigned_location' && !locationId) errors.push('Assigned-location knowledge requires a location assistant.');
  if (config.knowledgeLocationScope === 'selected_locations') {
    if (!config.knowledgeLocationIds.length || config.knowledgeLocationIds.some(id => !activeLocations.includes(id))) errors.push('Select active locations from this business.');
  } else if (config.knowledgeLocationIds.length) errors.push('Location selections require selected-locations scope.');
  if (!['business_wide', 'assigned_location', 'selected_locations'].includes(config.knowledgeLocationScope)) errors.push('Select a supported location scope.');
  return errors;
}
