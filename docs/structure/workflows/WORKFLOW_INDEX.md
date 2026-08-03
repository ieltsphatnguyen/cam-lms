# Workflow Documentation Index

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

This index is the entry point for workflow documentation. Workflow documents describe **how the system behaves** — the end-to-end behavioural paths that users follow, what state changes occur, what becomes visible, and when.

Workflow documents are distinct from architecture documents. Architecture explains *how the system is built* (tables, RPCs, components, data flows). Workflow explains *how the system behaves* (what happens when a student submits, when a teacher publishes, when a revision is requested).

Workflow documents reference architecture documents rather than duplicating them. Each workflow links to the relevant architecture files for implementation details.

---

## Workflow Documents

| Document | Description |
|----------|-------------|
| [01_Submission_Workflow.md](01_Submission_Workflow.md) | Student receives assignment → opens item → starts attempt → submits → teacher notified → teacher opens submission |
| [02_Grading_Workflow.md](02_Grading_Workflow.md) | Teacher opens submission → annotates → writes feedback → assigns scores → saves draft → publishes feedback |
| [03_Revision_Workflow.md](03_Revision_Workflow.md) | Submission 1 → teacher publishes → teacher requests revision → student notified → new attempt → submission 2 → submission history → repeat cycle |
| [04_Notification_Workflow.md](04_Notification_Workflow.md) | Every notification type: event → RPC → notification row → dashboard → navigation → destination page → expected UI |
| [05_Publishing_Workflow.md](05_Publishing_Workflow.md) | Draft → publish → snapshot creation → student view → teacher edits → re-publish → snapshot replacement |

---

## How Workflows Relate to Architecture Documents

Workflow documents describe behaviour. Architecture documents describe implementation. Each workflow references the architecture files that contain the technical details for the subsystems involved.

### Mapping: Workflows → Architecture Documents

| Workflow | Primary Architecture References |
|----------|--------------------------------|
| 01 — Submission | `06_Assignment_Architecture.md`, `09_StudentDashboard_Architecture.md`, `08_Grading_Architecture.md`, `15_Scoring_Architecture.md` |
| 02 — Grading | `07_Annotation_Architecture.md`, `08_Grading_Architecture.md`, `15_Scoring_Architecture.md` |
| 03 — Revision | `06_Assignment_Architecture.md`, `08_Grading_Architecture.md`, `15_Scoring_Architecture.md`, `07_Annotation_Architecture.md` |
| 04 — Notifications | `15_Scoring_Architecture.md`, `09_StudentDashboard_Architecture.md`, `10_TeacherDashboard_Architecture.md` |
| 05 — Publishing | `07_Annotation_Architecture.md`, `15_Scoring_Architecture.md`, `09_StudentDashboard_Architecture.md`, `08_Grading_Architecture.md` |

### Architecture Document Index

For implementation details, refer to the architecture documents in `docs/structure/`:

| Document | Covers |
|----------|-------|
| `01_System_Architecture.md` | System overview, routing, state ownership |
| `02_Database_Architecture.md` | All tables, relationships, storage buckets |
| `03_RPC_Architecture.md` | All PostgreSQL RPCs and Edge Functions |
| `04_Authentication_Architecture.md` | Auth flows, ban enforcement, user creation |
| `05_QuestionBank_Architecture.md` | Question types, CRUD, similarity search |
| `06_Assignment_Architecture.md` | Templates, drafts, publishing, student attempts |
| `07_Annotation_Architecture.md` | Annotation engine, D1 workflow, feedback publishing |
| `08_Grading_Architecture.md` | Grading hierarchy, audio playback, submission history |
| `09_StudentDashboard_Architecture.md` | Student pages, assignment completion, feedback review |
| `10_TeacherDashboard_Architecture.md` | Teacher and admin pages |
| `11_Component_Architecture.md` | Reusable components, hierarchy, duplication rules |
| `12_UI_Workflows.md` | Golden path UI workflows for all roles |
| `13_Frozen_Modules.md` | Frozen module inventory and constraints |
| `14_Development_Rules.md` | Permanent development rules |
| `15_Scoring_Architecture.md` | Scoring, notifications, published feedback lifecycle |

---

## Workflow Relationships

The five workflows are interconnected:

```
01_Submission ──→ 02_Grading ──→ 05_Publishing
                    │                  │
                    │                  ▼
                    │           04_Notifications
                    │                  │
                    ▼                  ▼
              03_Revision ←── (cycle back to 01)
```

- **Submission** triggers **Grading** (teacher opens the submission)
- **Grading** triggers **Publishing** (teacher publishes feedback)
- **Publishing** triggers **Notifications** (student is notified)
- **Notifications** can trigger **Revision** (student sees revision requested)
- **Revision** cycles back to **Submission** (student submits a new attempt)

---

## Reading Order

New developers should read:

1. `PROJECT_ARCHITECTURE.md` — system overview and subsystem index
2. `12_UI_Workflows.md` — golden path UI workflows
3. Workflow documents (01–05) in order — behavioural detail
4. Architecture documents as needed — implementation detail
