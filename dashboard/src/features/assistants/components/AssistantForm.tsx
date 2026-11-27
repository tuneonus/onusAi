import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { FormField } from '../../../components/ui/FormField';
import { SelectField } from '../../../components/ui/SelectField';
import { TextareaField } from '../../../components/ui/TextareaField';
import type { BusinessLocation } from '../../locations/types';
import { TONES, configFromVersion, type AssistantConfig, type ApprovedTool } from '../types';
import { EDITOR_TABS, validationTarget, type EditorTab } from '../editorTabs';
import { validateConfig } from '../validation';
interface Props { initial: AssistantConfig; locationId: string | null; locations: BusinessLocation[]; tools: ApprovedTool[]; readOnly: boolean; busy: boolean; onSave: (config: AssistantConfig) => Promise<void>; onDirtyChange: (dirty: boolean) => void; onPublish?: () => void; onCreateDraft?: () => void; versions?: ReactNode; status?: string }
export function AssistantForm({ initial, locationId, locations, tools, readOnly, busy, onSave, onDirtyChange, onPublish, onCreateDraft, versions, status }: Props) {
  const [config, setConfig] = useState(() => configFromVersion(initial));
  const [tab, setTab] = useState<EditorTab>('General');
  const tabId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = !readOnly && JSON.stringify(config) !== JSON.stringify(configFromVersion(initial));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const [errors, setErrors] = useState<string[]>([]);
  const change = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => setConfig(c => ({ ...c, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const issues = validateConfig(config, locationId, locations.filter(l => !l.archivedAt).map(l => l.id), tools.map(t => t.id));
    setErrors(issues.map(issue => issue.replace('displayName', 'Assistant name').replace('systemInstructions', 'System instructions').replace('welcomeMessage', 'Welcome message').replace('fallbackMessage', 'Fallback message')));
    if (issues.length) {
      const target = validationTarget(issues[0]); setTab(target.tab);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`#${target.id}`)?.focus());
      return;
    }
    try { await onSave(config); } catch (e) { setErrors([e instanceof Error ? e.message : 'Unable to save draft.']); }
  }
  return <form ref={formRef} noValidate onSubmit={submit} className="assistants-form">
    <div className="assistant-tabs" role="tablist" aria-label="Assistant settings">
      {EDITOR_TABS.map((name, index) => <button type="button" role="tab" key={name} id={`${tabId}-${index}`} aria-controls={`${tabId}-panel-${index}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? EDITOR_TABS.length - 1 : offset ? (index + offset + EDITOR_TABS.length) % EDITOR_TABS.length : null;
        if (next !== null) { event.preventDefault(); setTab(EDITOR_TABS[next]); document.getElementById(`${tabId}-${next}`)?.focus(); }
      }}>{name}</button>)}
    </div>
    {errors.length > 0 && <Alert tone="danger" title="Check assistant settings">{errors.map(e => <p key={e}>{e}</p>)}</Alert>}
    <fieldset disabled={readOnly || busy}>
      <div role="tabpanel" id={`${tabId}-panel-0`} aria-labelledby={`${tabId}-0`} hidden={tab !== 'General'}><Card><CardHeader title="General settings" subtitle="Give your assistant a recognizable identity." /><CardBody className="assistants-grid">
        <FormField id="assistant-name" label="Assistant name" required maxLength={120} value={config.displayName} onChange={e => change('displayName',e.target.value)} />
        <FormField id="assistant-description" label="Description" maxLength={1000} value={config.description ?? ''} onChange={e => change('description',e.target.value || null)} hint="A short description of this assistant’s purpose." />
        <FormField id="assistant-language" label="Response language" value={config.language} onChange={e => change('language',e.target.value)} hint="Language tag, for example en, en-US or hi." />

      </CardBody></Card>
      </div><div role="tabpanel" id={`${tabId}-panel-1`} aria-labelledby={`${tabId}-1`} hidden={tab !== 'Behavior'}><Card><CardHeader title="Instructions & behavior" subtitle="Describe how your assistant should help customers." /><CardBody className="assistants-stack">
        <TextareaField id="assistant-instructions" label="System instructions" required rows={6} maxLength={8000} value={config.systemInstructions} onChange={e => change('systemInstructions',e.target.value)} hint="Define purpose, boundaries, and how to handle questions it cannot answer." />
        <SelectField id="assistant-tone" label="Response tone" value={config.tone} onChange={e => change('tone',e.target.value as AssistantConfig['tone'])}>{TONES.map(t => <option key={t}>{t}</option>)}</SelectField>
      </CardBody></Card></div>
      <div role="tabpanel" id={`${tabId}-panel-2`} aria-labelledby={`${tabId}-2`} hidden={tab !== 'Messages'}><Card><CardHeader title="Customer messages" subtitle="Set a helpful welcome and a clear fallback." /><CardBody className="assistants-stack">
        <TextareaField id="assistant-welcome" label="Welcome message" required maxLength={1000} value={config.welcomeMessage} onChange={e => change('welcomeMessage',e.target.value)} />
        <TextareaField id="assistant-fallback" label="Fallback message" required maxLength={1000} value={config.fallbackMessage} onChange={e => change('fallbackMessage',e.target.value)} hint="Used when the assistant cannot provide a suitable answer." />
      </CardBody></Card>
      </div><div role="tabpanel" id={`${tabId}-panel-3`} aria-labelledby={`${tabId}-3`} hidden={tab !== 'AI Settings'}><Card><CardHeader title="Model settings" subtitle="Balance response consistency, length, and conversation memory." /><CardBody className="assistants-grid">
        {([['temperature','Temperature',0,1,0.05,'Lower values favor consistent responses; higher values allow more variety.'],['maxOutputTokens','Maximum output tokens',64,2048,1,'Limits response length. Tokens are pieces of words.'],['maxContextMessages','Context messages',1,20,1,'Maximum recent messages included with each request.']] as const).map(([key,label,min,max,step,hint]) => <FormField key={key} id={`assistant-${key}`} label={label} type="number" required min={min} max={max} step={key === 'temperature' ? 'any' : step} hint={hint} value={Number.isNaN(config.modelSettings[key]) ? '' : config.modelSettings[key]} onChange={e => change('modelSettings',{...config.modelSettings,[key]:e.target.value === '' ? NaN : Number(e.target.value)})} />)}
      </CardBody></Card>
      </div><div role="tabpanel" id={`${tabId}-panel-4`} aria-labelledby={`${tabId}-4`} hidden={tab !== 'Knowledge'}><Card><CardHeader title="Knowledge permissions" subtitle="Configure access boundaries for future capabilities." /><CardBody className="assistants-stack">
        <Alert tone="warning" title="Permissions only">Knowledge retrieval (RAG) and automated tool execution are not implemented yet. These permissions do not activate either capability.</Alert>
        <fieldset><legend>Knowledge visibility</legend>{(['public','staff_only'] as const).map(scope => <label className="assistants-check" key={scope}><input type="checkbox" checked={config.allowedKnowledgeScopes.includes(scope)} onChange={e => change('allowedKnowledgeScopes',e.target.checked ? [...config.allowedKnowledgeScopes,scope] : config.allowedKnowledgeScopes.filter(s => s !== scope))} />{scope === 'public' ? 'Public knowledge' : 'Staff-only knowledge'}</label>)}</fieldset>
        <SelectField id="assistant-knowledge-location" label="Knowledge location access" value={config.knowledgeLocationScope} onChange={e => { change('knowledgeLocationScope',e.target.value as AssistantConfig['knowledgeLocationScope']); change('knowledgeLocationIds',[]); }}>
          <option value="business_wide">Entire business</option>{locationId && <option value="assigned_location">Assigned location only</option>}<option value="selected_locations">Selected locations</option>
        </SelectField>
        {config.knowledgeLocationScope === 'selected_locations' && <fieldset><legend>Permitted locations</legend>{locations.map(l => <label key={l.id} className="assistants-check"><input type="checkbox" disabled={Boolean(l.archivedAt)} checked={config.knowledgeLocationIds.includes(l.id)} onChange={e => change('knowledgeLocationIds',e.target.checked ? [...config.knowledgeLocationIds,l.id] : config.knowledgeLocationIds.filter(id => id !== l.id))} />{l.name}{l.archivedAt ? ' (Archived)' : ''}</label>)}</fieldset>}
      </CardBody></Card></div>
      <div role="tabpanel" id={`${tabId}-panel-5`} aria-labelledby={`${tabId}-5`} hidden={tab !== 'Tools'}><Card><CardHeader title="Tool permissions" subtitle="Permissions do not activate automated tool execution." /><CardBody>
        <fieldset id="assistant-tools" tabIndex={-1}><legend>Approved tools</legend>{tools.map(tool => <label key={tool.id} className="assistants-check"><input type="checkbox" checked={config.allowedTools.includes(tool.id)} onChange={e => change('allowedTools',e.target.checked ? [...config.allowedTools,tool.id] : config.allowedTools.filter(id => id !== tool.id))} /><span>{tool.description}</span></label>)}</fieldset>
      </CardBody></Card>
      </div>
    </fieldset>
    <div role="tabpanel" id={`${tabId}-panel-6`} aria-labelledby={`${tabId}-6`} hidden={tab !== 'Versions'}>{versions ?? <Card><CardBody>Save this assistant to start its version history.</CardBody></Card>}</div>
    <footer className="assistant-action-bar">
      <span role="status">{dirty ? 'Unsaved changes' : !status ? 'New assistant · not saved' : readOnly ? 'Read-only configuration' : 'All changes saved'}{status ? ` · ${status}` : ''}</span>
      <div>{onCreateDraft && <Button type="button" disabled={busy} onClick={onCreateDraft}>Create new draft</Button>}{!readOnly && <Button type="submit" loading={busy}>Save Draft</Button>}
      {onPublish && <Button type="button" variant="secondary" disabled={busy || dirty} title={dirty ? 'Save your changes before publishing' : undefined} onClick={onPublish}>Publish saved draft</Button>}</div>
    </footer>
  </form>;
}
