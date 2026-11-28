import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import type {
  DocumentStatus,
  DocumentVersionStatus,
  DocumentVisibility,
  IngestionJobStatus,
} from '../types';

const DOC_STATUS_MAP: Record<DocumentStatus | DocumentVersionStatus, { label: string; tone: BadgeTone }> = {
  uploaded: { label: 'Uploaded (queued)', tone: 'info' },
  processing: { label: 'Processing (not indexed)', tone: 'warning' },
  ready: { label: 'Indexed & ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};

const JOB_STATUS_MAP: Record<IngestionJobStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Queued', tone: 'info' },
  leased: { label: 'Leased by worker', tone: 'warning' },
  completed: { label: 'Chunked (awaiting index)', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus | DocumentVersionStatus }) {
  const config = DOC_STATUS_MAP[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export function JobStatusBadge({ status }: { status: IngestionJobStatus }) {
  const config = JOB_STATUS_MAP[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

export function VisibilityBadge({ visibility }: { visibility: DocumentVisibility }) {
  return (
    <Badge tone={visibility === 'public' ? 'success' : 'neutral'}>
      {visibility === 'public' ? 'Public knowledge' : 'Staff-only'}
    </Badge>
  );
}

