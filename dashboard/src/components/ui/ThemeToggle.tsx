import type { ThemePreference } from '../../hooks/useTheme';
import { Icon, type IconName } from './Icons';
import './ThemeToggle.css';

interface ThemeToggleProps {
  preference: ThemePreference;
  onSelectPreference: (next: ThemePreference) => void;
}

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: IconName;
}> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

export function ThemeToggle({ preference, onSelectPreference }: ThemeToggleProps) {
  return (
    <div className="ui-theme-toggle" role="group" aria-label="Theme preference">
      {THEME_OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className="ui-theme-toggle__btn"
            aria-pressed={active}
            aria-label={`Use ${option.label.toLowerCase()} theme`}
            title={`${option.label} theme`}
            onClick={() => onSelectPreference(option.value)}
          >
            <Icon name={option.icon} size={14} />
            <span className="ui-theme-toggle__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
