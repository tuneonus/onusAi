# OnusSync

OnusSync is an independent AI-Powered Multi-Tenant Business Engagement Platform designed to help businesses answer customer questions, support visitors, and manage engagement through AI-assisted conversations grounded in business knowledge.

The project combines practical AI Engineering learning, technical interview preparation, and the development of a professional working product. ProManage Merlin AI, Chatbase, Intercom Fin, and Botpress serve as capability references; OnusSync has its own identity and implementation.

## Business problem and proposed solution

Businesses often spread product information, policies, and support knowledge across multiple sources. Customers need timely, consistent answers, while teams spend time handling repeated questions and maintaining separate engagement channels.

OnusSync aims to bring business knowledge and customer conversations into a managed platform. Planned capabilities include knowledge-grounded AI answers, an embeddable chat experience, business administration, and controlled integrations with business tools. These capabilities will be introduced incrementally, with validation, security, testing, and observability appropriate to each feature.

## Planned applications and services

| Directory | Planned responsibility |
| --- | --- |
| `website/` | Public product website and marketing information |
| `dashboard/` | Business workspace for managing knowledge, configuration, and engagement |
| `super-admin/` | Platform administration and operational oversight |
| `chat-widget/` | Embeddable customer chat interface |
| `demo-website/` | Demonstration site for the embedded chat experience |
| `backend/` | Business API, authentication, authorization, and business workflows |
| `ai-backend/` | AI workflows, retrieval, model interactions, and AI tool orchestration |
| `packages/` | Shared code and centralized branding configuration, introduced when needed |
| `infrastructure/` | Future deployment and infrastructure configuration |
| `docs/` | Project documentation and technical decisions |

Business logic will remain separate from AI logic, with explicit service interfaces introduced when needed. Product branding will be centralized when application development begins so the product name can be changed consistently.

## Planned technology stack

| Area | Technology |
| --- | --- |
| Frontend | React.js and TypeScript |
| Business backend | Node.js, Express, and TypeScript |
| AI backend | Python and FastAPI |
| Database | PostgreSQL |
| Vector database | Qdrant |
| Cache | Redis |
| LLM | Google Gemini |
| AI frameworks | LangChain and LangGraph |
| Tool integration | Model Context Protocol (MCP) |
| AI monitoring | LangSmith |
| Infrastructure and CI | Docker and GitHub Actions |

These technologies are planned. Dependencies and configuration will be added only as required by an approved development step.

## Root folder structure

```text
.
├── .gitignore
├── AGENTS.md
├── README.md
├── website/
├── dashboard/
├── super-admin/
├── chat-widget/
├── demo-website/
├── backend/
├── ai-backend/
├── packages/
├── infrastructure/
└── docs/
```

Git stores its local repository metadata in `.git/`, which is omitted from this source layout. Application and supporting directories are currently empty; Git does not track empty directories, and no placeholder files have been added.

## Current development status

**Phase 00 — Step 02: Project Foundation.**

- Project instructions are recorded in `AGENTS.md`.
- Git is initialized locally on the `main` branch; no commit has been created.
- The root directory structure, this README, and the root `.gitignore` are in place.
- No frontend or backend applications have been initialized.
- No dependencies, business or AI features, Docker configurations, or CI workflows have been added.
- There is no runnable application or application test suite at this stage.

## Development workflow

Read `AGENTS.md` before making changes. Work proceeds one feature and one approved step at a time. Important commands, dependencies, files, and implementation choices must be explained, and verification results must be reported before a step is declared complete. The next step requires explicit approval.

Environment files and credentials must remain outside version control. The ignore rules permit `.env.example` files throughout the repository; any future examples must contain safe sample values only.

- Official project email: `onussync@gmail.com`
- Lowercase identifier: `onussync`
- Environment variable prefix: `ONUSSYNC_`
