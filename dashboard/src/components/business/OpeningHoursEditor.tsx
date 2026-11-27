import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type DayOpeningHours,
  type WeeklyOpeningHours,
} from '../../types/schedule';
import {
  buildDefaultOpeningHours,
  DAY_LABELS,
  isOvernightShift,
} from '../../validation/common';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import './OpeningHoursEditor.css';

interface OpeningHoursEditorProps {
  value: WeeklyOpeningHours | null;
  onChange: (next: WeeklyOpeningHours | null) => void;
  disabled?: boolean;
  summaryError?: string;
  dayErrors?: Partial<Record<DayOfWeek, string>>;
}

export function OpeningHoursEditor({
  value,
  onChange,
  disabled = false,
  summaryError,
  dayErrors,
}: OpeningHoursEditorProps) {
  const handleUpdateDay = (day: DayOfWeek, nextDay: DayOpeningHours) => {
    if (!value) {
      return;
    }

    onChange({
      ...value,
      [day]: nextDay,
    });
  };

  return (
    <div className="hours-editor">
      <div className="hours-editor__header">
        <div>
          <div className="hours-editor__title">Weekly Opening Hours</div>
          <p className="hours-editor__subtitle">
            24-hour schedule. Overnight shifts (close earlier than open) cannot overlap the next day.
          </p>
        </div>

        {!disabled && (
          value ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange(null)}
            >
              Clear schedule
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange(buildDefaultOpeningHours())}
            >
              Set weekly hours
            </Button>
          )
        )}
      </div>

      {summaryError && (
        <Alert tone="danger" title="Opening hours validation">
          {summaryError}
        </Alert>
      )}

      {!value ? (
        <p className="hours-editor__subtitle">
          No opening hours configured yet.
        </p>
      ) : (
        <div className="hours-editor__rows">
          {DAYS_OF_WEEK.map((day) => {
            const entry = value[day];
            const rowError = dayErrors?.[day];
            const overnight = isOvernightShift(entry);

            return (
              <div key={day} className="hours-editor__row">
                <span className="hours-editor__day">{DAY_LABELS[day]}</span>

                <label className="hours-editor__closed-toggle">
                  <input
                    type="checkbox"
                    checked={entry.closed}
                    disabled={disabled}
                    onChange={(event) => {
                      if (event.target.checked) {
                        handleUpdateDay(day, { closed: true });
                      } else {
                        handleUpdateDay(day, { closed: false, open: '09:00', close: '17:00' });
                      }
                    }}
                  />
                  <span>Closed</span>
                </label>

                {entry.closed ? (
                  <span className="hours-editor__closed-label">Closed all day</span>
                ) : (
                  <div className="hours-editor__times">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]} opening time`}
                      className="hours-editor__time-input"
                      disabled={disabled}
                      value={entry.open}
                      onChange={(event) =>
                        handleUpdateDay(day, {
                          closed: false,
                          open: event.target.value,
                          close: entry.close,
                        })
                      }
                    />
                    <span className="hours-editor__sep">to</span>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]} closing time`}
                      className="hours-editor__time-input"
                      disabled={disabled}
                      value={entry.close}
                      onChange={(event) =>
                        handleUpdateDay(day, {
                          closed: false,
                          open: entry.open,
                          close: event.target.value,
                        })
                      }
                    />
                    {overnight && <Badge tone="info">Overnight</Badge>}
                  </div>
                )}

                {rowError && (
                  <span role="alert" className="hours-editor__row-error">
                    {rowError}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
