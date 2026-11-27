import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../utils/cn';
import '../ui/FormField.css';
import { Icon } from '../ui/Icons';
import './TimezoneField.css';
import { filterTimezones } from './timezoneUtils';

interface TimezoneFieldProps {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

export function TimezoneField({
  id,
  label = 'Timezone (IANA)',
  value,
  onChange,
  error,
  hint = 'Search by region or city, e.g. America/New_York or Asia/Kolkata.',
  required,
  disabled = false,
}: TimezoneFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const activeQuery = filterQuery ?? value;
  const { matches, totalMatches } = filterTimezones(activeQuery);
  const safeHighlightIndex =
    matches.length === 0 ? -1 : Math.min(highlightedIndex, matches.length - 1);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleOutsidePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFilterQuery(null);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointerDown);
    return () => document.removeEventListener('mousedown', handleOutsidePointerDown);
  }, [isOpen]);

  const selectZone = (zone: string) => {
    onChange(zone);
    setIsOpen(false);
    setFilterQuery(null);
    setHighlightedIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (matches.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % matches.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(Math.max(0, matches.length - 1));
        return;
      }
      if (matches.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? matches.length - 1 : prev - 1));
      }
      return;
    }

    if (event.key === 'Enter' && isOpen && safeHighlightIndex >= 0) {
      event.preventDefault();
      const chosen = matches[safeHighlightIndex];
      if (chosen) {
        selectZone(chosen);
      }
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setFilterQuery(null);
      return;
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
      setFilterQuery(null);
    }
  };

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined;

  const activeDescendant =
    isOpen && safeHighlightIndex >= 0
      ? `${listboxId}-opt-${safeHighlightIndex}`
      : undefined;

  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
        {required && (
          <span className="ui-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div ref={containerRef} className="tz-combobox">
        <div className="ui-field__input-wrap">
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            required={required}
            disabled={disabled}
            placeholder="America/New_York"
            className={cn(
              'ui-field__input',
              'ui-field__input--with-end',
              Boolean(error) && 'ui-field__input--error',
            )}
            value={value}
            onFocus={() => {
              if (!disabled) {
                setIsOpen(true);
                setFilterQuery('');
                setHighlightedIndex(0);
              }
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              onChange(nextValue);
              setFilterQuery(nextValue);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />

          <div className="ui-field__end-slot">
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={isOpen ? 'Close timezone options' : 'Open timezone options'}
              className={cn(
                'tz-combobox__trigger-btn',
                isOpen && 'tz-combobox__trigger-btn--open',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                if (disabled) {
                  return;
                }
                if (isOpen) {
                  setIsOpen(false);
                  setFilterQuery(null);
                } else {
                  setIsOpen(true);
                  setFilterQuery('');
                  setHighlightedIndex(0);
                  inputRef.current?.focus();
                }
              }}
            >
              <Icon name="chevronDown" size={15} />
            </button>
          </div>
        </div>

        {isOpen && !disabled && (
          <div className="tz-combobox__popover">
            {matches.length === 0 ? (
              <div className="tz-combobox__empty">
                No matching IANA timezone. Try &quot;America/New_York&quot; or &quot;UTC&quot;.
              </div>
            ) : (
              <>
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label="IANA timezones"
                  className="tz-combobox__list"
                >
                  {matches.map((zone, index) => {
                    const selected = zone === value.trim();
                    const active = index === safeHighlightIndex;
                    return (
                      <li
                        key={zone}
                        id={`${listboxId}-opt-${index}`}
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          'tz-combobox__option',
                          active && 'tz-combobox__option--active',
                          selected && 'tz-combobox__option--selected',
                        )}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectZone(zone);
                        }}
                      >
                        <span>{zone}</span>
                        {selected && <Icon name="check" size={14} />}
                      </li>
                    );
                  })}
                </ul>
                {totalMatches > matches.length && (
                  <div className="tz-combobox__footer">
                    Showing {matches.length} of {totalMatches} matches — type to narrow
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {hint && (
        <span id={hintId} className="ui-field__hint">
          {hint}
        </span>
      )}

      {error && (
        <span id={errorId} role="alert" className="ui-field__error">
          {error}
        </span>
      )}
    </div>
  );
}
