import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SelectField } from '../components/ui/SelectField';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../features/auth/useAuth';
import type { UserMembershipSummary } from '../features/auth/types';
import { useTenant } from '../features/businesses/useTenant';
import { assistantRequest } from '../features/assistants/api';
import type { Assistant } from '../features/assistants/types';
import { listBusinessLocations } from '../features/locations/api';
import type { BusinessLocation } from '../features/locations/types';
import { ConversationApi } from '../features/conversations/api';
import { ConversationThread } from '../features/conversations/components/ConversationThread';
import { canStart, logicalRequest } from '../features/conversations/validation';
import type { Conversation } from '../features/conversations/types';
import './ConversationsPage.css';
function Workspace({ membership }: { membership: UserMembershipSummary }) {
  const [params, setParams] = useSearchParams(); const selected = params.get('workspace') === membership.businessId ? params.get('conversation') : null;
  const [data, setData] = useState<{ items: Conversation[]; assistants: Assistant[]; locations: BusinessLocation[]; more: boolean } | null>(null);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [assistantId, setAssistantId] = useState(''); const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false); const locked = useRef(false);
  const request = useRef<{ content: string; key: string } | null>(null);
  const scope = useRef<{ api: ConversationApi; signal: AbortSignal } | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null); const [purging, setPurging] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); const api = new ConversationApi(membership, controller.signal); scope.current = { api, signal: controller.signal };
    Promise.all([api.list(), assistantRequest(membership, controller.signal, 'list'), listBusinessLocations(membership.businessId, true, controller.signal)]).then(([list, a, l]) => {
      if (controller.signal.aborted) return;
      if (l.businessId !== membership.businessId) throw new Error('Location response belongs to another workspace.');
      if ('assistants' in a) setData({ items: list.conversations, assistants: a.assistants, locations: l.locations, more: list.pagination.hasMore });
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [membership, revision]);
  function refresh() { setError(''); setData(null); setRevision(n => n + 1); }
  async function act(operation: (api: ConversationApi) => Promise<void>) {
    const current = scope.current; if (!current || locked.current) return; locked.current = true; setBusy(true); setError('');
    try { await operation(current.api); } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { locked.current = false; if (!current.signal.aborted) setBusy(false); }
  }
  const assistant = data?.assistants.find(a => a.id === assistantId);
  const resolvedLocation = assistant?.locationId ?? (locationId || null);
  return <div className="conversations-page"><header className="playground-heading"><div><h2>AI Playground</h2><p>Staff testing · {membership.businessName}</p></div><details><summary>About this playground</summary><p>This is not a public widget. RAG, grounded knowledge retrieval, automated tools, appointment booking and agents are unavailable.</p></details></header>
    {error && <Alert tone="danger" title="Unable to complete request">{error}<Button variant="secondary" onClick={refresh}>Refresh conversations</Button></Alert>}
    {deleted && membership.role === 'owner' && <Alert tone="info">Conversation deleted. <Button variant="secondary" onClick={() => setPurging(true)}>Purge deleted conversation</Button></Alert>}
    {!data ? !error && <Spinner label="Loading conversations" /> : <div className="conversations-workspace"><Card><CardHeader title="Conversations" actions={<Button variant="ghost" disabled={busy} onClick={refresh}>Refresh</Button>} /><CardBody className="conversations-sidebar">
      <SelectField id="playground-assistant" label="Published assistant" value={assistantId} onChange={e => { setAssistantId(e.target.value); setLocationId(''); }}><option value="">Select an assistant</option>{data.assistants.filter(a => a.publishedVersion && (!a.locationId || data.locations.some(l => l.id === a.locationId && !l.archivedAt))).map(a => <option key={a.id} value={a.id}>{a.publishedVersion?.displayName} · v{a.publishedVersion?.versionNumber}{a.locationId ? ` · ${data.locations.find(l => l.id === a.locationId)?.name}` : ' · Business'}</option>)}</SelectField>
      <SelectField id="playground-location" label="Location context" disabled={Boolean(assistant?.locationId)} value={resolvedLocation ?? ''} onChange={e => setLocationId(e.target.value)}><option value="">Entire business</option>{data.locations.filter(l => !l.archivedAt).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField>
      <Button disabled={busy || !canStart(assistant, resolvedLocation, data.locations)} onClick={() => void act(async api => { const logical = logicalRequest(request.current, JSON.stringify([assistantId, resolvedLocation])); request.current = logical; const c = await api.create(assistantId, resolvedLocation, logical.key); request.current = null; setParams({ conversation: c.id, workspace: membership.businessId }); refresh(); })}>New conversation</Button>
      {!data.assistants.some(a => a.publishedVersion) && <p>No published assistants available. An owner must publish an assistant first.</p>}
      {!data.items.length && <p>No conversations yet.</p>}
      <nav aria-label="Conversation list">{data.items.map(c => <button type="button" className="conversation-list-item" key={c.id} aria-pressed={selected === c.id} onClick={() => setParams({ conversation: c.id, workspace: membership.businessId })}><strong>{data.assistants.find(a => a.id === c.assistantId)?.publishedVersion?.displayName ?? 'Conversation'}</strong><span>{new Date(c.createdAt).toLocaleString()} · {c.channel}</span><Badge tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status.replaceAll('_', ' ')}</Badge></button>)}</nav>
      {data.more && <Button variant="secondary" disabled={busy} onClick={() => void act(async api => { const next = await api.list(data.items.length); setData({ ...data, items: [...data.items, ...next.conversations], more: next.pagination.hasMore }); })}>Load more conversations</Button>}
    </CardBody></Card>{selected ? <ConversationThread key={selected} membership={membership} id={selected} onRemoved={(id, purged) => { setParams({}); setDeleted(purged ? null : id); refresh(); }} /> : <Card><CardBody className="conversation-empty"><h2>Ready to test your assistant?</h2><p>Choose a published assistant and start a staff playground conversation, or select a saved conversation.</p></CardBody></Card>}</div>}
    <ConfirmDialog open={purging} title="Permanently purge deleted conversation?" description="All stored messages will be permanently removed. This cannot be undone." confirmLabel="Purge permanently" loading={busy} errorMessage={error} onCancel={() => setPurging(false)} onConfirm={() => void act(async api => { if (deleted) await api.remove(deleted, true); setDeleted(null); setPurging(false); })} />
  </div>;
}
export function ConversationsPage() {  
const { user } = useAuth(); const { activeMembership, activeBusinessId, isLoadingBusinesses } = useTenant();
  if (isLoadingBusinesses) return <Spinner label="Loading workspace" />;
  if (!user || !activeMembership || activeMembership.businessId !== activeBusinessId) return <Alert tone="info">Select a business workspace to view conversations.</Alert>;
  return <Workspace key={`${user.id}:${activeBusinessId}:${activeMembership.role}`} membership={activeMembership} />;
}
