export type CapabilityStatus = 'Core Capability' | 'In Development' | 'Planned'

export interface NavItem {
  label: string
  href: string
}

export interface FeatureItem {
  id: string
  title: string
  description: string
  status: CapabilityStatus
  highlights: string[]
}

export interface WorkflowStep {
  step: string
  title: string
  description: string
  detail: string
}

export interface IndustrySolution {
  id: string
  industry: string
  summary: string
  useCases: string[]
  examplePrompt: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Pricing', href: '#pricing' },
]

export const FEATURES: FeatureItem[] = [
  {
    id: 'ai-assistants',
    title: 'AI Assistants',
    description:
      'Deploy multi-tenant conversational assistants tailored to each business workspace, tone, and operational boundary.',
    status: 'Core Capability',
    highlights: ['Tenant-isolated configuration', 'Guided brand persona & guardrails'],
  },
  {
    id: 'rag',
    title: 'Retrieval-Augmented Generation (RAG)',
    description:
      'Ground every answer in your verified documents, FAQs, policies, and catalogs using semantic vector retrieval.',
    status: 'Core Capability',
    highlights: ['Document & knowledge indexing', 'Source-grounded responses'],
  },
  {
    id: 'ai-agents',
    title: 'AI Agents',
    description:
      'Move beyond static Q&A with stateful agent workflows that reason across context, validate inputs, and execute tasks.',
    status: 'In Development',
    highlights: ['Multi-step workflow orchestration', 'Human-in-the-loop handoff'],
  },
  {
    id: 'business-automation',
    title: 'Business Automation',
    description:
      'Automate repetitive intake, routing, scheduling, and follow-up operations without writing brittle glue code.',
    status: 'Planned',
    highlights: ['Event-driven triggers', 'Approval & escalation rules'],
  },
  {
    id: 'customer-engagement',
    title: 'Customer Engagement',
    description:
      'Deliver responsive, consistent support and lead capture experiences across web widgets and customer touchpoints.',
    status: 'In Development',
    highlights: ['Embeddable web chat widget', 'Unified conversation history'],
  },
  {
    id: 'integrations',
    title: 'Integrations & Tooling',
    description:
      'Connect assistants to internal APIs, CRMs, and Model Context Protocol (MCP) tools with strict permission controls.',
    status: 'Planned',
    highlights: ['MCP-ready tool adapters', 'Scoped API credentials'],
  },
]

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: '01',
    title: 'Connect Business Knowledge',
    description:
      'Upload policies, service catalogs, SOPs, and help articles into an isolated tenant knowledge base.',
    detail: 'Indexed for semantic retrieval',
  },
  {
    step: '02',
    title: 'Configure AI Assistants',
    description:
      'Define assistant behavior, response boundaries, escalation rules, and workspace branding.',
    detail: 'Tailored to your operations',
  },
  {
    step: '03',
    title: 'Connect Tools',
    description:
      'Authorize business APIs, booking endpoints, and MCP tools so assistants can act safely on verified requests.',
    detail: 'Least-privilege tool access',
  },
  {
    step: '04',
    title: 'Automate Operations',
    description:
      'Launch across customer channels to resolve inquiries, capture structured requests, and streamline workflows.',
    detail: 'Continuous monitoring & control',
  },
]

export const INDUSTRY_SOLUTIONS: IndustrySolution[] = [
  {
    id: 'hospitality',
    industry: 'Hospitality',
    summary:
      'Handle guest inquiries around check-in policies, amenities, local recommendations, and booking requests around the clock.',
    useCases: [
      'Room & amenity Q&A grounded in property guides',
      'Pre-arrival concierge & policy assistance',
      'Structured special-request intake for front desk teams',
    ],
    examplePrompt: '“What time is late check-out available, and do you offer airport shuttle pickup?”',
  },
  {
    id: 'healthcare',
    industry: 'Healthcare',
    summary:
      'Guide patients through clinic hours, preparation instructions, insurance FAQs, and appointment routing with clear guardrails.',
    useCases: [
      'Non-diagnostic clinic & preparation guidance',
      'Department & specialist routing workflows',
      'Strict policy boundaries with human escalation',
    ],
    examplePrompt: '“Which documents should I bring for my first physical therapy visit?”',
  },
  {
    id: 'retail',
    industry: 'Retail & E-Commerce',
    summary:
      'Help shoppers compare products, check return policies, and resolve order questions using up-to-date catalog knowledge.',
    useCases: [
      'Catalog & specification discovery via RAG',
      'Return, warranty, and shipping policy clarity',
      'Guided escalation for order modifications',
    ],
    examplePrompt: '“Do you have waterproof trail shoes in stock, and what is your 30-day return policy?”',
  },
  {
    id: 'education',
    industry: 'Education',
    summary:
      'Support prospective students, learners, and staff with admissions timelines, course prerequisites, and campus resources.',
    useCases: [
      'Admissions & enrollment deadline assistance',
      'Course syllabus & prerequisite lookup',
      'Student services & advising triage',
    ],
    examplePrompt: '“What are the prerequisites for the Data Engineering certificate program?”',
  },
  {
    id: 'other',
    industry: 'Professional & Other Businesses',
    summary:
      'Adaptable multi-tenant workspaces for agencies, SaaS teams, and service providers looking to standardize support and intake.',
    useCases: [
      'Client onboarding & SOP knowledge assistants',
      'Service tier & scope qualification',
      'Internal team knowledge search',
    ],
    examplePrompt: '“How does your onboarding timeline work for multi-location teams?”',
  },
]

