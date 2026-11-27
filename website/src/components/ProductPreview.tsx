import { Bot, Database, LayoutDashboard, Shield, Workflow } from 'lucide-react'
import { useState } from 'react'
import { BRANDING } from '../config/branding'

type PreviewTab = 'overview' | 'knowledge' | 'assistants' | 'workflows'

const PREVIEW_TABS: { id: PreviewTab; label: string }[] = [
  { id: 'overview', label: 'Workspace Overview' },
  { id: 'knowledge', label: 'Knowledge Base' },
  { id: 'assistants', label: 'AI Assistants' },
  { id: 'workflows', label: 'Automation Rules' },
]

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('overview')

  return (
    <section
      id="preview"
      className="border-y border-indigo-400/15 bg-navy-950 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-electric-400">
            Product Preview
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            One workspace to manage knowledge, assistants, and tools
          </h2>
          <p className="mt-4 text-base text-slate-300">
            An illustrative preview of the {BRANDING.name} multi-tenant dashboard experience
            currently being built for business teams.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-indigo-400/25 bg-[#080E1E] shadow-2xl shadow-navy-950/90">
          {/* Window chrome */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-400/15 bg-navy-950 px-4 py-3 text-white sm:px-6">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
              <span className="ml-2 text-xs font-medium text-slate-300">
                {BRANDING.name} Workspace — Illustrative Preview
              </span>
            </div>
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
              Preview Concept
            </span>
          </div>

          <div className="grid lg:grid-cols-12">
            {/* Sidebar */}
            <aside className="border-b border-indigo-400/15 bg-[#060B18] p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tenant Modules
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 lg:flex-col">
                {PREVIEW_TABS.map((tab) => {
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors sm:text-sm ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </aside>

            {/* Main illustrative canvas */}
            <div className="p-6 sm:p-8 lg:col-span-9">
              {activeTab === 'overview' && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <LayoutDashboard className="h-5 w-5 text-electric-400" />
                      <h3 className="text-lg font-bold text-white">
                        Multi-Tenant Control Plane
                      </h3>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      Illustrative layout
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Centralized view for managing isolated tenant workspaces, knowledge indexing
                    pipelines, and assistant guardrails.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-4">
                      <p className="text-xs font-semibold text-electric-400">Knowledge Isolation</p>
                      <p className="mt-1.5 text-sm font-bold text-white">
                        Per-Tenant Collections
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Scoped vector retrieval boundaries
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-4">
                      <p className="text-xs font-semibold text-electric-400">Assistant Runtime</p>
                      <p className="mt-1.5 text-sm font-bold text-white">
                        Grounded Responses
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Policy &amp; citation-backed replies
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-4">
                      <p className="text-xs font-semibold text-electric-400">Tool Governance</p>
                      <p className="mt-1.5 text-sm font-bold text-white">
                        Least-Privilege Access
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Validated inputs before execution
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'knowledge' && (
                <div>
                  <div className="flex items-center gap-2.5">
                    <Database className="h-5 w-5 text-electric-400" />
                    <h3 className="text-lg font-bold text-white">
                      RAG Knowledge Pipeline
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Ingest business documentation, chunk content cleanly, and keep vector indexes
                    synchronized per tenant.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    {[
                      'Service Catalog & Pricing Guidelines.pdf',
                      'Customer Support Escalation Policy.md',
                      'Onboarding & Operations FAQ.docx',
                    ].map((doc) => (
                      <div
                        key={doc}
                        className="flex items-center justify-between rounded-xl border border-slate-700/80 bg-navy-900/90 px-4 py-3"
                      >
                        <span className="text-sm font-medium text-slate-200">{doc}</span>
                        <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                          Source Example
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'assistants' && (
                <div>
                  <div className="flex items-center gap-2.5">
                    <Bot className="h-5 w-5 text-electric-400" />
                    <h3 className="text-lg font-bold text-white">
                      Assistant Configuration &amp; Guardrails
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Define persona, allowed topics, fallback behavior, and human handoff triggers
                    for each customer-facing assistant.
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Shield className="h-4 w-4 text-electric-400" />
                        <span>Boundary Enforcement</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        Assistants decline out-of-scope requests and escalate sensitive operations to
                        human staff.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Bot className="h-4 w-4 text-electric-400" />
                        <span>Channel-Ready Widget</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        Embeddable web chat experience aligned with your business branding.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'workflows' && (
                <div>
                  <div className="flex items-center gap-2.5">
                    <Workflow className="h-5 w-5 text-electric-400" />
                    <h3 className="text-lg font-bold text-white">
                      Planned Automation &amp; MCP Tooling
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Connect structured tool calls so agents can verify availability, log requests,
                    and trigger downstream business workflows.
                  </p>
                  <div className="mt-5 rounded-xl border border-dashed border-indigo-400/40 bg-indigo-950/40 p-4 text-xs leading-relaxed text-indigo-200">
                    <strong>Roadmap Note:</strong> Autonomous multi-step workflows and external MCP
                    connectors are planned capabilities and will roll out incrementally with strict
                    schema validation.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
