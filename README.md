# Planr

Project delivery tool for Solusign CLM implementations. Sprint board,
dependency-driven plan, focus horizon, and a meeting operating system —
built to feed a Supabase backend and sync with Airtable.

## Architecture

No build step. ES modules loaded natively by the browser, structured the
same way as the MGS app: a thin data layer under services, services under
views, nothing in the view touches the database directly.

```
planr-app/
├── index.html                 app shell — loads styles + app.js
├── src/
│   ├── app.js                 entry point · app state · wires services→views
│   ├── lib/
│   │   ├── dates.js           working-day math (Mon–Fri, add/diff/duration)
│   │   └── scheduler.js       dependency graph → resolved dates + critical path
│   ├── data/
│   │   ├── adapter.js         LocalAdapter + SupabaseAdapter (same surface)
│   │   └── seed.js            demo data from the 13 Sep call
│   ├── services/
│   │   ├── db.js              THE swap point — one line changes backend
│   │   ├── taskService.js     task + dependency operations, reschedule()
│   │   └── rollupService.js   horizon, deliverable rollup, effort burn
│   ├── views/
│   │   └── planView.js        the Plan (WBS) tab
│   └── styles/
│       ├── base.css           tokens + app shell + panel
│       └── plan.css           the Plan view hierarchy
└── supabase/
    ├── migrations/
    │   ├── 0001_core.sql       people, projects, deliverables, sprints
    │   ├── 0002_tasks.sql      work breakdown structure
    │   ├── 0003_dependencies.sql  dependency graph + cycle guard
    │   ├── 0004_meetings.sql   meetings + carry-forward links
    │   ├── 0005_views_functions.sql  horizon, rollups, blocker view
    │   └── 0006_rls.sql        row-level security
    └── functions/
        ├── horizon/            due today or within N days
        ├── cascade-schedule/   server-side date cascade (mirrors scheduler.js)
        └── airtable-sync/      two-way Airtable sync on airtable_id
```

## Why this structure

**One swap point.** Everything reads and writes through `db` in
`services/db.js`. Today it's `LocalAdapter` (localStorage). To go to
Supabase, uncomment the `SupabaseAdapter` block — the adapter exposes the
same `all / get / where / insert / update / remove / raw` surface, so no
service or view changes. The adapter's methods become async on Supabase;
`app.js` already isolates data access behind the services so making
`render()` await is a contained change.

**Related tables, not one blob.** The six migrations map one-to-one to the
data model: people, projects, deliverables, sprints, tasks, dependencies,
meetings. Foreign keys and indexes are declared. `tasks` carries both the
WBS parent (`parent_id`) and the scope anchor (`deliverable_id`) so the
plan hierarchy and the deliverable rollup are independent.

**The scheduler is pure and shared.** `lib/scheduler.js` takes tasks +
dependencies and returns resolved dates and the critical path. It never
touches the DB. The same algorithm is reimplemented in the
`cascade-schedule` edge function so a change made by any client resolves
identically on the server.

## Dependencies

Four standard precedence relationships, stored in the `dependencies` table:

| Type | Meaning | Successor constraint |
|------|---------|----------------------|
| `FS` | Finish → Start  | starts the working day after predecessor finishes (+lag) |
| `SS` | Start → Start   | starts when predecessor starts (+lag) |
| `FF` | Finish → Finish | finishes when predecessor finishes (+lag) |
| `SF` | Start → Finish  | finishes when predecessor starts (+lag) — rare |

`lag_days` is signed: positive is a gap, negative is a lead (overlap).
Dependencies reference tasks by id; the Plan view renders them as
`FS 1.1.2` using the WBS code of the predecessor so they're readable.

**Cascade.** Changing a duration or a predecessor calls
`taskSvc.reschedule(projectId, projectStart)`, which topologically sorts
the graph and walks it, pushing each successor's start against its
predecessors. Tasks with a manually-set date are pinned
(`is_scheduled_manually`) and opt out of the push. End dates are computed
from duration in working days.

**Cycle protection.** The client checks before adding an edge; the SQL
`dep_no_cycle()` trigger enforces it at the database. A dependency whose
successor can already reach the predecessor is rejected.

**Critical path.** `criticalPath()` walks back from the last-finishing
task along the chain of zero-slack predecessors. Those dependency badges
render red in the Plan view.

## The Plan view

Solves the hierarchy-legibility problem. Each WBS level has a distinct
visual identity rather than relying on indentation alone:

- **Phase** — full purple tint band, 4px bar, solid icon chip, "Phase 1"
  badge, bold indigo name. The heaviest weight.
- **Deliverable** — green bar, package chip, green name, one indent.
- **Milestone** — amber bar, actual diamond marker, "Gate" tag. Reads as
  a checkpoint, not a task.
- **Task** — lightest: status dot or checkbox, two indents, a faint green
  connector spine tying it to its deliverable.

Columns: Task · WBS code · Dependencies · Owner · Duration · Schedule ·
Estimate. Select any row to open the panel and edit duration, dates, owner,
or add/remove predecessors — every change re-cascades the schedule live.

## Running locally

Any static server (module scripts need http, not file://):

```bash
cd planr-app
python3 -m http.server 8080
# open http://localhost:8080
```

## Supabase setup

```bash
supabase init
supabase db push          # runs migrations 0001–0006 in order
supabase functions deploy horizon
supabase functions deploy cascade-schedule
supabase functions deploy airtable-sync
```

Then in `src/services/db.js` swap `LocalAdapter` for `SupabaseAdapter`
and set your project URL + anon key. RLS policies in `0006` gate every
table by project membership — write the `project_members` rows for your
users before the app will return data.

## Airtable during the transition

`airtable-sync` upserts on `airtable_id`. Point it at your base and run
it pull-first on a cron. Keep the record-renaming automation disabled in
Airtable or the pull will reintroduce the default-action-type problem
from the 13 Sep call. Push direction is stubbed — mirror the field map
the other way when you're ready for writes back to Airtable.

## GitHub Pages

Static, so it deploys as-is from `/planr-app`. Once Supabase is wired,
the anon key ships in the client — RLS is the protection, so land the
policies before the repo goes public.
