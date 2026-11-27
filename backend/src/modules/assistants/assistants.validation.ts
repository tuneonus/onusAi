import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  APPROVED_TOOL_IDS,
  ASSISTANT_TONES,
  DEFAULT_MODEL_SETTINGS,
  KNOWLEDGE_LOCATION_SCOPES,
  KNOWLEDGE_SCOPES,
  MODEL_SETTINGS_LIMITS,
  type ApprovedToolId,
  type AssistantConfigFields,
  type AssistantModelSettings,
  type AssistantTone,
  type CreateAssistantInput,
  type DraftVersionOverrides,
  type KnowledgeLocationScope,
  type KnowledgeScope,
} from './assistants.types.js';

const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const CREATE_ASSISTANT_FIELDS = new Set([
  'locationId',
  'displayName',
  'description',
  'welcomeMessage',
  'systemInstructions',
  'language',
  'tone',
  'fallbackMessage',
  'modelSettings',
  'allowedTools',
  'allowedKnowledgeScopes',
  'knowledgeLocationScope',
  'knowledgeLocationIds',
]);

const VERSION_CONFIG_FIELDS = new Set([
  'displayName',
  'description',
  'welcomeMessage',
  'systemInstructions',
  'language',
  'tone',
  'fallbackMessage',
  'modelSettings',
  'allowedTools',
  'allowedKnowledgeScopes',
  'knowledgeLocationScope',
  'knowledgeLocationIds',
]);

const MODEL_SETTINGS_FIELDS = new Set([
  'temperature',
  'maxOutputTokens',
  'maxContextMessages',
]);

