import {
  ArrowRight,
  Bot,
  Database,
  MessageSquare,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { BRANDING } from '../config/branding'

export function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden bg-navy-950 pb-20 pt-28 text-white sm:pb-24 sm:pt-32 lg:pb-28 lg:pt-36"
    >
      {/* Subtle cosmic radial glow & perspective grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[540px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/18 blur-3xl animate-pulse-glow"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-1/4 h-[340px] w-[340px] rounded-full bg-sky-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.045)_1px,transparent_1px)] bg-[size:52px_52px]"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          {/* Left column: headline and CTAs */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-navy-800/90 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-slate-200">
              <span className="h-2 w-2 rounded-full bg-electric-400 shadow-[0_0_8px_#38BDF8]" />
              <span>{BRANDING.tagline}</span>
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              AI-Powered Business Automation &amp;{' '}
              <span className="bg-gradient-to-r from-electric-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                Customer Engagement
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {BRANDING.name} brings together grounded RAG knowledge bases, configurable AI
              assistants, and tool-connected workflows in a multi-tenant platform built for real
              business operations.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href={BRANDING.dashboard.getStartedHref}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-navy-900 shadow-lg shadow-navy-950/60 transition-all hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-navy-800/80 px-7 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-electric-400/60 hover:text-white"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-5 text-xs text-slate-400">
              Multi-tenant architecture • Source-grounded RAG • Designed for controlled tool
              execution
            </p>
          </div>

          {/* Right column: AI Platform Visualization */}
          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-indigo-400/25 bg-[#080E1E]/95 p-5 shadow-2xl shadow-navy-950/95 backdrop-blur-sm sm:p-6 animate-float-slow">
              <div className="flex items-center justify-between border-b border-indigo-400/15 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-electric-400">
                    <Bot className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {BRANDING.name} Orchestration Flow
                    </p>
                    <p className="text-xs text-slate-400">
                      Illustrative platform architecture
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                  Tenant Isolated
                </span>
              </div>

              <div className="mt-5 space-y-3.5">
                {/* Layer 1: Customer Inquiry */}
                <div className="flex items-start gap-3 rounded-xl border border-indigo-400/20 bg-navy-950/90 p-3.5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-electric-400">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-electric-400">
                        1. Customer Channel
                      </span>
                      <span className="text-[11px] text-slate-400">Web Widget / Portal</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-200">
                      “Can I reschedule my booking for Friday morning and confirm the policy?”
                    </p>
                  </div>
                </div>

                {/* Layer 2: RAG + Guardrails */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-indigo-400/25 bg-indigo-950/45 p-3.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
                      <Database className="h-4 w-4 text-electric-400" />
                      <span>2. RAG Knowledge</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Retrieves verified tenant policies &amp; service rules from vector storage.
                    </p>
                  </div>

                  <div className="rounded-xl border border-indigo-400/20 bg-navy-950/90 p-3.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <ShieldCheck className="h-4 w-4 text-indigo-400" />
                      <span>3. Guardrails &amp; Validation</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Validates intent, tenant scope, and permissions before acting.
                    </p>
                  </div>
                </div>

                {/* Layer 3: Tool & Agent Execution */}
                <div className="flex items-start gap-3 rounded-xl border border-sky-400/30 bg-gradient-to-r from-indigo-600/20 via-sky-500/10 to-navy-900 p-3.5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                        4. Tool Execution &amp; Response
                      </span>
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                        MCP Ready
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-200">
                      Checks calendar availability via scoped tool adapter and replies with
                      source-backed confirmation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
