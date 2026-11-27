import {
  Building2,
  GraduationCap,
  HeartPulse,
  Hotel,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { INDUSTRY_SOLUTIONS } from '../data/landing'

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  hospitality: Hotel,
  healthcare: HeartPulse,
  retail: ShoppingBag,
  education: GraduationCap,
  other: Building2,
}

export function IndustrySolutions() {
  const [selectedId, setSelectedId] = useState(INDUSTRY_SOLUTIONS[0].id)
  const active =
    INDUSTRY_SOLUTIONS.find((item) => item.id === selectedId) ?? INDUSTRY_SOLUTIONS[0]
  const ActiveIcon = INDUSTRY_ICONS[active.id] ?? Building2

  return (
    <section id="solutions" className="bg-navy-900 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">
            Industry Solutions
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Designed for service-driven teams
          </h2>
          <p className="mt-4 text-base text-slate-300">
            Each tenant workspace adapts to your industry’s policies, terminology, and
            escalation workflows.
          </p>
        </div>

        {/* Industry selector tabs */}
        <div
          role="tablist"
          aria-label="Industry solutions"
          className="mt-10 flex flex-wrap justify-center gap-2.5"
        >
          {INDUSTRY_SOLUTIONS.map((solution) => {
            const Icon = INDUSTRY_ICONS[solution.id] ?? Building2
            const isSelected = solution.id === active.id
            return (
              <button
                key={solution.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedId(solution.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all ${
                  isSelected
                    ? 'border-white bg-white text-navy-900 shadow-sm'
                    : 'border-indigo-400/25 bg-navy-800/80 text-slate-300 hover:border-electric-400/50 hover:text-white'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-electric-400'}`}
                />
                <span>{solution.industry}</span>
              </button>
            )
          })}
        </div>

        {/* Active industry detail card */}
        <div
          role="tabpanel"
          className="mt-8 rounded-2xl border border-indigo-400/20 bg-navy-800/75 p-6 shadow-xl shadow-navy-950/50 sm:p-8 lg:p-10"
        >
          <div className="grid items-start gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <ActiveIcon className="h-5 w-5" />
                </span>
                <h3 className="text-2xl font-bold text-white">{active.industry}</h3>
              </div>

              <p className="mt-4 text-base leading-relaxed text-slate-300">{active.summary}</p>

              <ul className="mt-6 space-y-3">
                {active.useCases.map((useCase) => (
                  <li key={useCase} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-electric-400" />
                    <span>{useCase}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-xl border border-sky-400/25 bg-navy-950/90 p-5 text-white shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-wider text-electric-400">
                  Example Grounded Inquiry
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-200">
                  {active.examplePrompt}
                </p>
                <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
                  Answered using tenant-specific knowledge chunks &amp; configured escalation rules.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