function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  message: string,
): string[] {
  const keys = Object.keys(record);

  if (keys.some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return keys;
}

function validateRequiredText(
  value: unknown,
  fieldName: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be between ${minLength} and ${maxLength} characters.`,
    );
  }

  return trimmed;
}

function validateNullableText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return validateRequiredText(value, fieldName, 1, maxLength);
}

function validateLanguage(value: unknown): string {
  const trimmed = validateRequiredText(value, 'language', 2, 35);

  if (!LANGUAGE_PATTERN.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'language must be a valid BCP-47 language tag.');
  }

  return trimmed;
}

function validateTone(value: unknown): AssistantTone {
  if (typeof value !== 'string' || !ASSISTANT_TONES.includes(value as AssistantTone)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `tone must be one of: ${ASSISTANT_TONES.join(', ')}.`,
    );
  }

  return value as AssistantTone;
}

export function validateModelSettings(value: unknown): AssistantModelSettings {
  const record = assertPlainObject(value, 'modelSettings must be a JSON object.');
  assertAllowedKeys(record, MODEL_SETTINGS_FIELDS, 'modelSettings contains unsupported fields.');

  const temperature = record.temperature ?? DEFAULT_MODEL_SETTINGS.temperature;
  const maxOutputTokens = record.maxOutputTokens ?? DEFAULT_MODEL_SETTINGS.maxOutputTokens;
  const maxContextMessages = record.maxContextMessages ?? DEFAULT_MODEL_SETTINGS.maxContextMessages;

  if (
    typeof temperature !== 'number' ||
    !Number.isFinite(temperature) ||
    temperature < MODEL_SETTINGS_LIMITS.temperatureMin ||
    temperature > MODEL_SETTINGS_LIMITS.temperatureMax
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `modelSettings.temperature must be between ${MODEL_SETTINGS_LIMITS.temperatureMin} and ${MODEL_SETTINGS_LIMITS.temperatureMax}.`,
    );
  }

  if (
    typeof maxOutputTokens !== 'number' ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < MODEL_SETTINGS_LIMITS.maxOutputTokensMin ||
    maxOutputTokens > MODEL_SETTINGS_LIMITS.maxOutputTokensMax
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `modelSettings.maxOutputTokens must be an integer between ${MODEL_SETTINGS_LIMITS.maxOutputTokensMin} and ${MODEL_SETTINGS_LIMITS.maxOutputTokensMax}.`,
    );
  }

  if (
    typeof maxContextMessages !== 'number' ||
    !Number.isInteger(maxContextMessages) ||
    maxContextMessages < MODEL_SETTINGS_LIMITS.maxContextMessagesMin ||
    maxContextMessages > MODEL_SETTINGS_LIMITS.maxContextMessagesMax
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `modelSettings.maxContextMessages must be an integer between ${MODEL_SETTINGS_LIMITS.maxContextMessagesMin} and ${MODEL_SETTINGS_LIMITS.maxContextMessagesMax}.`,
    );
  }

  return {
    temperature,
    maxOutputTokens,
    maxContextMessages,
  };
}

export function validateAllowedTools(value: unknown): ApprovedToolId[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'allowedTools must be an array.');
  }

  const seen = new Set<ApprovedToolId>();

  for (const entry of value) {
    if (typeof entry !== 'string' || !APPROVED_TOOL_IDS.has(entry)) {
      throw new HttpError(
        400,
        'UNAPPROVED_TOOL_SCOPE',
        'allowedTools contains an unapproved or invalid tool identifier.',
      );
    }

    seen.add(entry as ApprovedToolId);
  }

  return [...seen];
}

export function validateAllowedKnowledgeScopes(value: unknown): KnowledgeScope[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'allowedKnowledgeScopes must be an array.');
  }

  const seen = new Set<KnowledgeScope>();

  for (const entry of value) {
    if (typeof entry !== 'string' || !KNOWLEDGE_SCOPES.includes(entry as KnowledgeScope)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `allowedKnowledgeScopes values must be one of: ${KNOWLEDGE_SCOPES.join(', ')}.`,
      );
    }

    seen.add(entry as KnowledgeScope);
  }

  return [...seen];
}

export function validateKnowledgeLocationScope(value: unknown): KnowledgeLocationScope {
  if (
    typeof value !== 'string' ||
    !KNOWLEDGE_LOCATION_SCOPES.includes(value as KnowledgeLocationScope)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `knowledgeLocationScope must be one of: ${KNOWLEDGE_LOCATION_SCOPES.join(', ')}.`,
    );
  }

  return value as KnowledgeLocationScope;
}

export function validateKnowledgeLocationIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'knowledgeLocationIds must be an array.');
  }

  const seen = new Set<string>();

  for (const entry of value) {
    seen.add(validateUuid(entry, 'knowledgeLocationIds entry'));
  }

  return [...seen];
}

export function assertKnowledgeScopeConsistency(params: {
  assistantLocationId: string | null;
  knowledgeLocationScope: KnowledgeLocationScope;
  knowledgeLocationIds: readonly string[];
}): void {
  if (
    params.knowledgeLocationScope === 'assigned_location' &&
    params.assistantLocationId === null
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'assigned_location knowledge scope requires a location-scoped assistant.',
    );
  }

  if (
    params.knowledgeLocationScope === 'selected_locations' &&
    params.knowledgeLocationIds.length === 0
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'selected_locations knowledge scope requires at least one location ID.',
    );
  }

  if (
    params.knowledgeLocationScope !== 'selected_locations' &&
    params.knowledgeLocationIds.length > 0
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'knowledgeLocationIds may only be provided when knowledgeLocationScope is selected_locations.',
    );
  }
}

export function validateCreateAssistantInput(body: unknown): CreateAssistantInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, CREATE_ASSISTANT_FIELDS, 'Request body contains unsupported fields.');

  const locationId =
    record.locationId === undefined || record.locationId === null
      ? null
      : validateUuid(record.locationId, 'locationId');

  const knowledgeLocationScope =
    record.knowledgeLocationScope === undefined
      ? locationId
        ? 'assigned_location'
        : 'business_wide'
      : validateKnowledgeLocationScope(record.knowledgeLocationScope);

  const knowledgeLocationIds =
    record.knowledgeLocationIds === undefined
      ? []
      : validateKnowledgeLocationIds(record.knowledgeLocationIds);

  assertKnowledgeScopeConsistency({
    assistantLocationId: locationId,
    knowledgeLocationScope,
    knowledgeLocationIds,
  });

  return {
    locationId,
    displayName: validateRequiredText(record.displayName, 'displayName', 1, 120),
    description: validateNullableText(record.description, 'description', 1000),
    welcomeMessage: validateRequiredText(record.welcomeMessage, 'welcomeMessage', 1, 1000),
    systemInstructions: validateRequiredText(
      record.systemInstructions,
      'systemInstructions',
      1,
      8000,
    ),
    language: record.language === undefined ? 'en' : validateLanguage(record.language),
    tone: record.tone === undefined ? 'professional' : validateTone(record.tone),
    fallbackMessage: validateRequiredText(record.fallbackMessage, 'fallbackMessage', 1, 1000),
    modelSettings:
      record.modelSettings === undefined
        ? { ...DEFAULT_MODEL_SETTINGS }
        : validateModelSettings(record.modelSettings),
    allowedTools:
      record.allowedTools === undefined ? [] : validateAllowedTools(record.allowedTools),
    allowedKnowledgeScopes:
      record.allowedKnowledgeScopes === undefined
        ? ['public']
        : validateAllowedKnowledgeScopes(record.allowedKnowledgeScopes),
    knowledgeLocationScope,
    knowledgeLocationIds,
  };
}

function parseDraftOverrides(
  record: Record<string, unknown>,
  requireNonEmpty: boolean,
): DraftVersionOverrides {
  const keys = assertAllowedKeys(
    record,
    VERSION_CONFIG_FIELDS,
    'Request body contains unsupported fields.',
  );

  if (requireNonEmpty && keys.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one assistant field must be provided.');
  }

  const overrides: DraftVersionOverrides = {};

  if ('displayName' in record) {
    overrides.displayName = validateRequiredText(record.displayName, 'displayName', 1, 120);
  }
  if ('description' in record) {
    overrides.description = validateNullableText(record.description, 'description', 1000);
  }
  if ('welcomeMessage' in record) {
    overrides.welcomeMessage = validateRequiredText(
      record.welcomeMessage,
      'welcomeMessage',
      1,
      1000,
    );
  }
  if ('systemInstructions' in record) {
    overrides.systemInstructions = validateRequiredText(
      record.systemInstructions,
      'systemInstructions',
      1,
      8000,
    );
  }
  if ('language' in record) {
    overrides.language = validateLanguage(record.language);
  }
  if ('tone' in record) {
    overrides.tone = validateTone(record.tone);
  }
  if ('fallbackMessage' in record) {
    overrides.fallbackMessage = validateRequiredText(
      record.fallbackMessage,
      'fallbackMessage',
      1,
      1000,
    );
  }
  if ('modelSettings' in record) {
    overrides.modelSettings = validateModelSettings(record.modelSettings);
  }
  if ('allowedTools' in record) {
    overrides.allowedTools = validateAllowedTools(record.allowedTools);
  }
  if ('allowedKnowledgeScopes' in record) {
    overrides.allowedKnowledgeScopes = validateAllowedKnowledgeScopes(
      record.allowedKnowledgeScopes,
    );
  }
  if ('knowledgeLocationScope' in record) {
    overrides.knowledgeLocationScope = validateKnowledgeLocationScope(
      record.knowledgeLocationScope,
    );
  }
  if ('knowledgeLocationIds' in record) {
    overrides.knowledgeLocationIds = validateKnowledgeLocationIds(record.knowledgeLocationIds);
  }

  return overrides;
}

export function validateCreateDraftVersionInput(body: unknown): DraftVersionOverrides {
  if (body === undefined) {
    return {};
  }

  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  return parseDraftOverrides(record, false);
}

export function validateUpdateDraftVersionInput(body: unknown): DraftVersionOverrides {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  return parseDraftOverrides(record, true);
}

export function mergeVersionConfig(
  base: AssistantConfigFields,
  overrides: DraftVersionOverrides,
  assistantLocationId: string | null,
): AssistantConfigFields {
  const knowledgeLocationScope =
    overrides.knowledgeLocationScope ?? base.knowledgeLocationScope;
  let knowledgeLocationIds =
    overrides.knowledgeLocationIds ?? base.knowledgeLocationIds;

  // Clearing selected locations automatically when switching away unless explicitly provided.
  if (
    overrides.knowledgeLocationScope !== undefined &&
    overrides.knowledgeLocationScope !== 'selected_locations' &&
    overrides.knowledgeLocationIds === undefined
  ) {
    knowledgeLocationIds = [];
  }

  assertKnowledgeScopeConsistency({
    assistantLocationId,
    knowledgeLocationScope,
    knowledgeLocationIds,
  });

  return {
    displayName: overrides.displayName ?? base.displayName,
    description: overrides.description !== undefined ? overrides.description : base.description,
    welcomeMessage: overrides.welcomeMessage ?? base.welcomeMessage,
    systemInstructions: overrides.systemInstructions ?? base.systemInstructions,
    language: overrides.language ?? base.language,
    tone: overrides.tone ?? base.tone,
    fallbackMessage: overrides.fallbackMessage ?? base.fallbackMessage,
    modelSettings: overrides.modelSettings ?? base.modelSettings,
    allowedTools: overrides.allowedTools ?? base.allowedTools,
    allowedKnowledgeScopes: overrides.allowedKnowledgeScopes ?? base.allowedKnowledgeScopes,
    knowledgeLocationScope,
    knowledgeLocationIds,
  };
}

export function validatePublishInput(body: unknown): void {
  if (body === undefined) {
    return;
  }

  const record = assertPlainObject(body, 'Request body must be an empty JSON object.');

  if (Object.keys(record).length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Publish request body must not contain fields.');
  }
}

