import { Mail, X } from 'lucide-react'
import { useState } from 'react'
import { BRANDING } from '../config/branding'
import { NAV_ITEMS } from '../data/landing'
import { Logo } from './Logo'

type LegalModalType = 'privacy' | 'terms' | null

export function Footer() {
  const [legalModal, setLegalModal] = useState<LegalModalType>(null)

  return (
    <footer className="bg-navy-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <Logo variant="light" />
            <p className="mt-3 text-sm font-medium text-indigo-300">{BRANDING.tagline}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
              {BRANDING.productType}. Built with multi-tenant isolation and grounded AI workflows.
            </p>
          </div>

          {/* Product links */}
          <div className="md:col-span-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Product</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-slate-400 transition-colors hover:text-white"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#how-it-works"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a href="#preview" className="text-slate-400 transition-colors hover:text-white">
                  Product Preview
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Legal */}
          <div className="md:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Contact</h3>
            <div className="mt-4 space-y-3 text-sm">
              <a
                href={`mailto:${BRANDING.contactEmail}`}
                className="inline-flex items-center gap-2 text-slate-300 transition-colors hover:text-white"
              >
                <Mail className="h-4 w-4 text-indigo-400" />
                <span>{BRANDING.contactEmail}</span>
              </a>
              <p className="text-xs text-slate-500">
                Questions about early access, architecture, or partnerships? Reach out by email.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-slate-800 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>
            &copy; {new Date().getFullYear()} {BRANDING.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="transition-colors hover:text-slate-300"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="transition-colors hover:text-slate-300"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </div>

      {/* Lightweight modal for Privacy & Terms on the single Home Page */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-navy-900 p-6 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 id="legal-modal-title" className="text-lg font-bold text-white">
                {legalModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
              </h4>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
              {legalModal === 'privacy' ? (
                <>
                  <p>
                    This public {BRANDING.name} website does not collect personal data or run
                    third-party advertising trackers.
                  </p>
                  <p>
                    If you contact us at{' '}
                    <a
                      href={`mailto:${BRANDING.contactEmail}`}
                      className="text-indigo-300 underline"
                    >
                      {BRANDING.contactEmail}
                    </a>
                    , your message is used solely to respond to your inquiry. Full platform
                    privacy terms will accompany dashboard onboarding.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {BRANDING.name} is an evolving AI-powered business automation and customer
                    engagement platform. Features marked as Planned or In Development represent
                    active roadmap items rather than currently available services.
                  </p>
                  <p>
                    For early access inquiries or terms questions, contact{' '}
                    <a
                      href={`mailto:${BRANDING.contactEmail}`}
                      className="text-indigo-300 underline"
                    >
                      {BRANDING.contactEmail}
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  )
}

