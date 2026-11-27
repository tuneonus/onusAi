# OnusAI Development Instructions

## Project context

OnusAI is an independent AI Business Engagement Platform inspired by ProManage Merlin AI, Chatbase, Intercom Fin, and Botpress. These products are references for capabilities, not sources of branding or proprietary code.

The project has three objectives:

- Develop practical AI Engineering skills.
- Prepare for technical interviews through implementation and explanation.
- Build a professional, working product.

The developer has approximately four years of software development experience. Keep explanations technically useful and code production-oriented, modular, human-readable, and proportionate to the current requirements.

## Planned technology stack

These are planned choices, not instructions to install or initialize them immediately.

| Area | Planned technology |
| --- | --- |
| Frontend | React.js and TypeScript |
| Business backend | Node.js, Express, and TypeScript |
| AI backend | Python and FastAPI |
| Database | PostgreSQL |
| Vector database | Qdrant |
| Cache | Redis |
| LLM | Google Gemini |
| AI frameworks | LangChain and LangGraph |
| Tool integration | MCP |
| AI monitoring | LangSmith |
| Infrastructure | Docker and GitHub Actions |

## Mandatory development workflow

1. Develop one feature at a time, in explicitly approved steps.
2. Never proceed to the next step without the user's approval. Completing a step does not authorize the next one.
3. Limit changes to the approved scope. Do not initialize applications, install dependencies, create folders, or implement future features speculatively.
4. Explain every important command, dependency, file, and implementation: what it does, why it is needed, and relevant tradeoffs. Do not silently execute unexplained setup or architectural changes.
5. At the end of each step, explain what changed, report verification results and any limitations, then stop and wait for approval.
6. Inspect existing work before modifying it. Do not delete existing files without explicit authorization.
7. Never claim implementation success without verification. Distinguish changes made from checks passed, and clearly report failed or unperformed checks.

## Architecture and maintainability

- Keep business logic and AI logic separate. The Node.js backend owns business concerns; the Python backend owns AI workflows. Define clear interfaces when communication between them is needed.
- Keep code modular and human-readable without unnecessary abstractions, dependencies, or boilerplate.
- Introduce infrastructure and frameworks only when required by an approved feature.
- Maintain centralized branding configuration when application development begins, so the product name can be changed later. Avoid scattering product-name literals throughout application code.
- Use only OnusAI branding. Do not introduce branding from other projects or reference products.
- Explain meaningful design decisions and tradeoffs in a way that supports learning and interview preparation.

## Security, validation, and testing

- Follow security and clean coding standards appropriate to each approved change.
- Keep secrets, credentials, and tokens out of source code, logs, and committed files. Introduce environment-based configuration when needed.
- Validate external inputs at system boundaries and return clear errors without leaking sensitive information.
- Apply authentication, authorization, and least-privilege access where the approved feature requires them.
- Treat user input, retrieved content, and model output as untrusted. Validate tool requests and protect business operations when AI integrations are introduced.
- Add meaningful tests for implemented behavior and failure cases, proportionate to the change. Do not add test infrastructure before it is needed.
- Run relevant checks before reporting completion. Report exactly what was verified and what remains unverified.

## Initial approved step

The initial scope is limited to inspecting the workspace, confirming whether it is empty, checking Git initialization status, and creating this `AGENTS.md` file.

Do not initialize applications or Git, install dependencies, create additional folders or files, implement features, or delete existing files during this step. After verifying this file, explain the results and wait for the user's approval of the next step.
