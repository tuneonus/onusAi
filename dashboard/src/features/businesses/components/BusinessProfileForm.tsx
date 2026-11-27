import { useState, type FormEvent } from 'react';
import { OpeningHoursEditor } from '../../../components/business/OpeningHoursEditor';
import { TimezoneField } from '../../../components/business/TimezoneField';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { TextareaField } from '../../../components/ui/TextareaField';
import { ApiClientError } from '../../../services/api/client';
import type {
  BusinessFormValues,
  BusinessProfile,
  CreateBusinessPayload,
  UpdateBusinessPayload,
} from '../types';
import {
  buildBusinessPatchPayload,
  businessProfileToFormValues,
  createEmptyBusinessFormValues,
  validateBusinessForm,
  type BusinessFormErrors,
} from '../validation';
import './BusinessProfileForm.css';

interface BusinessProfileFormProps {
  mode: 'create' | 'edit';
  initialBusiness?: BusinessProfile | null;
  readOnly?: boolean;
  onCreateSubmit?: (payload: CreateBusinessPayload) => Promise<void>;
  onUpdateSubmit?: (payload: UpdateBusinessPayload) => Promise<void>;
  onCancel?: () => void;
}

export function BusinessProfileForm({
  mode,
  initialBusiness = null,
  readOnly = false,
  onCreateSubmit,
  onUpdateSubmit,
  onCancel,
}: BusinessProfileFormProps) {
  const [values, setValues] = useState<BusinessFormValues>(() =>
    mode === 'edit' && initialBusiness
      ? businessProfileToFormValues(initialBusiness)
      : createEmptyBusinessFormValues(),
  );
  const [errors, setErrors] = useState<BusinessFormErrors>({});
  const [submitFeedback, setSubmitFeedback] = useState<{
    tone: 'success' | 'danger' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const disabled = readOnly || isSubmitting;

  const updateField = <K extends keyof BusinessFormValues>(
    field: K,
    value: BusinessFormValues[K],
  ) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setSubmitFeedback(null);

    if (field in errors) {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    }

    if (field === 'openingHours') {
      setErrors((previous) => ({
        ...previous,
        openingHours: undefined,
        dayErrors: undefined,
      }));
    }
  };

  const handleReset = () => {
    if (mode === 'edit' && initialBusiness) {
      setValues(businessProfileToFormValues(initialBusiness));
    } else {
      setValues(createEmptyBusinessFormValues());
    }
    setErrors({});
    setSubmitFeedback(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readOnly) {
      return;
    }

    setSubmitFeedback(null);
    const validation = validateBusinessForm(values);
    setErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    if (mode === 'edit' && initialBusiness) {
      const patch = buildBusinessPatchPayload(initialBusiness, validation.payload);

      if (Object.keys(patch).length === 0) {
        setSubmitFeedback({
          tone: 'info',
          title: 'No changes to save',
          message: 'Update at least one business profile field before saving.',
        });
        return;
      }

      setIsSubmitting(true);
      try {
        await onUpdateSubmit?.(patch);
        setSubmitFeedback({
          tone: 'success',
          title: 'Business profile saved',
          message: 'Changes have been persisted to the backend.',
        });
      } catch (error) {
        setSubmitFeedback({
          tone: 'danger',
          title: 'Failed to update business profile',
          message:
            error instanceof ApiClientError
              ? error.message
              : 'An unexpected error occurred while saving.',
        });
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateSubmit?.(validation.payload);
    } catch (error) {
      setSubmitFeedback({
        tone: 'danger',
        title: 'Failed to create business',
        message:
          error instanceof ApiClientError
            ? error.message
            : 'An unexpected error occurred while creating the business.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="business-form" onSubmit={handleSubmit} noValidate>
      {readOnly && (
        <Alert tone="info" title="Read-only operator access">
          Your role in this business is operator. Only business owners can modify business profile
          settings.
        </Alert>
      )}

      {submitFeedback && (
        <Alert tone={submitFeedback.tone} title={submitFeedback.title}>
          {submitFeedback.message}
        </Alert>
      )}

      <div className="business-form__grid">
        <div className="business-form__full">
          <FormField
            id={`${mode}-business-name`}
            label="Business name"
            placeholder="Northstar Dental Clinic"
            required
            disabled={disabled}
            value={values.name}
            error={errors.name}
            onChange={(event) => updateField('name', event.target.value)}
          />
        </div>

        <div className="business-form__full">
          <TextareaField
            id={`${mode}-business-description`}
            label="Description"
            placeholder="Brief overview of services and customer engagement focus."
            disabled={disabled}
            value={values.description}
            error={errors.description}
            onChange={(event) => updateField('description', event.target.value)}
          />
        </div>

        <FormField
          id={`${mode}-business-email`}
          type="email"
          label="Contact email"
          placeholder="hello@business.example"
          disabled={disabled}
          value={values.contactEmail}
          error={errors.contactEmail}
          onChange={(event) => updateField('contactEmail', event.target.value)}
        />

        <FormField
          id={`${mode}-business-phone`}
          type="tel"
          label="Contact phone"
          placeholder="+1 (555) 010-2000"
          disabled={disabled}
          value={values.contactPhone}
          error={errors.contactPhone}
          onChange={(event) => updateField('contactPhone', event.target.value)}
        />

        <FormField
          id={`${mode}-business-website`}
          type="url"
          label="Website URL"
          placeholder="https://business.example"
          disabled={disabled}
          value={values.websiteUrl}
          error={errors.websiteUrl}
          onChange={(event) => updateField('websiteUrl', event.target.value)}
        />

        <TimezoneField
          id={`${mode}-business-timezone`}
          disabled={disabled}
          value={values.timezone}
          error={errors.timezone}
          onChange={(nextZone) => updateField('timezone', nextZone)}
        />

        <FormField
          id={`${mode}-business-retention`}
          type="number"
          min={1}
          max={3650}
          step={1}
          label="Conversation retention (days)"
          placeholder="90"
          hint="Optional override between 1 and 3650 days (blank uses server default)."
          disabled={disabled}
          value={values.retentionDays}
          error={errors.retentionDays}
          onChange={(event) => updateField('retentionDays', event.target.value)}
        />
      </div>

      <OpeningHoursEditor
        value={values.openingHours}
        onChange={(nextHours) => updateField('openingHours', nextHours)}
        disabled={disabled}
        summaryError={errors.openingHours}
        dayErrors={errors.dayErrors}
      />

      {!readOnly && (
        <div className="business-form__actions">
          {onCancel && (
            <Button variant="ghost" disabled={isSubmitting} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="secondary" disabled={isSubmitting} onClick={handleReset}>
            Reset
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {mode === 'create'
              ? isSubmitting
                ? 'Creating business...'
                : 'Create business'
              : isSubmitting
                ? 'Saving changes...'
                : 'Save changes'}
          </Button>
        </div>
      )}
    </form>
  );
}

