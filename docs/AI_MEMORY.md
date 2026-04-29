# GORYTHM AI Memory v3
**Project:** GORYTHM - Online Academy  
**Purpose:** Persistent, code-grounded memory for future AI chats  
**Last updated:** 2026-04-29  
**Source of truth:** Current codebase (frontend + backend + models), plus owner decisions confirmed in chat

---

## 1) Implemented now (code-verified)

### 1.1 Platform shape
- Monorepo with:
  - `src/` React frontend (public site, admin dashboard, role portals)
  - `backend/` Node.js + Express API
  - MongoDB via Mongoose models
- Routing uses `react-router-dom`; API calls mostly via `axios`.
- Auth state is stored via helpers in `src/utils/authStorage.js` (token/user in session/local storage, depending on remember behavior).

### 1.2 Frontend architecture and route domains
- Main app shell and routing are centered in `src/App.js`.
- Route groups:
  - Public website pages (home, courses, blog/contact/about, etc.)
  - Admin area (`/admin/*`) with dashboard + management tabs
  - Role portals (`/student-portal`, `/teacher-portal`, `/parent-portal`, `/accountant-portal`)
- `ProtectedRoute` enforces login + role checks and handles forced password-change redirects.

### 1.3 Authentication and authorization behavior
- Backend auth endpoints include standard login and admin-login flows.
- JWT bearer token auth is enforced through backend auth middleware on protected routes.
- RBAC middleware exists and is used for role restrictions on sensitive endpoints.
- `mustChangePassword` is implemented as an enforced post-login flow.
- Admin login UI only allows admin/super-admin pathway.

### 1.4 Admin dashboard functional relations
- `DashboardLayout` provides admin nav and session guard/logout behavior.
- `DashboardHome` fetches aggregate KPIs from `/api/admin/dashboard`.
- `UsersManagement` is a shared admin table component reused by:
  - Staff users mode (`variant="staff"`)
  - People mode (`variant="people"`) for students/teachers/parents
- `PeopleManagement` wraps `UsersManagement` in people mode and can trigger student enrollment flow.
- `StudentsData` is enrollment-record management (student-course mappings), not just a student list:
  - enroll/edit enrollment
  - status updates (single/bulk)
  - CSV export
- `CoursesManagement` supports full course CRUD + bulk operations + publish/draft status control.
- `PaymentsManagement` supports payment listing/filtering/summaries, delete, and invoice download (with client fallback generation when needed).
- `Analytics` consumes overview/metrics endpoints with time-window controls.
- `ContactMessages` supports inbox/trash, soft delete/restore/permanent delete, bulk actions.
- `Settings` now persists to MongoDB via a dedicated singleton settings document (`AdminSettings`) and a settings service layer.

### 1.5 Public payment flow (Stripe + manual)
- Public payment UI (`PaymentGateway`) supports:
  - Stripe checkout path (`/api/payments/create-checkout`)
  - Manual/bank registration path (`/api/payments/register-online`)
- Stripe success page verifies checkout session via `/api/payments/verify-session`.
- Stripe webhook handler processes `checkout.session.completed` and updates payment/enrollment mirrors.
- Currency UX:
  - `CurrencyContext` detects currency preference (timezone/locale + exchange-rate fetch for display)
  - Stripe charge path is still effectively USD-based in current implementation behavior.

### 1.6 Backend architecture
- `backend/server.js` configures:
  - CORS + Helmet
  - request context middleware
  - Stripe webhook handling in correct pre-JSON-parser sequence
  - route mounting by domain (`auth`, `admin`, `users`, `courses`, `enrollments`, `payments`, `analytics`, `contact`, `blog`, `portal`, `payroll`, etc.)
  - global `notFound` and `errorHandler`
- Logging has moved toward structured logger usage (`req.log` / logger utility) across routes and scripts.
- Validation uses custom middleware (`middleware/validate.js`) with reusable rules (required string/email/enum/objectId/arrays/number).
- Default admin seed behavior exists and is environment-driven.
- Security hardening applied in this pass:
  - `admin` route group now has router-level auth + role enforcement (`admin`, `super-admin`).
  - `payments` management endpoints now enforce permission checks (`payments.read`, `payments.refund`, `payments.write`).
  - `settings` save endpoint now enforces permission checks before accepting updates.

