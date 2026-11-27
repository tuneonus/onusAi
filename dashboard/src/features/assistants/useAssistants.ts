import { useEffect, useRef, useState } from 'react';
import type { UserMembershipSummary } from '../auth/types';
import { listBusinessLocations } from '../locations/api';
import type { BusinessLocation } from '../locations/types';
import { assistantRequest } from './api';
import type { Assistant, ApprovedTool } from './types';
export function useAssistants(membership: UserMembershipSummary) {
  const [data, setData] = useState<{ assistants: Assistant[]; locations: BusinessLocation[]; tools: ApprovedTool[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const controllers = useRef(new Set<AbortController>());
  const { businessId, membershipId, businessName, role } = membership;
  useEffect(() => {
    const active = controllers.current;
    const controller = new AbortController(); active.add(controller);
    const scope = { businessId, membershipId, businessName, role };
    Promise.all([assistantRequest(scope, controller.signal, 'list'), listBusinessLocations(businessId, true, controller.signal), assistantRequest(scope, controller.signal, 'tools')])
      .then(([list, locations, registry]) => {
        if (!controller.signal.aborted && 'assistants' in list && 'tools' in registry) {
          if (locations.businessId !== businessId) throw new Error('Location response belongs to another workspace.');
          setData({ assistants: list.assistants, locations: locations.locations, tools: registry.tools });
        }
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load assistants.'); });
    return () => { for (const request of active) request.abort(); active.clear(); };
  }, [businessId, membershipId, businessName, role, revision]);
  function reload() { setData(null); setError(null); setRevision(n => n + 1); }
  async function mutate(action: 'create' | 'draft' | 'update' | 'publish', assistantId?: string, versionId?: string, body?: unknown) {
    const controller = new AbortController(); controllers.current.add(controller); setBusy(true);
    try {
      const response = await assistantRequest(membership, controller.signal, action, assistantId, versionId, body);
      if ('version' in response) return response.version;
      throw new Error('Missing assistant version.');
    } finally { controllers.current.delete(controller); if (!controller.signal.aborted) setBusy(false); }
  }
  return { data, error, busy, reload, mutate };
}
