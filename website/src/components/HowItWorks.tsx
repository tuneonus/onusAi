import { BookOpen, Cog, Link2, Zap, type LucideIcon } from 'lucide-react'
import { WORKFLOW_STEPS } from '../data/landing'

const STEP_ICONS: LucideIcon[] = [BookOpen, Cog, Link2, Zap]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-y border-indigo-400/15 bg-navy-950 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">
            How It Works
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From business knowledge to automated workflows
          </h2>
          <p className="mt-4 text-base text-slate-300">
            A clear four-step lifecycle to ground your assistant, connect approved tools, and
            scale customer operations safely.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STEPS.map((item, index) => {
            const Icon = STEP_ICONS[index] ?? Zap
            return (
              <div
                key={item.step}
                className="relative flex flex-col rounded-2xl border border-indigo-400/20 bg-[#080E1E] p-6 shadow-lg shadow-navy-950/60"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 text-electric-400">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-sm font-bold text-indigo-300">
                    Step {item.step}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">
                  {item.description}
                </p>

                <div className="mt-5 border-t border-slate-700/70 pt-3">
                  <span className="text-xs font-semibold text-sky-300">{item.detail}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
