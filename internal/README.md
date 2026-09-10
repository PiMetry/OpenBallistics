# Internal workspace

This directory holds local TODOs, plans, research and the project knowledge base. Everything
under `internal/` is ignored by Git and is not included in clones or website builds.

- [Active TODOs](todo/README.md): prioritized work and completed-work references.
- [Original cleanup requests](todo/cleanup-notes.md): preserved user notes; not the current task status.
- [Knowledge base](docs/README.md): implementation decisions, workflows and source research.

Keep new TODOs here rather than creating planning files at the repository root. Record findings
and decisions in the knowledge base. Source code, public JSON records and test fixtures belong
in their existing tracked directories. Do not store secrets in the knowledge base.

Plan changes before executing them. Delegate independent work when useful, preserve unrelated
workspace changes, and validate the affected workflows before reporting completion.
