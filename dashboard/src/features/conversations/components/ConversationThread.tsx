import { ActionMenu } from '../../../components/ui/ActionMenu';
import { Icon } from '../../../components/ui/Icons';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { SelectField } from '../../../components/ui/SelectField';
import { Spinner } from '../../../components/ui/Spinner';
import { TextareaField } from '../../../components/ui/TextareaField';
import type { UserMembershipSummary } from '../../auth/types';
import { STATUSES, type ConversationStatus } from '../types';
import { useConversation } from '../useConversation';
export function ConversationThread({ membership, id, onRemoved }: { membership: UserMembershipSummary; id: string; onRemoved: (id: string, purged: boolean) => void }) {
  const thread = useConversation(membership, id);
  const [destructive, setDestructive] = useState<'delete' | 'purge' | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const history = end.current?.parentElement; if (history) history.scrollTop = history.scrollHeight; }, [thread.messages.length]);
  const c = thread.conversation;
  return <Card className="conversation-thread">
    {thread.error && <CardBody><Alert tone="danger" title="Conversation request failed">{thread.error}{!c && <Button onClick={thread.retry}>Retry history</Button>}</Alert></CardBody>}
    {!c ? !thread.error && <CardBody><Spinner label="Loading conversation" /></CardBody> : <>
      <CardHeader title={thread.version?.displayName ?? 'Conversation'} subtitle={thread.version ? `Assistant v${thread.version.versionNumber} · ${c.channel}` : `Bound version ${c.assistantVersionId} · ${c.channel}`} actions={<><Badge tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status.replaceAll('_', ' ')}</Badge>{membership.role === 'owner' && <ActionMenu disabled={thread.busy} items={[{label:'Delete',onSelect:()=>setDestructive('delete')},{label:'Purge permanently',danger:true,onSelect:()=>setDestructive('purge')}]} />}</>} />
      <CardBody className="conversation-controls">
        <SelectField id="conversation-status" label="Conversation status" disabled={thread.busy} value={c.status} onChange={e => void thread.changeStatus(e.target.value as ConversationStatus)}>{STATUSES.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</SelectField>

      </CardBody>
      <div className="conversation-messages" role="log" aria-label="Conversation messages" aria-live="polite">
        {!thread.messages.length && <div className="conversation-empty">No messages yet. Send a question to test this assistant.</div>}
        {thread.messages.map(m => <article key={m.id} className={`conversation-bubble conversation-bubble--${m.role}`}><header><strong>{m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role}</strong><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><p>{m.content}</p>{m.role === 'assistant' && <details className="conversation-metadata"><summary>Response details</summary><small>{['mode', 'model', 'grounded', 'inputTokens', 'outputTokens', 'totalTokens', 'latencyMs'].filter(k => m.metadata[k] !== undefined).map(k => `${k}: ${String(m.metadata[k])}`).join(' · ')}</small></details>}</article>)}
        {thread.busy && <p role="status" className="conversation-generating"><Spinner size="sm" />Working… waiting for the complete response.</p>}<div ref={end} />
      </div>
      <CardBody className="conversation-composer"><form onSubmit={e => { e.preventDefault(); void thread.send(); }}>
        <TextareaField id="playground-message" label="Message to assistant" rows={2} maxLength={4000} value={thread.text} disabled={thread.busy || c.channel !== 'playground' || c.status !== 'active'} onChange={e => thread.setText(e.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!thread.busy && thread.text.trim() && c.status === 'active' && c.channel === 'playground') void thread.send();
          }
        }} hint="Enter to send · Shift+Enter for a new line." />
        <Button type="submit" loading={thread.busy} disabled={!thread.text.trim() || c.status !== 'active' || c.channel !== 'playground'} aria-label="Send message"><Icon name="send" size={18} /><span className="sr-only">Send message</span></Button>
        {c.status !== 'active' && <p>AI replies are paused. Set the status to active to continue testing.</p>}
      </form></CardBody>
    </>}
    <ConfirmDialog open={Boolean(destructive)} title={destructive === 'purge' ? 'Permanently purge conversation?' : 'Delete conversation?'} description={destructive === 'purge' ? 'This permanently removes this conversation and all its messages. This cannot be undone.' : 'This removes the conversation from active listings. Its stored records remain until purged.'} confirmLabel={destructive === 'purge' ? 'Purge permanently' : 'Delete conversation'} loading={thread.busy} errorMessage={thread.error} onCancel={() => setDestructive(null)} onConfirm={() => void thread.perform(async api => { await api.remove(id, destructive === 'purge'); onRemoved(id, destructive === 'purge'); })} />
  </Card>;
}
