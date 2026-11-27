import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { BRANDING } from '../config/branding'
import { NAV_ITEMS } from '../data/landing'
import { Logo } from './Logo'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMenu = () => setMobileOpen(false)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between rounded-full border border-indigo-400/25 bg-navy-900/85 px-4 py-2.5 shadow-xl shadow-navy-950/80 backdrop-blur-md sm:px-6">
        <a
          href="#home"
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
        >
          <Logo variant="light" />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-electric-400"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={BRANDING.dashboard.signInHref}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign In
          </a>
          <a
            href={BRANDING.dashboard.getStartedHref}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-navy-900 shadow-sm transition-all hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          >
            Get Started
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="inline-flex items-center justify-center rounded-full p-2 text-slate-200 hover:bg-white/10 md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="pointer-events-auto mx-auto mt-2 max-w-6xl rounded-2xl border border-indigo-400/25 bg-navy-900/95 px-4 pb-5 pt-3 shadow-2xl backdrop-blur-md md:hidden">
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-electric-400"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-700/70 pt-4">
            <a
              href={BRANDING.dashboard.signInHref}
              onClick={closeMenu}
              className="rounded-full border border-slate-700 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Sign In
            </a>
            <a
              href={BRANDING.dashboard.getStartedHref}
              onClick={closeMenu}
              className="rounded-full bg-white px-4 py-2.5 text-center text-sm font-semibold text-navy-900 hover:bg-sky-100"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
