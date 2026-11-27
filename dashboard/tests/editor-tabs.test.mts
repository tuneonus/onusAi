import assert from 'node:assert/strict';
import test from 'node:test';
import { EDITOR_TABS, validationTarget } from '../src/features/assistants/editorTabs.ts';
test('assistant editor has seven ordered business-facing sections', () => {
  assert.deepEqual(EDITOR_TABS, ['General','Behavior','Messages','AI Settings','Knowledge','Tools','Versions']);
});
test('validation routes errors to the relevant section and focus target', () => {
  for (const [error,tab,id] of [
    ['displayName must contain 1–120 characters.','General','assistant-name'],
    ['systemInstructions must contain 1–8000 characters.','Behavior','assistant-instructions'],
    ['welcomeMessage must contain 1–1000 characters.','Messages','assistant-welcome'],
    ['fallbackMessage must contain 1–1000 characters.','Messages','assistant-fallback'],
    ['Temperature must be between 0 and 1.','AI Settings','assistant-temperature'],
    ['Select active locations from this business.','Knowledge','assistant-knowledge-location'],
    ['Select only approved tools.','Tools','assistant-tools'],
  ]) assert.deepEqual(validationTarget(error),{tab,id});
});
