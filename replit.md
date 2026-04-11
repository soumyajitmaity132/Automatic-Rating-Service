# Employee Performance Rating System — HighSpring

## Overview

Full-stack Employee Performance Rating web application built with React + Vite (frontend), Express.js (backend), and PostgreSQL via Drizzle ORM.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Frontend**: React + Vite, Tailwind CSS, Shadcn UI, React Query, wouter (routing)
- **Backend**: Express 5, JWT auth (jsonwebtoken), bcrypt (bcryptjs)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)
- **Build**: esbuild (ESM bundle)

## Structure

```text
├── artifacts/
│   ├── api-server/         # Express API server
│   └── performance-rating/ # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec (openapi.yaml) + Orval config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seed.ts         # Database seed script
```

## Database Schema

1. **teams** — teamId, teamName, tlUserId, managerUserId
2. **users** — userId (PK), displayName, username, email, password (hashed), role, level, teamId (FK)
3. **items_to_rate** — itemId, itemName, description, teamId (FK), weight, category
4. **ratings** — ratingId, itemId (FK), userId (FK), ratingValue, comment, quarter, year, artifactLinks, createdOn
5. **approvals** — approvalId, itemId (FK), teamId (FK), ratedUserId (FK), selfRatingValue, tlRatingValue, TL/Final LGTM statuses & timestamps, disputeStatus/disputeComment, quarter, year

## KPI Categories & Weights

- Core Contributions (SCIM Project Delivery): 55%
- Org Contributions: 10%
- Value Addition: 10%
- Leave Management: 10%
- Subjective Feedback: 10%
- Self Learning & Development: 5%

## Performance Score Labels

- ≥ 4.5: Exceptional
- 4.0–4.49: Exceeds Expectations
- 3.0–3.99: Meets Expectations
- 2.0–2.99: Improvement Needed
- < 2.0: Unsatisfactory

## Frontend Pages & Role-Based Navigation

Sidebar nav automatically shows links based on logged-in user role. Sidebar has a hamburger toggle on mobile.

### User
- **Dashboard** — Evaluation history table + dispute raising
- **Submit Rating** — Per-item float input form (0.1–5.0) for all KPI items

### Team Lead (includes User pages +)
- **My Team** — Team member list with Send Reminder (custom message) dialog
- **Approve Ratings** — Collapsible per-member panels with float TL rating inputs
- **Manage Team** — Remove members from team

### Manager (includes TL pages +)
- **Rate Team Leads** — Same panel UI as Approve Ratings for TL users
- **Reassign Leads** — Reassign Team Lead per team via dropdown
- **Final Approvals** — Manager's final LGTM queue with self/TL ratings visible

## Email Notifications (simulated — console.log)

- TL submits approval → email to rated user
- Manager gives Final LGTM (Approved) → email to rated user
- Send Reminder → email to all non-TL team members (supports custom message)

## Test Credentials

```
Manager      | alice.johnson  | Manager@123
Team Lead 1  | bob.smith      | TeamLead@123
Team Lead 2  | diana.prince   | TeamLead@123
User 1       | charlie.brown  | User@123
User 2       | eve.wilson     | User@123
User 3       | frank.miller   | User@123
```

Teams:
- **SCIM Team Alpha**: TL = bob.smith, Members = charlie.brown, eve.wilson
- **SCIM Team Beta**: TL = diana.prince, Members = frank.miller

## Seed Script

```bash
pnpm --filter @workspace/scripts run seed
```

## API Routes

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users` | `GET /api/users/:id` | `PATCH /api/users/:id`
- `GET /api/teams` | `GET /api/teams/:id` | `PATCH /api/teams/:id`
- `GET /api/items` | `POST /api/items`
- `GET /api/ratings` | `POST /api/ratings` | `PUT /api/ratings/:id`
- `GET /api/ratings/summary`
- `GET /api/approvals` | `POST /api/approvals` | `PATCH /api/approvals/:id`
- `GET /api/disputes` | `POST /api/disputes/:id` | `PATCH /api/disputes/:id`
- `POST /api/send-reminder`

## Re-running Codegen

```bash
pnpm --filter @workspace/api-spec run codegen
```
