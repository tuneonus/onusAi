import type { Assistant } from '../assistants/types';
import type { BusinessLocation } from '../locations/types';
export function validateMessage(content: string): string | null {
  return !content.trim() || content.trim().length > 4000 ? 'Enter a message containing 1–4000 characters.' : null;
}
export function canStart(assistant: Assistant | undefined, locationId: string | null, locations: readonly BusinessLocation[]): boolean {
  return Boolean(assistant?.publishedVersion && (!assistant.locationId || assistant.locationId === locationId)
    && (!locationId || locations.some(l => l.id === locationId && !l.archivedAt)));
}
// Retain a key for retries of the same logical payload; changed text is a new request.
export function logicalRequest(previous: { content: string; key: string } | null, content: string) {
  return previous?.content === content ? previous : { content, key: crypto.randomUUID() };
}
