import {
  Bot,
  Cpu,
  Database,
  MessageSquareHeart,
  Plug,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { FEATURES, type CapabilityStatus } from '../data/landing'

const ICON_MAP: Record<string, LucideIcon> = {
  'ai-assistants': Bot,
  rag: Database,
  'ai-agents': Cpu,
  'business-automation': Workflow,
  'customer-engagement': MessageSquareHeart,
  integrations: Plug,
}

const STATUS_STYLE: Record<CapabilityStatus, string> = {
  'Core Capability': 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  'In Development': 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  Planned: 'border-indigo-400/30 bg-indigo-500/10 text-indigo-300',
}

export function Features() {
  return (
    <section id="features" className="relative bg-navy-900 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">
            Platform Capabilities
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Built for reliable AI operations
          </h2>
          <p className="mt-4 text-base text-slate-300">
            Core foundations are designed around multi-tenant isolation and grounded retrieval,
            with agentic automation and integrations rolling out in structured phases.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = ICON_MAP[feature.id] ?? Bot
            return (
              <article
                key={feature.id}
                className="group flex flex-col rounded-2xl border border-indigo-400/20 bg-navy-800/75 p-6 shadow-lg shadow-navy-950/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-electric-400/45 hover:bg-navy-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-400/25 bg-navy-900 text-electric-400 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[feature.status]}`}
                  >
                    {feature.status}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold text-white">{feature.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">
                  {feature.description}
                </p>

                <ul className="mt-5 space-y-2 border-t border-slate-700/70 pt-4">
                  {feature.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-center gap-2 text-xs font-medium text-slate-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-electric-400" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
