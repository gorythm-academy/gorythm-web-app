# Security Route Checklist
Last reviewed: 2026-10-13

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

## Previously weak routes
- [x] `portal` mutation routes validate request bodies:
  - `POST /student/submissions`
  - `POST /student/quiz-attempts`
  - `POST /teacher/attendance`
  - `POST /teacher/assignments`
  - `POST /teacher/quizzes`
  - `POST /teacher/resources`
  - `POST /admin/link-parent-student`
- [x] `payroll` write routes validate request bodies, and `GET /teachers` and `GET /runs` catch query failures:
  - `POST /salary-profile`
  - `POST /attendance`
  - `POST /run`
- [x] `users` write endpoints use `validate(...)`:
  - `PATCH /:id/status`
  - `POST /bulk-delete`
  - `PATCH /bulk-status`

## Verification notes
- `users` route group has router-level auth + role gating (`super-admin`, `admin`) and schema validation on the write routes above.
- `portal` route group has auth, role checks, and payload validation on the mutation routes above.
- `payroll` route group has router-level auth + role gating (`accountant`, `admin`, `super-admin`) and schema validation on its write routes.
