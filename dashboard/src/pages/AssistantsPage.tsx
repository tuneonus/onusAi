import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useEffect, useState } from 'react';
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
import { AssistantForm } from '../features/assistants/components/AssistantForm';
import { assistantRequest } from '../features/assistants/api';
import { emptyConfig, type AssistantVersion } from '../features/assistants/types';
import { useAssistants } from '../features/assistants/useAssistants';
import './AssistantsPage.css';
function VersionHistory({ membership, assistantId }: { membership: UserMembershipSummary; assistantId: string }) {
  const [versions,setVersions] = useState<AssistantVersion[] | null>(null);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController();
    assistantRequest(membership,controller.signal,'versions',assistantId).then(r => { if (!controller.signal.aborted && 'versions' in r) setVersions(r.versions); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  },[membership,assistantId,retry]);
  return <Card><CardHeader title="Version history" subtitle="Published versions are immutable. New drafts preserve the current published configuration." /><CardBody>
    {error ? <Alert tone="danger">{error}<Button onClick={() => {setError('');setRetry(n=>n+1);}}>Retry history</Button></Alert> : !versions ? <Spinner label="Loading versions" /> : <ul className="assistants-history">{versions.map(v => <li key={v.id}><strong>v{v.versionNumber} · {v.displayName}</strong><Badge tone={v.status === 'published' ? 'success' : 'neutral'}>{v.status}</Badge><span>{v.publishedAt ? `Published ${new Date(v.publishedAt).toLocaleString()}` : 'Not published'}</span></li>)}</ul>}
  </CardBody></Card>;
}
function Workspace({ membership }: { membership: UserMembershipSummary }) {
  const { data,error,busy,reload,mutate } = useAssistants(membership);
  const [selected,setSelected] = useState<string | null>(null);
  const [creating,setCreating] = useState(false);
  const [locationId,setLocationId] = useState('');
  const [notice,setNotice] = useState('');
  const [actionError,setActionError] = useState('');
  const [confirm,setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChanges(dirty, () => setDirty(false));
  const owner = membership.role === 'owner';
  const assistant = data?.assistants.find(a => a.id === selected) ?? null;
  const version = assistant?.draftVersion ?? assistant?.publishedVersion;
  async function publish() {
    if (!assistant?.draftVersion) return;
    setActionError('');
    try { await mutate('publish',assistant.id,assistant.draftVersion.id);setConfirm(false);setNotice('Version published successfully.');reload(); }
    catch(e) {setActionError(e instanceof Error ? e.message : 'Publishing failed.');}
  }
  return <div className="assistants-page">
    <header className="assistant-page-heading"><div><h2>AI Assistants</h2><p>Configure assistants for {membership.businessName}.</p></div>{owner && <Button disabled={busy || creating} onClick={() => guard.request(() => {setDirty(false);setCreating(true);setSelected(null);setNotice('');})}>Create assistant</Button>}<details><summary>About knowledge & tools</summary><p>Knowledge retrieval and automated tool execution are not implemented yet. Configuring permissions does not enable RAG or agent execution.</p></details></header>
    {!owner && <Alert tone="info" title="Read-only operator access">You can review configurations and versions. Owners create, edit, and publish assistants.</Alert>}
    {notice && <Alert tone="success">{notice}</Alert>}
    {error ? <Alert tone="danger" title="Unable to load assistants">{error}<Button onClick={() => guard.request(reload)}>Retry</Button></Alert> : !data ? <Spinner label="Loading assistants" /> : <>
      <div className="assistants-workspace"><Card><CardHeader title="Your assistants" subtitle={`${data.assistants.length} configured`} actions={<Button variant="ghost" disabled={busy} onClick={() => guard.request(reload)}>Refresh</Button>} /><CardBody className="assistants-list">
        {!data.assistants.length && <p>No assistants yet. Owners can create one for the business or an active location.</p>}
        {data.assistants.map(a => <button type="button" key={a.id} className="assistants-item" aria-pressed={selected === a.id} onClick={() => {if(selected === a.id && !creating)return;guard.request(() => {setDirty(false);setSelected(a.id);setCreating(false);setNotice('');setActionError('');});}}><strong>{(a.draftVersion ?? a.publishedVersion)?.displayName ?? 'Assistant'}</strong><span>{a.locationId ? data.locations.find(l=>l.id===a.locationId)?.name ?? 'Location' : 'Entire business'}</span><span>{a.draftVersion && <Badge>Draft v{a.draftVersion.versionNumber}</Badge>} {a.publishedVersion && <Badge tone="success">Published v{a.publishedVersion.versionNumber}</Badge>}</span></button>)}
      </CardBody></Card><div className="assistants-stack">
      {creating && owner ? <><Card><CardHeader title="New assistant" subtitle="One assistant is supported per business or location. Scope cannot be changed after creation." /><CardBody><SelectField id="assistant-scope" label="Assistant scope" value={locationId} onChange={e=>{const id=e.target.value;guard.request(()=>{setDirty(false);setLocationId(id);});}}><option value="" disabled={data.assistants.some(a=>a.locationId===null)}>Entire business</option>{data.locations.filter(l=>!l.archivedAt).map(l=><option key={l.id} value={l.id} disabled={data.assistants.some(a=>a.locationId===l.id)}>{l.name}</option>)}</SelectField></CardBody></Card><AssistantForm onDirtyChange={setDirty} key={locationId} initial={emptyConfig()} locationId={locationId || null} locations={data.locations} tools={data.tools} readOnly={false} busy={busy} onSave={async config=>{const v=await mutate('create',undefined,undefined,{...config,locationId:locationId || null});setDirty(false);setSelected(v.assistantId);setCreating(false);setNotice('Assistant created with draft v1.');reload();}} /></> : assistant && version ? <>
        <header className="assistant-editor-heading"><h2>{version.displayName}</h2><p>{version.status} v{version.versionNumber} · {assistant.locationId ? 'Location assistant' : 'Business assistant'} · {assistant.publishedVersion ? `Published v${assistant.publishedVersion.versionNumber}` : 'Not published'}</p></header>
        <AssistantForm onCreateDraft={owner && !assistant.draftVersion ? () => {setActionError('');void mutate('draft',assistant.id).then(()=>{setNotice('New draft created from the latest version.');reload();}).catch(e=>setActionError(e.message));} : undefined} onDirtyChange={setDirty} status={`${version.status} v${version.versionNumber}`} onPublish={owner && assistant.draftVersion ? () => {setActionError('');setConfirm(true);} : undefined} versions={<VersionHistory key={`${assistant.id}:${version.updatedAt}`} membership={membership} assistantId={assistant.id} />} key={`${version.id}:${version.updatedAt}`} initial={version} locationId={assistant.locationId} locations={data.locations} tools={data.tools} busy={busy} readOnly={!owner || version.status !== 'draft'} onSave={async config=>{await mutate('update',assistant.id,version.id,config);setDirty(false);setNotice('Draft saved successfully.');reload();}} />


      </> : <Card><CardHeader title="Choose an assistant" subtitle="Select an assistant to review its settings and versions." /></Card>}
      </div></div>
    </>}
    {actionError && !confirm && <Alert tone="danger">{actionError}</Alert>}
    <ConfirmDialog open={guard.open} title="Discard unsaved changes?" description="Your edits have not been saved. Discard them to continue, or stay and save your draft." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={guard.stay} onConfirm={guard.discard} />
    <ConfirmDialog open={confirm} title="Publish this assistant version?" description="The saved draft will become the published configuration and replace the previously published version. Unsaved form changes are not included." confirmLabel="Publish version" confirmVariant="primary" loading={busy} errorMessage={actionError} onCancel={()=>setConfirm(false)} onConfirm={()=>void publish()} />
  </div>;
}
export function AssistantsPage() {
  const { user,status } = useAuth();
  const { activeMembership,activeBusinessId,isLoadingBusinesses } = useTenant();
  if (status === 'loading' || isLoadingBusinesses) return <Spinner label="Loading workspace" />;
  if (!user || !activeMembership || activeMembership.businessId !== activeBusinessId) return <Alert tone="info">Select a business workspace to view assistants.</Alert>;
  return <Workspace key={`${user.id}:${activeBusinessId}:${activeMembership.role}`} membership={activeMembership} />;
}
