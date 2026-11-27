import { BRANDING } from '../config/branding'

interface LogoProps {
  variant?: 'light' | 'dark'
  className?: string
}

export function Logo({ variant = 'dark', className = '' }: LogoProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-slate-900'

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="9" fill="#060A17" />
        <rect
          x="1"
          y="1"
          width="34"
          height="34"
          rx="8"
          stroke="#6366F1"
          strokeOpacity="0.45"
          strokeWidth="1.5"
        />
        <circle cx="13" cy="18" r="5" stroke="#38BDF8" strokeWidth="2.2" />
        <circle cx="23" cy="18" r="5" stroke="#FFFFFF" strokeWidth="2.2" />
        <path
          d="M16.5 14.5L19.5 21.5"
          stroke="#818CF8"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className={`font-display text-lg font-bold tracking-tight ${textColor}`}>
        {BRANDING.name}
      </span>
    </span>
  )
}

