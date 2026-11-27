export const EDITOR_TABS = ['General', 'Behavior', 'Messages', 'AI Settings', 'Knowledge', 'Tools', 'Versions'] as const;
export type EditorTab = typeof EDITOR_TABS[number];
export function validationTarget(error: string): { tab: EditorTab; id: string } {
  if (error.startsWith('systemInstructions')) return { tab: 'Behavior', id: 'assistant-instructions' };
  if (error.startsWith('welcomeMessage')) return { tab: 'Messages', id: 'assistant-welcome' };
  if (error.startsWith('fallbackMessage')) return { tab: 'Messages', id: 'assistant-fallback' };
  if (error.startsWith('Temperature')) return { tab: 'AI Settings', id: 'assistant-temperature' };
  if (error.startsWith('Output tokens')) return { tab: 'AI Settings', id: 'assistant-maxOutputTokens' };
  if (error.startsWith('Context messages')) return { tab: 'AI Settings', id: 'assistant-maxContextMessages' };
  if (error.includes('tools')) return { tab: 'Tools', id: 'assistant-tools' };
  if (/location|knowledge/i.test(error)) return { tab: 'Knowledge', id: 'assistant-knowledge-location' };
  if (error.startsWith('Description')) return { tab: 'General', id: 'assistant-description' };
  if (error.includes('language')) return { tab: 'General', id: 'assistant-language' };
  if (error.includes('tone')) return { tab: 'Behavior', id: 'assistant-tone' };
  return { tab: 'General', id: 'assistant-name' };
}
