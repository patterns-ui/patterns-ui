# @patterns-ui

**English** · [简体中文](README_ZH.md)

A CRUD UI foundation for our console / SaaS products: install it and you get a high-completion application skeleton; adding a resource page approaches zero boilerplate.
- **Stack**: pnpm monorepo · React 19 · TanStack Router / Query / Table v9 / Form v1 · shadcn/ui (Base UI dialect) · Tailwind v4 · zod v4
- **Distribution**: logic in the npm package `@patterns-ui/core` (semver + changesets); UI as shadcn registry blocks (copied into your project — fully owned, freely editable)
- **Repository**: `patterns-ui/patterns-ui` (private, repo-as-registry)
- **License**: MIT ([LICENSE](LICENSE))

## The paradigm: archetypes + a closed vocabulary

The library doesn't sell components or designs — it sells **reusable business patterns with consistent behavior**. Page work is **configuration, not JSX**:
- **Seven page archetypes** (resource-list / resource-detail / resource-form / settings / overview / auth-flow / wizard), each with one fixed slot structure; variants are props, never parallel blocks.
- **A closed vocabulary**: 73 blocks · 9 semantic cells · 2 theme presets · 10 actions · 3 pagination protocols (`page` / `keyset` shipped, `offset` reserved). Page files write only vocabulary names; a typo fails typecheck with the full list of legal values.
- **A fact layer**: [docs/patterns.md](docs/patterns.md) (generated — `pnpm docs:generate`, do not hand-edit): archetype decision table, discriminators, vocabulary catalog, 18 curated combinations from real demo pages, 8 anti-patterns.
- **Five business patterns** (audit-log, notification, onboarding, settings, team) shipped as contract cards: when one matches, assemble the page with one entry block + a client adapter.
- **Enforcement**: a paradigm eslint plugin (4 rules), the `ui:check` 10-step quality gate, a consistency-score ratchet, and three-state screenshot baselines. Generated artifacts (`AGENTS.md`, `docs/patterns.md`, the vocabulary) are CI-pinned fresh.

When the vocabulary truly lacks a component, the only legal path is the sandbox ratchet (register + watermark + dedupe + promote) via the `ui-block` skill; brand customization only touches theme tokens (`ui-theme` skill).

## Features

| Capability             | What it means                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layered L0–L4          | L0 Tokens (theme & presets) → L1 shadcn primitives → L2 composite components (DataTable / FilterBar …) → L3 page templates (list-page / form-page / detail-page …) → L4 `defineResource()` resource declaration. Every layer is a valid stop, swap, or fork point. |
| Four list modes        | One hook, `useResourceTable`, covers client (fetch-all + local filtering) / server-offset (page + keepPreviousData) / server-cursor (token stack) / load-more (accumulate & append).                                                                               |
| URL as source of truth | All query semantics (search / filter / sort / page / view) live in the URL (a zod schema guards bad values); a pasted link reproduces the exact view, back/forward work; the cursor stack and row selection stay in memory.                                        |
| Resource layer         | `createResource` wraps queryKeys, invalidation rules, and three mutation modes (pessimistic / optimistic / **undoable**: optimistic change + toast countdown undo) — zero ad-hoc `fetch` calls.                                                                    |
| Multi-tenancy          | `/t/$tenantId` route prefix + TenantProvider; queryKeys automatically carry the tenant segment so switching tenants clears exactly the right cache; remembered (localStorage) with stale-value fallback.                                                           |
| Auth & permissions     | requireAuth / requireRole route guards; `can()` always fails closed; `navFromResources` filters navigation by permission.                                                                                                                                          |
| Theme presets          | dark default + light; `data-preset` swaps skins (default / aurora); the no-flash blocking script shares constants with core.                                                                                                                                       |
| Dates & time           | Timezone / hour12 preferences (Intl cache, DST-correct); `formatRelative` live rendering.                                                                                                                                                                          |
| L4 resource layer      | One `defineResource` declaration derives the list page, detail loader prefetch, navigation, permissions, and form field inference (`inferColumns` / `inferFormFields`; in dev the Guesser prints paste-ready config).                                              |

## Using it in a new project (three steps)

