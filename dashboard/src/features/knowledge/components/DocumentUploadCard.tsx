import { useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { FormField } from '../../../components/ui/FormField';
import { Icon } from '../../../components/ui/Icons';
import { SelectField } from '../../../components/ui/SelectField';
import type { BusinessLocation } from '../../locations/types';
import type { DocumentVisibility } from '../types';
import {
  formatBytes,
  validateDocumentTitle,
  validateKnowledgeFile,
} from '../validation';

interface DocumentUploadCardProps {
  locations: readonly BusinessLocation[];
  busy: boolean;
  onUpload: (input: {
    file: File;
    title?: string;
    visibility: DocumentVisibility;
    locationId: string | null;
  }) => Promise<void>;
}

export function DocumentUploadCard({ locations, busy, onUpload }: DocumentUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<DocumentVisibility>('public');
  const [locationId, setLocationId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const activeLocations = locations.filter((loc) => !loc.archivedAt);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const fileError = validateKnowledgeFile(selectedFile);
    if (fileError) {
      setFormError(fileError);
      return;
    }

    const titleError = validateDocumentTitle(title, false);
    if (titleError) {
      setFormError(titleError);
      return;
    }

    if (!selectedFile) return;

    try {
      await onUpload({
        file: selectedFile,
        title: title.trim() || undefined,
        visibility,
        locationId: locationId || null,
      });
      setSelectedFile(null);
      setTitle('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to upload document.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Upload Knowledge Document"
        subtitle="Plain text (.txt) and Markdown (.md, .markdown) up to 256 KiB. Uploads are queued for ingestion and are not marked indexed until vector indexing."
      />
      <CardBody>
        <form className="knowledge-upload-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert tone="danger" title="Upload validation error">
              {formError}
            </Alert>
          )}

          <div className="knowledge-upload-grid">
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="knowledge-file-input">
                Document file (.txt, .md, .markdown)
              </label>
              <input
                ref={fileInputRef}
                id="knowledge-file-input"
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="knowledge-file-input"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setFormError(null);
                }}
              />
              {selectedFile && (
                <span className="ui-field__hint">
                  Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
                </span>
              )}
            </div>

            <FormField
              id="knowledge-upload-title"
              label="Document title (optional)"
              placeholder="Defaults to filename"
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />

            <SelectField
              id="knowledge-upload-visibility"
              label="Knowledge visibility"
              value={visibility}
              disabled={busy}
              onChange={(event) => setVisibility(event.target.value as DocumentVisibility)}
            >
              <option value="public">Public (widget &amp; staff playground)</option>
              <option value="staff_only">Staff-only (internal playground only)</option>
            </SelectField>

            <SelectField
              id="knowledge-upload-location"
              label="Location scope"
              value={locationId}
              disabled={busy}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Entire business (all locations)</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="knowledge-upload-actions">
            <Button type="submit" loading={busy} disabled={busy}>
              <Icon name="upload" size={16} />
              Upload document
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

