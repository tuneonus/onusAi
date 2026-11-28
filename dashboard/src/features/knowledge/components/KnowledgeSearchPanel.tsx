import { useState, type FormEvent } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { FormField } from '../../../components/ui/FormField';
import { SelectField } from '../../../components/ui/SelectField';
import { Spinner } from '../../../components/ui/Spinner';
import type { UserMembershipSummary } from '../../auth/types';
import type { BusinessLocation } from '../../locations/types';
import { KnowledgeApi } from '../api';
import type { KnowledgeSearchResponse } from '../types';
import { VisibilityBadge } from './KnowledgeStatusBadges';

interface KnowledgeSearchPanelProps {
  membership: UserMembershipSummary;
  locations: readonly BusinessLocation[];
}

export function KnowledgeSearchPanel({ membership, locations }: KnowledgeSearchPanelProps) {
  const activeLocations = locations.filter((loc) => !loc.archivedAt);
  const [query, setQuery] = useState('');
  const [locationId, setLocationId] = useState('');
  const [topK, setTopK] = useState('5');
  const [scoreThreshold, setScoreThreshold] = useState('0.35');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<KnowledgeSearchResponse | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a search query.');
      return;
    }

    const controller = new AbortController();
    const api = new KnowledgeApi(membership, controller.signal);
    setBusy(true);
    setError(null);
    try {
      const result = await api.search({
        query: trimmed,
        topK: Number(topK),
        scoreThreshold: Number(scoreThreshold),
        ...(locationId === 'business_wide'
          ? { locationId: null }
          : locationId
            ? { locationId }
            : {}),
      });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Semantic search failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Semantic Knowledge Search"
        subtitle="Test query embedding, tenant-scoped Qdrant retrieval, PostgreSQL candidate validation, and citations."
      />
      <CardBody className="knowledge-detail-body">
        <form className="knowledge-replace-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <FormField
            id="knowledge-semantic-query"
            label="Search query"
            placeholder="Ask a question or search indexed knowledge..."
            value={query}
            disabled={busy}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
          />
          <SelectField
            id="knowledge-semantic-location"
            label="Location scope"
            value={locationId}
            disabled={busy}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">All locations + business-wide</option>
            <option value="business_wide">Business-wide only</option>
            {activeLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="knowledge-semantic-topk"
            label="Top-K"
            value={topK}
            disabled={busy}
            onChange={(e) => setTopK(e.target.value)}
          >
            <option value="3">Top 3</option>
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
          </SelectField>
          <SelectField
            id="knowledge-semantic-threshold"
            label="Min score"
            value={scoreThreshold}
            disabled={busy}
            onChange={(e) => setScoreThreshold(e.target.value)}
          >
            <option value="0.2">0.20</option>
            <option value="0.35">0.35</option>
            <option value="0.5">0.50</option>
            <option value="0.65">0.65</option>
          </SelectField>
          <Button type="submit" size="sm" loading={busy} disabled={busy}>
            Search knowledge
          </Button>
        </form>

        {error && (
          <Alert tone="danger" title="Search failed">
            {error}
          </Alert>
        )}

        {busy && <Spinner label="Searching indexed knowledge" />}

        {response && !busy && (
          <div className="knowledge-detail-body">
            <p className="knowledge-meta-text">
              Model: <strong>{response.embeddingModel}</strong> ({response.embeddingModelVersion},{' '}
              {response.embeddingDimensions}d) · Collection: <code>{response.qdrantCollection}</code> ·{' '}
              Validated matches: <strong>{response.results.length}</strong> (of{' '}
              {response.candidateCount} vector candidates)
            </p>
            {response.results.length === 0 ? (
              <p className="knowledge-muted-note">
                No validated indexed chunks matched this query within the selected scope and score
                threshold.
              </p>
            ) : (
              <ul className="knowledge-list-items">
                {response.results.map((hit) => (
                  <li key={hit.chunkId} className="knowledge-chunk-card">
                    <div className="knowledge-badge-row">
                      <strong>{hit.title}</strong>
                      <Badge tone="success">Score {hit.score.toFixed(3)}</Badge>
                      <VisibilityBadge visibility={hit.visibility} />
                      <Badge tone="neutral">v{hit.versionNumber}</Badge>
                      <span className="knowledge-meta-text">
                        {hit.sourceFilename} · Chunk #{hit.chunkIndex + 1}
                      </span>
                    </div>
                    {hit.headingPath.length > 0 && (
                      <p className="knowledge-meta-text">
                        Section: {hit.headingPath.join(' › ')}
                      </p>
                    )}
                    <pre className="knowledge-chunk-text">{hit.chunkText}</pre>
                    <p className="knowledge-meta-text">
                      Citation: <code>{hit.citation.sourceFilename}</code> (doc{' '}
                      <code>{hit.citation.documentId.slice(0, 8)}</code> · chunk{' '}
                      <code>{hit.citation.chunkId.slice(0, 8)}</code>)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