### 1.7 Data model coverage (Mongoose)
Core models verified in code include:
- `User`, `Course`, `Enrollment`, `Payment`
- `ContactMessage`, `BlogComment`, `AuditLog`
- `ParentStudentLink`
- Learning/portal entities: `Assignment`, `AssignmentSubmission`, `Quiz`, `QuizAttempt`, `Resource`, `AttendanceRecord`
- Payroll entities: `TeacherAttendance`, `TeacherSalaryProfile`, `PayrollRun`

### 1.8 Portal behavior (role-focused)
- Student portal: own enrollments/progress context, assignment submissions, quiz attempts.
- Teacher portal: managed-course context, attendance + assignment creation workflows.
- Parent portal: child linkage/progress views, parent-student linking request flow.
- Accountant portal: payment summaries + salary profile/attendance/payroll run operations.

---

## 2) Target behavior (owner-required)

> These are explicit owner expectations to preserve in future implementation decisions.

### 2.1 Settings persistence policy (high priority)
- **Owner decision:** Admin settings must be persisted in **database**, not runtime memory.
- Current in-memory settings behavior is temporary and should be treated as a fix priority.
- Target outcome:
  - durable across restarts/deployments
  - auditable changes (actor + timestamp)
  - validated schema per settings section

### 2.2 Memory quality rule for future chats
- AI responses must be based on **code-verified behavior**, not paraphrased assumptions.
- When uncertain, inspect code paths and API/model connections before stating functionality.

### 2.3 Security-first handling rule
- Any future changes touching auth, payments, admin routes, or data export must default to least-privilege and explicit validation.
- Do not widen route access "for convenience."

### 2.4 Payment behavior target
- Keep Stripe/webhook reliability intact.
- Any future multi-currency charging must be deliberate, tested, and clearly separated from display-only conversion logic.

---

## 3) Known gaps / do-not-touch rules

### 3.1 Known gaps (observed)
- `portal` write endpoints still need consistent request validation middleware.
- `payroll` endpoints still need request validation; `GET /teachers` and `GET /runs` should be wrapped in safer error handling.
- `users` still has write endpoints without shared validation middleware (`PATCH /:id/status`, `POST /bulk-delete`, `PATCH /bulk-status`).
- Currency display vs actual charge currency can diverge; avoid implying true local-currency settlement unless backend+Stripe config supports it end-to-end.

### 3.2 Do-not-touch rules
- Do not break:
  - JWT auth + role gate flows
  - forced password-change logic
  - Stripe webhook signature verification + event processing path
  - enrollment/payment linkage behavior
- Do not remove validation middleware from write endpoints.
- Do not reintroduce plaintext/semi-structured console logging where structured logger is expected.
- Do not convert persistent business data features to runtime-only memory stores.

---

## 4) Security warning (persistent)

- Treat all admin-capable and financial endpoints as sensitive by default.
- Before changing access/logic on `users`, `admin`, `payments`, `portal`, `payroll`, verify:
  - authentication is required where expected
  - role/permission checks are explicit
  - input validation is enforced server-side
  - response payloads avoid leaking sensitive fields
- Any discovered weakly-guarded route should be classified and fixed before unrelated enhancements on that endpoint.

---

## 5) Operational assumptions for future AI sessions

- Stack baseline: React frontend + Express/Mongoose backend + MongoDB.
- Primary business domains: academy operations, enrollment, payments, role portals, analytics, communication.
- If behavior conflicts between UI and API, trust code path reality and call out mismatch explicitly.
- For architectural decisions, prioritize:
  1) security and correctness  
  2) data durability  
  3) maintainability and observability

---

## 6) Immediate priority queue (owner-aligned)

1. Add validation middleware coverage for `portal` and `payroll` write endpoints.
2. Add validation coverage for remaining `users` write endpoints (`status` + bulk actions).
3. Keep structured logging + centralized error handling pattern consistent across remaining endpoints.
4. Clarify payment currency semantics in UI copy to match real transaction behavior.

---