Prerequisites: Node 22+, pnpm, and a GitHub login (the private registry uses gh credentials).

```bash
# 0) (private repo) let the shadcn CLI read the patterns-ui org repo
gh auth login            # or export GH_TOKEN=ghp_xxx

# 1) new project: vite + TanStack Router file-route template (or your own), plus Tailwind v4
pnpm create vite my-console --template react-ts
cd my-console && pnpm add tailwindcss @tailwindcss/vite && pnpm dev   # add @import "tailwindcss"; to styles.css

# 2) shadcn init (Base UI dialect) and register this repo's registry
pnpm dlx shadcn@latest init -b base     # generates components.json / lib/utils etc.
pnpm dlx shadcn@latest registry add @patterns-ui=gh:patterns-ui/patterns-ui

# 3) install the core logic package + the blocks you need (copied into src/components/blocks/, fully editable)
pnpm add @patterns-ui/core
pnpm dlx shadcn@latest add @patterns-ui/list-page @patterns-ui/data-table @patterns-ui/filter-bar
# equivalent bare-name form (matches docs/registry.md §4):
pnpm dlx shadcn@latest add patterns-ui/patterns-ui/list-page
```

Version pinning: `npx shadcn add patterns-ui/patterns-ui/data-table@0.3.0` (self-references inside `registryDependencies` use `name@semver` and follow the release).

## Five-minute tour (L2 → L3 → L4)

All examples below are condensed from real code in `apps/demo`. The same resource lands at any of the three layers — start at L2 and climb when the boilerplate bothers you.

### L2: DataTable + useResourceTable (assemble it yourself)

```tsx
import { useResourceTable } from "@patterns-ui/core/list";
import { servicesResource } from "@/resources"; // createResource({ name, client })
import { createListColumnHelper } from "@patterns-ui/core/list";

const helper = createListColumnHelper<Service>();
const columns = [helper.accessor("name", { header: "Name" }) /* … */];

const list = useResourceTable<Service>({
  resource: servicesResource,
  mode: "server-offset", // or client / server-cursor / load-more
  columns,
  filters: FILTER_DEFS, // FilterDef[] → consumed directly by FilterBar
  facets: ["env", "status"],
  search: { fields: ["name", "id"] },
  sort: { initial: [{ field: "name", direction: "asc" }], multi: true },
});

<DataTable table={list.table} preferencesKey="services" mobile="cards" />;
```

