import { useEffect, useRef, useState } from 'react';
import type { UserMembershipSummary } from '../auth/types';
import { assistantRequest } from '../assistants/api';
import type { AssistantVersion } from '../assistants/types';
import { ConversationApi } from './api';
import { logicalRequest, validateMessage } from './validation';
import type { Conversation, Message } from './types';
export function useConversation(membership: UserMembershipSummary, id: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [version, setVersion] = useState<AssistantVersion | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef<{ api: ConversationApi; signal: AbortSignal } | null>(null);
  const locked = useRef(false);
  const pending = useRef<{ content: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); const api = new ConversationApi(membership, controller.signal);
    active.current = { api, signal: controller.signal };
    async function load() {
      try {
        const [c, m] = await Promise.all([api.conversation(id), api.messages(id)]);
        const history = await assistantRequest(membership, controller.signal, 'versions', c.assistantId);
        if (controller.signal.aborted) return;
        setConversation(c); setMessages(m);
        if ('versions' in history) setVersion(history.versions.find(v => v.id === c.assistantVersionId) ?? null);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load conversation.'); }
    }
    void load(); return () => controller.abort();
  }, [membership, id, revision]);
  async function perform(operation: (api: ConversationApi) => Promise<void>) {
    const scope = active.current; if (!scope || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await operation(scope.api); } catch (e) { if (!scope.signal.aborted) setError(e instanceof Error ? e.message : 'Request failed. Retry safely.'); }
    finally { locked.current = false; if (!scope.signal.aborted) setBusy(false); }
  }
  async function send() {
    const issue = validateMessage(text); if (issue) { setError(issue); return; }
    await perform(async api => {
      const logical = logicalRequest(pending.current, text.trim()); pending.current = logical;
      const result = await api.turn(id, logical.content, logical.key);
      setMessages(previous => { const map = new Map(previous.map(m => [m.id, m])); map.set(result.userMessage.id, result.userMessage); map.set(result.assistantMessage.id, result.assistantMessage); return [...map.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber); });
      setText(''); pending.current = null;
    });
  }
  function retry() { setError(''); setConversation(null); setRevision(n => n + 1); }
  return {    
conversation, version, messages, text, setText, error, busy, send, retry, perform,
    changeStatus: (status: Conversation['status']) => perform(async api => setConversation(await api.status(id, status)))  
};
}
