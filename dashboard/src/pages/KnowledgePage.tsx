import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { SelectField } from '../components/ui/SelectField';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../features/auth/useAuth';
import type { UserMembershipSummary } from '../features/auth/types';
import { useTenant } from '../features/businesses/useTenant';
import { DocumentDetailPanel } from '../features/knowledge/components/DocumentDetailPanel';
import { DocumentUploadCard } from '../features/knowledge/components/DocumentUploadCard';
import { KnowledgeSearchPanel } from '../features/knowledge/components/KnowledgeSearchPanel';
import {
  DocumentStatusBadge,
  VisibilityBadge,
} from '../features/knowledge/components/KnowledgeStatusBadges';
import { KnowledgeApi } from '../features/knowledge/api';
import type {
  DocumentListItem,
  DocumentStatus,
  DocumentVisibility,
} from '../features/knowledge/types';
import {
  computeKnowledgeOverview,
  filterDocumentsByQuery,
  formatBytes,
} from '../features/knowledge/validation';
import { listBusinessLocations } from '../features/locations/api';
import type { BusinessLocation } from '../features/locations/types';
import './KnowledgePage.css';

function KnowledgeWorkspace({ membership }: { membership: UserMembershipSummary }) {
  const [params, setParams] = useSearchParams();
  const selectedDocId =
    params.get('workspace') === membership.businessId ? params.get('document') : null;

  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'' | DocumentVisibility>('');
  const [statusFilter, setStatusFilter] = useState<'' | DocumentStatus>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const isOwner = membership.role === 'owner';

  useEffect(() => {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);

    Promise.all([
      api.list({
        visibility: visibilityFilter || undefined,
        status: statusFilter || undefined,
        locationId:
          locationFilter && locationFilter !== 'business_wide' ? locationFilter : undefined,
        includeDeleted,
      }),
      listBusinessLocations(membership.businessId, true, controller.signal),
    ])
      .then(([docs, locResponse]) => {
        if (controller.signal.aborted) return;
        if (locResponse.businessId !== membership.businessId) {
          throw new Error('Location response belongs to another workspace.');
        }
        setLoadingError(null);
        setDocuments(docs);
        setLocations(locResponse.locations);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setLoadingError(err instanceof Error ? err.message : 'Unable to load knowledge base.');
        }
      });

    return () => controller.abort();
  }, [membership, visibilityFilter, statusFilter, locationFilter, includeDeleted, revision]);

  function refreshList() {
    setLoadingError(null);
    setRevision((n) => n + 1);
  }

  async function handleUpload(input: {
    file: File;
    title?: string;
    visibility: DocumentVisibility;
    locationId: string | null;
  }) {
    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);
    setUploadBusy(true);
    setBannerMessage(null);
    try {
      const created = await api.upload(input);
      setBannerMessage(
        `Uploaded "${created.document.title}" (v${created.version.versionNumber}). Queued for ingestion.`,
      );
      setParams({ workspace: membership.businessId, document: created.document.id });
      refreshList();
    } finally {
      setUploadBusy(false);
    }
  }

  const overview = documents ? computeKnowledgeOverview(documents) : null;
  const visibleDocuments = documents
    ? filterDocumentsByQuery(documents, searchQuery, locationFilter)
    : [];

  return (
    <div className="knowledge-page">
      <header className="knowledge-page-header">
        <div>
          <h2>Knowledge Base</h2>
          <p className="knowledge-subtitle">
            Manage TXT and Markdown documents, visibility, versions, ingestion jobs, and chunks for{' '}
            <strong>{membership.businessName}</strong>.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refreshList}>
          Refresh
        </Button>
      </header>

      <Alert tone="info" title="Ingestion & vector indexing pipeline (Phase 06)">
        Documents move from <strong>uploaded</strong> → <strong>processing</strong> →{' '}
        <strong>ready</strong> after the Python ingestion worker chunks text, generates Gemini
        embeddings, and indexes vectors in Qdrant. Replacements keep the previous{' '}
        <strong>ready</strong> version active until the new version finishes indexing.
      </Alert>

      {bannerMessage && (
        <Alert tone="success" title="Knowledge Base updated">
          {bannerMessage}
        </Alert>
      )}

      {loadingError && (
        <Alert tone="danger" title="Unable to load Knowledge Base">
          {loadingError}{' '}
          <Button variant="secondary" size="sm" onClick={refreshList}>
            Retry
          </Button>
        </Alert>
      )}

      {overview && (
        <section className="knowledge-overview-grid" aria-label="Knowledge Base overview">
          <Card>
            <CardBody className="knowledge-stat-card">
              <span className="knowledge-stat-label">Active documents</span>
              <strong className="knowledge-stat-value">{overview.totalActive}</strong>
              <span className="knowledge-stat-hint">
                {overview.publicCount} public · {overview.staffOnlyCount} staff-only
              </span>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="knowledge-stat-card">
              <span className="knowledge-stat-label">In ingestion pipeline</span>
              <strong className="knowledge-stat-value">{overview.processingOrUploadedCount}</strong>
              <span className="knowledge-stat-hint">Uploaded or processing</span>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="knowledge-stat-card">
              <span className="knowledge-stat-label">Failed documents</span>
              <strong className="knowledge-stat-value">{overview.failedCount}</strong>
              <span className="knowledge-stat-hint">Require owner retry or replacement</span>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="knowledge-stat-card">
              <span className="knowledge-stat-label">Stored chunks</span>
              <strong className="knowledge-stat-value">{overview.totalChunks}</strong>
              <span className="knowledge-stat-hint">Across latest document versions</span>
            </CardBody>
          </Card>
        </section>
      )}

      {isOwner ? (
        <DocumentUploadCard locations={locations} busy={uploadBusy} onUpload={handleUpload} />
      ) : (
        <Alert tone="info" title="Operator read-only view">
          Operators can search, filter, and inspect documents, ingestion jobs, and chunks. Only
          business owners can upload, edit, retry, or delete documents.
        </Alert>
      )}

      <KnowledgeSearchPanel membership={membership} locations={locations} />

      {!documents && !loadingError ? (
        <Spinner label="Loading knowledge documents" />
      ) : (
        <div className="knowledge-workspace-grid">
          <Card>
            <CardHeader
              title="Documents"
              subtitle={`${visibleDocuments.length} matching document(s)`}
            />
            <CardBody className="knowledge-sidebar-body">
              <div className="knowledge-filters">
                <FormField
                  id="knowledge-search"
                  label="Search title or filename"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="knowledge-filter-row">
                  <SelectField
                    id="knowledge-filter-visibility"
                    label="Visibility"
                    value={visibilityFilter}
                    onChange={(e) =>
                      setVisibilityFilter(e.target.value as '' | DocumentVisibility)
                    }
                  >
                    <option value="">All visibilities</option>
                    <option value="public">Public</option>
                    <option value="staff_only">Staff-only</option>
                  </SelectField>
                  <SelectField
                    id="knowledge-filter-status"
                    label="Status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as '' | DocumentStatus)}
                  >
                    <option value="">All statuses</option>
                    <option value="uploaded">Uploaded</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                    <option value="ready">Indexed &amp; ready</option>
                  </SelectField>
                </div>
                <SelectField
                  id="knowledge-filter-location"
                  label="Location scope"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                >
                  <option value="">All scopes</option>
                  <option value="business_wide">Entire business only</option>
                  {locations
                    .filter((l) => !l.archivedAt)
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                </SelectField>
                <label className="knowledge-checkbox-row">
                  <input
                    type="checkbox"
                    checked={includeDeleted}
                    onChange={(e) => setIncludeDeleted(e.target.checked)}
                  />
                  <span>Include deleted documents</span>
                </label>
              </div>

              {visibleDocuments.length === 0 ? (
                <p className="knowledge-muted-note">
                  No documents match the current filters.
                </p>
              ) : (
                <nav className="knowledge-doc-list" aria-label="Knowledge documents">
                  {visibleDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="knowledge-doc-item"
                      aria-pressed={selectedDocId === doc.id}
                      onClick={() =>
                        setParams({ workspace: membership.businessId, document: doc.id })
                      }
                    >
                      <div className="knowledge-doc-item-top">
                        <strong>{doc.title}</strong>
                        <Badge tone="neutral">v{doc.currentVersionNumber}</Badge>
                      </div>
                      <div className="knowledge-badge-row">
                        <DocumentStatusBadge status={doc.status} />
                        <VisibilityBadge visibility={doc.visibility} />
                      </div>
                      {doc.latestVersion && (
                        <span className="knowledge-meta-text">
                          {doc.latestVersion.sourceFilename} ·{' '}
                          {formatBytes(doc.latestVersion.byteSize)} ·{' '}
                          {doc.latestVersion.chunkCount} chunks
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              )}
            </CardBody>
          </Card>

          <div>
            {selectedDocId ? (
              <DocumentDetailPanel
                key={selectedDocId}
                membership={membership}
                documentId={selectedDocId}
                locations={locations}
                onMutated={(msg, deleted) => {
                  setBannerMessage(msg);
                  if (deleted) {
                    setParams({ workspace: membership.businessId });
                  }
                  refreshList();
                }}
              />
            ) : (
              <Card>
                <CardBody className="knowledge-empty-detail">
                  <h3>Select a document</h3>
                  <p>
                    Choose a document from the list to inspect its metadata, version history,
                    ingestion job progress, and stored chunks.
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function KnowledgePage() {
  const { user } = useAuth();
  const { activeMembership, activeBusinessId, isLoadingBusinesses } = useTenant();

  if (isLoadingBusinesses) {
    return <Spinner label="Loading workspace" />;
  }

  if (!user || !activeMembership || activeMembership.businessId !== activeBusinessId) {
    return (
      <Alert tone="info">Select a business workspace to manage its knowledge base.</Alert>
    );
  }

  return (
    <KnowledgeWorkspace
      key={`${user.id}:${activeBusinessId}:${activeMembership.role}`}
      membership={activeMembership}
    />
  );
}
