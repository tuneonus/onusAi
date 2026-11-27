import { useEffect, useId } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  loading = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ui-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="ui-dialog"
      >
        <div>
          <h2 id={titleId} className="ui-dialog__title">
            {title}
          </h2>
          <p id={descriptionId} className="ui-dialog__description" style={{ marginTop: 'var(--space-2)' }}>
            {description}
          </p>
        </div>

        {errorMessage && (
          <Alert tone="danger" title="Action failed">
            {errorMessage}
          </Alert>
        )}

        <div className="ui-dialog__actions">
          <Button variant="secondary" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