Search / filter / sort / page state writes to the URL automatically (`createListSearchSchema` generates the route's `validateSearch`), pagination uses keepPreviousData, and the four states (loading / empty / empty-filter / error) are handled by `AsyncState`.

### L3: ListPage template (one page, one composition)

```tsx
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";

<ListPage
  title="Services"
  filter={<FilterBar list={list} defs={FILTER_DEFS} onRefresh={() => void list.query.refetch()} />}
  body={
    <AsyncState
      query={list.query}
      rowsEmpty={rows.length === 0}
      onClearFilters={() => list.reset()}
    >
      <DataTable table={list.table} preferencesKey="services" />
    </AsyncState>
  }
  footer={<PaginationBar list={list} />}
/>;
```

### L4: defineResource (one declaration → page + routes + nav + permissions)

```tsx
// resources.ts — the declaration is everything
export const auditDef = defineResource<AuditEvent>({
  name: "audit-events",
  client: createRestClient((tid) => `/api/t/${tid}/audit-events`),
  columns: inferColumns(AUDIT_SAMPLE).columns, // columns inferred from a sample (id/time/enum…)
  filters: [
    /* FilterDef… */
  ],
  list: { mode: "server-cursor", facets: ["action"] },
  nav: { group: "Data", icon: "scroll-text" },
});

// route file (audit.tsx) — two lines to wire up
const listOptions = resourceListRouteOptions(auditDef); // validateSearch + staticData + permission guard
export const Route = createFileRoute("/_shell/t/$tenantId/audit")({
  ...listOptions,
  component: () => <ResourceListView def={auditDef} />, // FilterBar + DataTable + pagination + four states, all included
});
```

The detail route is the same two lines (`resourceDetailRouteOptions`: staticData + loader prefetching with the same queryKey as createResource), and navigation derives from `navFromResources(defs, user)`. Measured as feature-equivalent to the hand-written version at roughly ⅓ of the code (see the comparison below).

## Block catalog (73 blocks + 2 theme presets + 1 skills item = 76 items)

Install: `pnpm dlx shadcn@latest add @patterns-ui/<name>`. Specs in [docs/blocks.md](docs/blocks.md).

| Category            | Blocks                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shell (8)           | app-shell (variant: inset/floating/fullbleed) · top-bar · breadcrumbs · theme-toggle · preset-switcher · user-menu · command-palette · global-search-page                                                                                                          |
| sidebar (4)         | side-nav (variant: inset/floating/icon) · nav-group · nav-user · tenant-switcher                                                                                                                                                                                   |
| auth (6)            | auth-card-layout · sign-in-page · sign-up-page · forgot-password-page · otp-page · onboarding                                                                                                                                                                      |
| list (14)           | data-table · filter-bar · facet-sidebar · saved-views-menu · pagination-bar · selection-bar · refresh-bar · new-items-banner · export-button · list-page (table/grid variants) · audit-log · notification-inbox · resource-list-view (L4) · use-resource-mutations |
| cells (10)          | cell-for (semantic dispatch) · cell-id / -time / -user / -status / -boolean / -number / -enum-badge / -tags / -progress                                                                                                                                            |
| form (8)            | typed-form-field (full widget set + createTypedForm factory) · form-page / form-sheet / form-dialog (three hosts) · stepper · confirm-dialog · reference-select · secret-reveal                                                                                    |
| show (9)            | detail-page · detail-grid · timeline · reference-field · inline-edit-field · danger-zone · record-pager · diff-viewer · resource-detail-view (L4)                                                                                                                  |
| shared (12)         | async-state · empty-state · error-state · error-pages (one ErrorPage template + RouteErrorBoundary) · page-header · skeleton · status-badge · relative-time · copy-button · user-avatar · resource-icon · stat-strip                                               |
| team / settings (2) | team-page · settings-page (org / personal / security / appearance sections)                                                                                                                                                                                        |
| themes (2)          | default · aurora (`[data-preset]` skins, distributed via the theme item)                                                                                                                                                                                           |
| skills (1)          | skills (three agent skills + render script, a `registry:file` item — see "AI / skills" below)                                                                                                                                                                      |

## AI / skills (dual channel)

Three agent skills accompany the paradigm (content in M7-C3, distribution in M7-D; paradigm §4.2/§4.3):
- **ui-page**: the single entry point for creating or changing pages (classify the archetype → copy a curated combo from patterns → write configuration with 0 JSX → self-check with typecheck / `ui:check` → deliver with three-state screenshots).
- **ui-block**: the only legal path when the vocabulary truly lacks a component (dedupe → sandbox placement + watermark → proposed registration → freeze exemption → promotion).
- **ui-theme**: the only entry point for brand customization (preset choice; theme tokens only — per-component restyling is an anti-pattern).

Consumer-side distribution runs on **two channels**:
- **Channel 1 — registry item (rendered per project)**:

  ```bash
  npx shadcn add patterns-ui/patterns-ui/skills
  node .patterns-ui/skills/render-skills.mjs                 # renders into the .claude/.zcode/.agents skill dirs
  node .patterns-ui/skills/render-skills.mjs --host claude   # only the chosen host (same for zcode / agents)
  ```

  `shadcn add` lands the three SKILL.md files + the render script in `.patterns-ui/skills/` (`~` target = project root). The render script adapts the content to the consuming project (pages directory prefix `--pages-dir`, package manager `--pm` detected from lockfiles with commands rewritten, repo-only sync footnotes stripped, a consumer-side fact-source hint appended) — a minimal self-contained take on "generate per-consumer variants".

- **Channel 2 — skills.sh static source (the ecosystem's main channel)**: `npx skills add patterns-ui/patterns-ui` ([skills.sh](https://skills.sh), Vercel's open-source CLI). The skills CLI's standard scan directories include `.claude/skills/` and `.agents/skills/`, so this repo's three-host single-source layout is natively compatible — no extra scaffolding needed (the scan descends three levels; `<skill>/SKILL.md` is an entry). The static source ships the in-repo originals (content references in-repo paths); use channel 1 for in-project adaptation. For private repos, follow the skills CLI's private-source convention (local GitHub auth required).

The in-repo fact source is `.zcode/skills/` (three SKILL.md files: ui-page / ui-block / ui-theme; `.claude/skills/` and `.agents/skills/` are byte-identical copies — CI verifies sync with `diff -r`).

## Upgrade strategy

- **Logic layer (core)**: npm semver. Changes to `@patterns-ui/core` are recorded with changesets (`pnpm changeset` in this repo); releases produce a CHANGELOG — minor = features, patch = fixes, major = breaking (docs/registry.md §6).
- **UI blocks**: once copied into your project the source is fully yours — an upgrade is "compare & merge", never overwrite:

  ```bash
  npx shadcn add patterns-ui/patterns-ui/data-table --dry-run   # preview which files would change
  npx shadcn add patterns-ui/patterns-ui/data-table --diff      # diff against your local copy
  # merge your local changes by hand; use -o (overwrites local edits) only when you really mean it
  ```

- Pin the shadcn CLI version (e.g. `pnpm dlx shadcn@4.22.1 add …`) to avoid `@latest` pulling in an unexpected major.
- Block design supports upgrades: few, cohesive files; the public API concentrated in a single entry file; breaking changes come with migration notes in docs/.

## L4 adoption: defineResource vs. hand-written (M4)

The same "audit events list page" (keyset pagination + action facet + time-range filter + advanced and/or) written two ways, both kept in the demo for direct comparison (since M6 the product entry is the L4 version at `/t/:tid/audit`; the M2 hand-written page moved to `/t/:tid/dev/audit-legacy` as a reference):

| Version           | Route                      | Code                         | Notes                                                                                                                                                                                                           |
| ----------------- | -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2 hand-written   | `/t/:tid/dev/audit-legacy` | ~229 lines (single file)     | hand-written columns + useResourceTable + full FilterBar / FacetSidebar / DataTable / PaginationBar assembly + cursor/load-more dual-mode switch                                                                |
| M4 resource layer | `/t/:tid/audit`            | ~87-line page + ~55-line def | `defineResource` (columns inferred by `inferColumns` from a sample; filters/list declared together) + `resourceListRouteOptions` (validateSearch / staticData / permission guard) + one-line `ResourceListView` |

The resource layer's payoff scales linearly with the number of resources: the def also derives navigation (`navFromResources`), detail-route loader prefetch (`resourceDetailRouteOptions`), and form field inference (`inferFormFields`). In dev mode, opening `/t/:tid/audit` prints paste-ready config in the console (the Guesser). The hand-written version remains as the L3 reference — stop at L3 when you want full control of the assembly.

## Running the demo

```bash
pnpm install
pnpm dev          # starts the demo (mock-API middleware included); sign in with demo@fleetly.dev / any password — a clean clone runs from this alone (dev aliases core to workspace sources; no build needed first)
pnpm test         # core unit tests + demo guard tests
pnpm test:e2e     # Playwright smoke (install browsers first, see below; CI runs it on PR/push)
pnpm build        # core build + registry JSON build
pnpm review       # demo production build + preview self-test (vite build && vite preview, pinned to :4173)
```

Browser binaries (Ubuntu 26.04+ needs the platform override; CI's ubuntu-24.04 does not):

```bash
pnpm --filter demo exec playwright install chromium
# On Ubuntu 26.04, if you hit "does not support chromium on ubuntuXX":
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 pnpm --filter demo exec playwright install chromium
```

<!-- TODO: screenshots — sign-in page / shell + sidebar / services list (filters + pagination) / detail tabs / form sections / theme preset comparison (aurora vs default). Put them in docs/screenshots/ and reference them here. -->

## Developing in this repo

```
packages/core/            # @patterns-ui/core — pure-logic npm package (hooks, data contracts, types)
packages/eslint-plugin/   # @patterns-ui/eslint-plugin — paradigm lint (private, this repo's CI only; npm publish deferred until there are real external consumers — M7-D decision 4)
registry/                 # UI block sources (copy-paste layer fact source) + build scripts + the skills channel-1 item (registry/skills/)
apps/demo/                # dev playground / living docs / reference implementation for new projects (Vite + TanStack Router + mock API)
docs/                     # spec docs (architecture, core API, blocks, registry, paradigm, patterns, milestone acceptance)
```

### Milestones

| Milestone | Scope                                                                                                                                                          | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0        | monorepo skeleton, registry pipeline, demo alias chain                                                                                                         | ✅     |
| M1        | shell & cross-cutting (theme / tenant / auth / router / datetime + shell / sidebar / auth blocks)                                                              | ✅     |
| M2        | list vertical slice (data / filters / list core + the list block family + services/audit pages)                                                                | ✅     |
| M3        | forms, details & relations (form / reference / task core + the three form hosts / show blocks)                                                                 | ✅     |
| M4        | resource layer & advanced tables (defineResource / inferColumns + grouping / tree / aggregation / virtualization + SaaS template pages)                        | ✅     |
| M5        | hardening (128 unit tests + 12 guard tests, Playwright smoke, CI, changesets, README, lint convergence)                                                        | ✅     |
| M6        | foundation & structure fixes (release readiness / re-homing to the quadrant model / L4 robustness / variant convergence / copy & docs, see docs/milestones.md) | ✅     |
| M7        | paradigm implementation (naming layer + execution layer + guidance layer + distribution; the one-stop `ui:check` gate, see docs/milestones.md)                 | ✅     |

### Scripts

| Command                                    | What it does                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                 | start the demo (vite + mock API)                                                            |
| `pnpm lint` / `pnpm format`                | biome check / format (0-warning baseline)                                                   |
| `pnpm -r typecheck`                        | tsc across the workspace (demo runs `tsr generate` first)                                   |
| `pnpm -r test`                             | core unit tests (vitest) + demo guard tests (node source scans)                             |
| `pnpm test:e2e`                            | Playwright smoke (webServer boots vite dev on :4173; CI runs it on PR/push)                 |
| `pnpm build`                               | core tsup build + `registry:build` (registry.json + dist/r/*.json)                          |
| `pnpm review`                              | demo `vite build && vite preview` (pinned to :4173; CI smoke pings it)                      |
| `pnpm lint:eslint` / `pnpm slots:check`    | paradigm lint, 4 rules (M7-B1) / archetype slot three-way consistency (M7-B1)               |
| `pnpm ui:shots [--check]`                  | generate three-state screenshot baselines / CI verification (M7-B2)                         |
| `pnpm ui:score [--check]`                  | consistency score report / ratchet check (M7-B3)                                            |
| `pnpm check:names`                         | three-way check: config names ⊆ injection table ∪ sandbox registry (M7-B4)                  |
| `pnpm ui:a11y`                             | axe scan (wcag2a/2aa; serious/critical fail, moderate logged)                               |
| `pnpm ui:check [--fast\|--skip 7,shots]`   | one-stop 10-step quality gate (M7-B4; `--fast` static quick pass, `--list` lists all steps) |
| `pnpm dlx shadcn@latest registry validate` | validate registry.json (CI runs it too)                                                     |
| `pnpm changeset` / `pnpm version-packages` | record a change / bump versions + CHANGELOG (release flow: docs/registry.md §6)             |

### Documentation

- [docs/architecture.md](docs/architecture.md) — layered model, state philosophy, dependency rules
- [docs/paradigm.md](docs/paradigm.md) — paradigm & positioning design contract (archetypes + closed vocabulary + AI guidance; M6–M8)
- [docs/patterns.md](docs/patterns.md) — the fact layer (generated): archetype decision table, discriminators, vocabulary, curated combinations, anti-patterns
- [docs/core-api.md](docs/core-api.md) — full API spec of the core abstractions
- [docs/blocks.md](docs/blocks.md) — specs for every registry block
- [docs/registry.md](docs/registry.md) — registry build, publish, and upgrade strategy
- [docs/milestones.md](docs/milestones.md) — M0–M7 task breakdown and acceptance checklists
