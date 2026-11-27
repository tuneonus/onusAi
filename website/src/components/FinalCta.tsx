import { ArrowRight, Mail } from 'lucide-react'
import { BRANDING } from '../config/branding'

export function FinalCta() {
  return (
    <section id="pricing" className="bg-navy-900 py-20 sm:py-24">
      <div id="get-started" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-400/25 bg-navy-800/80 px-6 py-14 text-white shadow-2xl sm:px-12 sm:py-16 lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl"
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">
              Early Access &amp; Onboarding
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to build smarter customer operations with {BRANDING.name}?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              {BRANDING.name} is currently in active development. Workspace tiers and pricing will
              be published at general availability—reach out today for early access or product
              updates.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href={
                  BRANDING.dashboard.isExternalConfigured
                    ? BRANDING.dashboard.getStartedHref
                    : `mailto:${BRANDING.contactEmail}?subject=OnusSync%20Early%20Access`
                }
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-navy-900 shadow-lg transition-all hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>

              <a
                href={`mailto:${BRANDING.contactEmail}?subject=OnusSync%20Inquiry`}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-navy-800 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-electric-400/60 hover:bg-navy-700"
              >
                <Mail className="h-4 w-4 text-electric-400" />
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
