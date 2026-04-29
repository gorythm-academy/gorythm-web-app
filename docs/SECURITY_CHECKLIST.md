# Security Route Checklist
Last reviewed: 2026-04-29

## Scope
- `backend/routes/admin.js`
- `backend/routes/users.js`
- `backend/routes/payments.js`
- `backend/routes/portal.js`
- `backend/routes/payroll.js`
- `backend/routes/settings.js`

## Fixed in this pass
- [x] `admin` routes now enforce auth + RBAC (`admin`/`super-admin`) via router-level middleware.
- [x] `settings` moved off in-memory runtime storage to persistent MongoDB document.
- [x] `settings` write route now enforces permission check (`settings.general.write`) before updates.
- [x] `payments` listing/refund/delete now enforce explicit permission middleware (`payments.read`, `payments.refund`, `payments.write`).

## Weak routes to harden next
- [ ] `portal` mutation routes need request-body validation:
  - `POST /student/submissions`
  - `POST /student/quiz-attempts`
  - `POST /teacher/attendance`
  - `POST /teacher/assignments`
  - `POST /teacher/quizzes`
  - `POST /teacher/resources`
  - `POST /admin/link-parent-student`
- [ ] `payroll` routes need validation and safer error handling:
  - `POST /salary-profile`
  - `POST /attendance`
  - `POST /run`
  - `GET /teachers` and `GET /runs` should use try/catch to avoid unhandled query failures.
- [ ] `users` still has write endpoints without `validate(...)` middleware:
  - `PATCH /:id/status`
  - `POST /bulk-delete`
  - `PATCH /bulk-status`

## Verification notes
- `users` route group already has router-level auth + role gating (`super-admin`, `admin`).
- `portal` route group has auth + role checks per endpoint, but payload validation is currently inconsistent.
- `payroll` route group has router-level auth + role gating (`accountant`, `admin`, `super-admin`) but lacks schema validation.
