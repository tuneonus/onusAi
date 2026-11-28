import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FormField } from '../../../components/ui/FormField';
import { SelectField } from '../../../components/ui/SelectField';
import { Spinner } from '../../../components/ui/Spinner';
import type { UserMembershipSummary } from '../../auth/types';
import type { BusinessLocation } from '../../locations/types';
import { KnowledgeApi } from '../api';
import type {
  DocumentChunk,
  DocumentDetail,
  DocumentIngestionJob,
  DocumentProcessingStatus,
  DocumentVersion,
  DocumentVisibility,
} from '../types';
import {
  formatBytes,
  validateDocumentTitle,
  validateKnowledgeFile,
} from '../validation';
import {
  DocumentStatusBadge,
  JobStatusBadge,
  VisibilityBadge,
} from './KnowledgeStatusBadges';

interface DocumentDetailPanelProps {
  membership: UserMembershipSummary;
  documentId: string;
  locations: readonly BusinessLocation[];
  onMutated: (message: string, deleted?: boolean) => void;
}

export function DocumentDetailPanel({
  membership,
  documentId,
  locations,
  onMutated,
}: DocumentDetailPanelProps) {
  const isOwner = membership.role === 'owner';
  const activeLocations = locations.filter((loc) => !loc.archivedAt);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [statusInfo, setStatusInfo] = useState<DocumentProcessingStatus | null>(null);
  const [jobs, setJobs] = useState<DocumentIngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Metadata edit state
  const [editTitle, setEditTitle] = useState('');
  const [editVisibility, setEditVisibility] = useState<DocumentVisibility>('public');
  const [editLocationId, setEditLocationId] = useState('');

  // Replacement upload state
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Delete confirmation state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Version text & chunk inspection state
  const [inspectedVersion, setInspectedVersion] = useState<DocumentVersion | null>(null);
  const [inspectedChunks, setInspectedChunks] = useState<{
    versionId: string;
    versionNumber: number;
    chunks: DocumentChunk[];
  } | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  function triggerRefresh() {
    setLoading(true);
    setError(null);
    setRefreshTick((n) => n + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);

    Promise.all([
      api.getDetail(documentId),
      api.getStatus(documentId),
      api.listJobs(documentId),
    ])
      .then(([loadedDetail, loadedStatus, loadedJobs]) => {
        if (controller.signal.aborted) return;
        setError(null);
        setDetail(loadedDetail);
        setStatusInfo(loadedStatus);
        setJobs(loadedJobs);
        setEditTitle(loadedDetail.document.title);
        setEditVisibility(loadedDetail.document.visibility);
        setEditLocationId(loadedDetail.document.locationId ?? '');
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load document details.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [membership, documentId, refreshTick]);

  async function runOwnerAction(work: (api: KnowledgeApi) => Promise<void>) {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);
    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await work(api);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleError = validateDocumentTitle(editTitle, true);
    if (titleError) {
      setActionError(titleError);
      return;
    }

    await runOwnerAction(async (api) => {
      await api.updateMetadata(documentId, {
        title: editTitle.trim(),
        visibility: editVisibility,
        locationId: editLocationId || null,
      });
      setActionSuccess('Document metadata updated.');
      setRefreshTick((n) => n + 1);
      onMutated('Document metadata updated.');
    });
  }

  async function handleReplaceUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileError = validateKnowledgeFile(replaceFile);
    if (fileError) {
      setActionError(fileError);
      return;
    }
    if (!replaceFile) return;

    await runOwnerAction(async (api) => {
      const result = await api.replaceVersion(documentId, replaceFile);
      setReplaceFile(null);
      if (replaceInputRef.current) {
        replaceInputRef.current.value = '';
      }
      setActionSuccess(
        `Uploaded replacement version v${result.version.versionNumber}. Queued for ingestion.`,
      );
      setRefreshTick((n) => n + 1);
      onMutated(`Uploaded version v${result.version.versionNumber}.`);
    });
  }

  async function handleInspectVersionText(versionId: string) {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);
    setInspectLoading(true);
    setActionError(null);
    try {
      const version = await api.getVersion(documentId, versionId);
      setInspectedVersion(version);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to load version content.');
    } finally {
      setInspectLoading(false);
    }
  }

  async function handleInspectChunks(versionId: string, versionNumber: number) {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);
    setInspectLoading(true);
    setActionError(null);
    try {
      const chunks = await api.listChunks(documentId, versionId);
      setInspectedChunks({ versionId, versionNumber, chunks });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to load document chunks.');
    } finally {
      setInspectLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardBody>
          <Spinner label="Loading document details" />
        </CardBody>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card>
        <CardBody>
          <Alert tone="danger" title="Unable to load document">
            {error ?? 'Document not found.'}
          </Alert>
        </CardBody>
      </Card>
    );
  }

  const { document: doc, versions } = detail;
  const isDeleted = doc.status === 'deleted';
  const locationName = doc.locationId
    ? locations.find((l) => l.id === doc.locationId)?.name ?? 'Unknown location'
    : 'Entire business';

  return (
    <div className="knowledge-detail-stack">
      <Card>
        <CardHeader
          title={doc.title}
          subtitle={`Version v${doc.currentVersionNumber} · Scope: ${locationName}`}
          actions={
            <div className="knowledge-header-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={actionBusy}
                onClick={triggerRefresh}
              >
                Refresh status
              </Button>
              {isOwner && !isDeleted && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={actionBusy}
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  Delete document
                </Button>
              )}
            </div>
          }
        />
        <CardBody className="knowledge-detail-body">
          <div className="knowledge-badge-row">
            <DocumentStatusBadge status={doc.status} />
            <VisibilityBadge visibility={doc.visibility} />
            <Badge tone="neutral">
              {doc.activeVersionId ? 'Active version ready' : 'Not yet indexed'}
            </Badge>
          </div>

          {actionError && (
            <Alert tone="danger" title="Action failed">
              {actionError}
            </Alert>
          )}
          {actionSuccess && (
            <Alert tone="success" title="Updated">
              {actionSuccess}
            </Alert>
          )}

          {isOwner && !isDeleted ? (
            <form className="knowledge-meta-form" onSubmit={handleSaveMetadata} noValidate>
              <h3>Metadata &amp; Visibility</h3>
              <div className="knowledge-meta-grid">
                <FormField
                  id="doc-edit-title"
                  label="Title"
                  value={editTitle}
                  disabled={actionBusy}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <SelectField
                  id="doc-edit-visibility"
                  label="Visibility"
                  value={editVisibility}
                  disabled={actionBusy}
                  onChange={(e) => setEditVisibility(e.target.value as DocumentVisibility)}
                >
                  <option value="public">Public knowledge</option>
                  <option value="staff_only">Staff-only</option>
                </SelectField>
                <SelectField
                  id="doc-edit-location"
                  label="Location scope"
                  value={editLocationId}
                  disabled={actionBusy}
                  onChange={(e) => setEditLocationId(e.target.value)}
                >
                  <option value="">Entire business</option>
                  {activeLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Button type="submit" size="sm" loading={actionBusy} disabled={actionBusy}>
                  Save metadata
                </Button>
              </div>
            </form>
          ) : (
            <p className="knowledge-muted-note">
              {isDeleted
                ? `Deleted on ${doc.deletedAt ? new Date(doc.deletedAt).toLocaleString() : 'N/A'}.`
                : 'Operators have read-only access to knowledge documents.'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ingestion Status & Jobs"
          subtitle={
            statusInfo?.latestJob
              ? `Latest job: ${statusInfo.latestJob.status} (attempt ${statusInfo.latestJob.attemptCount} of ${statusInfo.latestJob.maxAttempts})`
              : 'No ingestion jobs recorded yet.'
          }
        />
        <CardBody>
          {jobs.length === 0 ? (
            <p className="knowledge-muted-note">No ingestion jobs found for this document.</p>
          ) : (
            <ul className="knowledge-list-items">
              {jobs.map((job) => (
                <li key={job.id} className="knowledge-item-row">
                  <div className="knowledge-item-main">
                    <div className="knowledge-badge-row">
                      <JobStatusBadge status={job.status} />
                      <span className="knowledge-meta-text">
                        Attempt {job.attemptCount}/{job.maxAttempts}
                      </span>
                      {job.leasedBy && (
                        <span className="knowledge-meta-text">Worker: {job.leasedBy}</span>
                      )}
                    </div>
                    {job.lastError && (
                      <p className="knowledge-error-text">Error: {job.lastError}</p>
                    )}
                    <p className="knowledge-meta-text">
                      Created {new Date(job.createdAt).toLocaleString()}
                      {job.completedAt
                        ? ` · Completed ${new Date(job.completedAt).toLocaleString()}`
                        : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Document Versions"
          subtitle="Each upload creates an immutable version. Replacement preserves any active indexed version until the new version is indexed."
        />
        <CardBody className="knowledge-detail-body">
          {isOwner && !isDeleted && (
            <form className="knowledge-replace-form" onSubmit={handleReplaceUpload} noValidate>
              <div className="ui-field">
                <label className="ui-field__label" htmlFor="knowledge-replace-file">
                  Upload replacement version (.txt, .md, .markdown)
                </label>
                <input
                  ref={replaceInputRef}
                  id="knowledge-replace-file"
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  className="knowledge-file-input"
                  disabled={actionBusy}
                  onChange={(e) => {
                    setReplaceFile(e.target.files?.[0] ?? null);
                    setActionError(null);
                  }}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm" loading={actionBusy} disabled={actionBusy}>
                Upload new version
              </Button>
            </form>
          )}

          <ul className="knowledge-list-items">
            {versions.map((ver) => (
              <li key={ver.id} className="knowledge-item-row">
                <div className="knowledge-item-main">
                  <div className="knowledge-badge-row">
                    <strong>v{ver.versionNumber}</strong>
                    <DocumentStatusBadge status={ver.status} />
                    <Badge tone="neutral">{ver.sourceType.toUpperCase()}</Badge>
                    <span className="knowledge-meta-text">
                      {ver.sourceFilename} · {formatBytes(ver.byteSize)} · {ver.charCount} chars
                    </span>
                  </div>
                  <p className="knowledge-meta-text">
                    Chunks: {ver.chunkCount}
                    {ver.chunkVersion ? ` (${ver.chunkVersion})` : ''} · Indexed:{' '}
                    {ver.indexedAt ? new Date(ver.indexedAt).toLocaleString() : 'Not indexed'}
                  </p>
                  {ver.embeddingModel && (
                    <p className="knowledge-meta-text">
                      Vectors: {ver.embeddingModel} ({ver.embeddingModelVersion ?? 'v1'},{' '}
                      {ver.embeddingDimensions ?? 768}d) · Collection:{' '}
                      <code>{ver.qdrantCollection ?? '—'}</code>
                    </p>
                  )}
                  {ver.failureReason && (
                    <p className="knowledge-error-text">Failure: {ver.failureReason}</p>
                  )}
                </div>
                <div className="knowledge-item-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={inspectLoading}
                    onClick={() => void handleInspectVersionText(ver.id)}
                  >
                    View text
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={inspectLoading}
                    onClick={() => void handleInspectChunks(ver.id, ver.versionNumber)}
                  >
                    Chunks ({ver.chunkCount})
                  </Button>
                  {isOwner && !isDeleted && ver.status === 'failed' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionBusy}
                      onClick={() =>
                        void runOwnerAction(async (api) => {
                          await api.retryVersion(doc.id, ver.id);
                          setActionSuccess(`Re-queued v${ver.versionNumber} for ingestion.`);
                          setRefreshTick((n) => n + 1);
                          onMutated(`Retried ingestion for v${ver.versionNumber}.`);
                        })
                      }
                    >
                      Retry ingestion
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {inspectedVersion && (
        <Card>
          <CardHeader
            title={`Source Text · v${inspectedVersion.versionNumber} (${inspectedVersion.sourceFilename})`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setInspectedVersion(null)}>
                Close
              </Button>
            }
          />
          <CardBody>
            <pre className="knowledge-text-preview">{inspectedVersion.contentText}</pre>
          </CardBody>
        </Card>
      )}

      {inspectedChunks && (
        <Card>
          <CardHeader
            title={`Document Chunks · v${inspectedChunks.versionNumber}`}
            subtitle={`${inspectedChunks.chunks.length} chunk(s) stored in PostgreSQL`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setInspectedChunks(null)}>
                Close
              </Button>
            }
          />
          <CardBody>
            {inspectedChunks.chunks.length === 0 ? (
              <p className="knowledge-muted-note">
                No chunks stored for this version yet. Run the Python ingestion worker to normalize and chunk it.
              </p>
            ) : (
              <ul className="knowledge-list-items">
                {inspectedChunks.chunks.map((chunk) => (
                  <li key={chunk.id} className="knowledge-chunk-card">
                    <div className="knowledge-badge-row">
                      <strong>Chunk #{chunk.chunkIndex + 1}</strong>
                      <Badge tone="neutral">{chunk.chunkVersion}</Badge>
                      <VisibilityBadge visibility={chunk.visibility} />
                      <span className="knowledge-meta-text">
                        Offsets {chunk.charStart}–{chunk.charEnd} ({chunk.charCount} chars)
                      </span>
                    </div>
                    {chunk.headingPath.length > 0 && (
                      <p className="knowledge-meta-text">
                        Section: {chunk.headingPath.join(' › ')}
                      </p>
                    )}
                    <pre className="knowledge-chunk-text">{chunk.chunkText}</pre>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete knowledge document?"
        description={`Soft-delete "${doc.title}" and all of its versions? Active ingestion jobs will be cancelled and the document will be excluded from default views.`}
        confirmLabel="Delete document"
        confirmVariant="danger"
        loading={actionBusy}
        errorMessage={actionError}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() =>
          void runOwnerAction(async (api) => {
            await api.softDelete(doc.id);
            setConfirmDeleteOpen(false);
            onMutated(`Deleted "${doc.title}".`, true);
          })
        }
      />
    </div>
  );
}
