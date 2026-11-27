import { useState, type FormEvent } from 'react';
import { OpeningHoursEditor } from '../../../components/business/OpeningHoursEditor';
import { TimezoneField } from '../../../components/business/TimezoneField';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { ApiClientError } from '../../../services/api/client';
import type {
  BusinessLocation,
  CreateLocationPayload,
  LocationAddressFormValues,
  LocationFormValues,
  UpdateLocationPayload,
} from '../types';
import {
  buildLocationPatchPayload,
  createEmptyAddressFormValues,
  createEmptyLocationFormValues,
  locationToFormValues,
  validateLocationForm,
  type LocationFormErrors,
} from '../validation';
import './LocationForm.css';

interface LocationFormProps {
  mode: 'create' | 'edit';
  initialLocation?: BusinessLocation | null;
  defaultTimezone?: string;
  readOnly?: boolean;
  onCreateSubmit?: (payload: CreateLocationPayload) => Promise<void>;
  onUpdateSubmit?: (payload: UpdateLocationPayload) => Promise<void>;
  onCancel: () => void;
}

export function LocationForm({
  mode,
  initialLocation = null,
  defaultTimezone = '',
  readOnly = false,
  onCreateSubmit,
  onUpdateSubmit,
  onCancel,
}: LocationFormProps) {
  const [values, setValues] = useState<LocationFormValues>(() =>
    mode === 'edit' && initialLocation
      ? locationToFormValues(initialLocation, defaultTimezone)
      : createEmptyLocationFormValues(defaultTimezone),
  );
  const [errors, setErrors] = useState<LocationFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isArchived = Boolean(initialLocation?.archivedAt);
  const disabled = readOnly || isArchived || isSubmitting;

  const updateField = <K extends keyof LocationFormValues>(
    field: K,
    value: LocationFormValues[K],
  ) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setSubmitError(null);
    setInfoNotice(null);

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

  const updateAddressField = <K extends keyof LocationAddressFormValues>(
    field: K,
    value: string,
  ) => {
    setValues((previous) => ({
      ...previous,
      address: { ...previous.address, [field]: value },
    }));
    setSubmitError(null);
    setInfoNotice(null);

    if (errors.address?.[field]) {
      setErrors((previous) => ({
        ...previous,
        address: { ...previous.address, [field]: undefined },
      }));
    }
  };

  const handleToggleAddress = (enabled: boolean) => {
    setValues((previous) => ({
      ...previous,
      includeAddress: enabled,
      address: enabled ? previous.address : createEmptyAddressFormValues(),
    }));
    setErrors((previous) => ({ ...previous, address: undefined }));
    setSubmitError(null);
    setInfoNotice(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readOnly || isArchived) {
      return;
    }

    setSubmitError(null);
    setInfoNotice(null);

    const validation = validateLocationForm(values);
    setErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    if (mode === 'edit' && initialLocation) {
      const patch = buildLocationPatchPayload(initialLocation, validation.payload);

      if (Object.keys(patch).length === 0) {
        setInfoNotice('No changes detected. Update a field before saving.');
        return;
      }

      setIsSubmitting(true);
      try {
        await onUpdateSubmit?.(patch);
      } catch (error) {
        setSubmitError(
          error instanceof ApiClientError
            ? error.message
            : 'Unable to update location.',
        );
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateSubmit?.(validation.payload);
    } catch (error) {
      setSubmitError(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to create location.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="location-form" onSubmit={handleSubmit} noValidate>
      {isArchived && (
        <Alert tone="warning" title="Archived location">
          Archived locations are read-only and cannot be edited. Owners may create a new active
          location with the same name if needed.
        </Alert>
      )}

      {!isArchived && readOnly && (
        <Alert tone="info" title="Read-only operator access">
          Only business owners can create, edit, or archive locations.
        </Alert>
      )}

      {infoNotice && (
        <Alert tone="info" title="No changes to save">
          {infoNotice}
        </Alert>
      )}

      {submitError && (
        <Alert tone="danger" title={mode === 'create' ? 'Failed to create location' : 'Failed to update location'}>
          {submitError}
        </Alert>
      )}

      <div className="location-form__grid">
        <FormField
          id={`${mode}-location-name`}
          label="Location name"
          placeholder="Downtown Clinic"
          required
          disabled={disabled}
          value={values.name}
          error={errors.name}
          onChange={(event) => updateField('name', event.target.value)}
        />

        <TimezoneField
          id={`${mode}-location-timezone`}
          label="Location timezone (IANA)"
          required
          disabled={disabled}
          value={values.timezone}
          error={errors.timezone}
          onChange={(nextZone) => updateField('timezone', nextZone)}
        />

        <FormField
          id={`${mode}-location-email`}
          type="email"
          label="Contact email"
          placeholder="downtown@business.example"
          disabled={disabled}
          value={values.contactEmail}
          error={errors.contactEmail}
          onChange={(event) => updateField('contactEmail', event.target.value)}
        />

        <FormField
          id={`${mode}-location-phone`}
          type="tel"
          label="Contact phone"
          placeholder="+1 (555) 010-2001"
          disabled={disabled}
          value={values.contactPhone}
          error={errors.contactPhone}
          onChange={(event) => updateField('contactPhone', event.target.value)}
        />
      </div>

      <div className="location-form__address-box">
        <div className="location-form__address-header">
          <div>
            <div className="location-form__address-title">Physical Address</div>
            <p className="location-form__address-subtitle">
              Optional street address, locality, and 2-letter ISO country code.
            </p>
          </div>

          {!disabled && (
            values.includeAddress ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleToggleAddress(false)}
              >
                Remove address
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleToggleAddress(true)}
              >
                Add address
              </Button>
            )
          )}
        </div>

        {!values.includeAddress ? (
          <p className="location-form__address-subtitle">
            No physical address configured for this location.
          </p>
        ) : (
          <div className="location-form__grid">
            <div className="location-form__full">
              <FormField
                id={`${mode}-location-line1`}
                label="Address line 1"
                placeholder="450 Market Street"
                required
                disabled={disabled}
                value={values.address.line1}
                error={errors.address?.line1}
                onChange={(event) => updateAddressField('line1', event.target.value)}
              />
            </div>

            <div className="location-form__full">
              <FormField
                id={`${mode}-location-line2`}
                label="Address line 2"
                placeholder="Suite 300 (optional)"
                disabled={disabled}
                value={values.address.line2}
                error={errors.address?.line2}
                onChange={(event) => updateAddressField('line2', event.target.value)}
              />
            </div>

            <FormField
              id={`${mode}-location-city`}
              label="City"
              placeholder="San Francisco"
              required
              disabled={disabled}
              value={values.address.city}
              error={errors.address?.city}
              onChange={(event) => updateAddressField('city', event.target.value)}
            />

            <FormField
              id={`${mode}-location-state`}
              label="State / Region"
              placeholder="CA (optional)"
              disabled={disabled}
              value={values.address.stateRegion}
              error={errors.address?.stateRegion}
              onChange={(event) => updateAddressField('stateRegion', event.target.value)}
            />

            <FormField
              id={`${mode}-location-postal`}
              label="Postal code"
              placeholder="94105 (optional)"
              disabled={disabled}
              value={values.address.postalCode}
              error={errors.address?.postalCode}
              onChange={(event) => updateAddressField('postalCode', event.target.value)}
            />

            <FormField
              id={`${mode}-location-country`}
              label="Country code (2-letter ISO)"
              placeholder="US"
              maxLength={2}
              required
              disabled={disabled}
              value={values.address.countryCode}
              error={errors.address?.countryCode}
              onChange={(event) =>
                updateAddressField('countryCode', event.target.value.toUpperCase())
              }
            />
          </div>
        )}
      </div>

      <OpeningHoursEditor
        value={values.openingHours}
        onChange={(nextHours) => updateField('openingHours', nextHours)}
        disabled={disabled}
        summaryError={errors.openingHours}
        dayErrors={errors.dayErrors}
      />

      <div className="location-form__actions">
        <Button variant="secondary" disabled={isSubmitting} onClick={onCancel}>
          {disabled && !isSubmitting ? 'Close' : 'Cancel'}
        </Button>
        {!disabled && (
          <Button type="submit" loading={isSubmitting}>
            {mode === 'create'
              ? isSubmitting
                ? 'Creating location...'
                : 'Create location'
              : isSubmitting
                ? 'Saving changes...'
                : 'Save changes'}
          </Button>
        )}
      </div>
    </form>
  );
}

