# Agent bridge (MCP) — design

## Problem

The app's only truth is IndexedDB inside one browser profile. Agents (and scripts) cannot
read or write it, so every program has to be authored as JSON in a file and imported by
hand, and history cannot be inspected at all. The friction is worst exactly where the app
is strongest: the data is local and private.

Constraints: the app stays client-side and offline-first, with no backend to operate. An
MCP server is a local process, so it can share files with the repo but never with a
browser's IndexedDB.

## Technical Plan

Files, not sockets, are the boundary.

```
data/
  programs/
    <id>.json          one program, exactly the import format
    index.json         MCP-maintained summary used by the dev sync button
    archive/<id>.json  archived, never deleted
  history/
    workout-history.json   exported by the app, read by the MCP
```

`mcp/server.ts` (stdio, `@modelcontextprotocol/sdk`, run with `tsx`) exposes:

| Tool | Behaviour |
|---|---|
| `list_programs` | id, name, day, exercise count |
| `get_program` | the raw JSON |
| `validate_program` | the importer's real errors (`describeError`: path + message) |
| `create_program` | validate, refuse an existing id unless `replace` |
| `update_program` | validate, id must match, must exist |
| `archive_program` | move the file to `archive/`, never delete |
| `list_sessions` | summaries from `workout-history.json` |
| `get_session` | one summary by id |
| `refresh_index` | rebuild `index.json` from the program files |

Validation is not reimplemented: the server imports `src/schemas/program.ts` directly, so
a program the MCP accepts is a program the app accepts. Programs are stored as the JSON the
user wrote (pretty-printed), not the normalized internal shape.

Direction of travel: **agents write programs; the app writes history.** The app never
writes into `data/programs`, so there is no two-writer conflict. History moves by explicit
export (History → Export), which also gives the app the export path §4.7 listed as its
IndexedDB-eviction upgrade.

Dev convenience: Programs shows a "Sync from data/" button when `import.meta.env.DEV`.
It reads `index.json` and imports each program through the same `setText` → `save` path as
a manual paste, replacing by id. Production builds never see it.

## Alternatives

- **Live HTTP bridge** (Vite middleware + fetch from the app). Real-time, but adds a
  network dependency to an offline-first app, needs CORS/security thought, and only works
  while both processes run. Rejected: the file boundary already solves authoring.
- **MCP drives the browser with Playwright**. Reachable but brittle (needs a running
  browser, breaks on UI changes) and can't work when the phone is the client.
- **Backend + sync**. Contradicts the spec's client-side-only contract.
- **Reimplement the schema in the MCP**. Duplication; the two copies drift and the MCP
  starts accepting what the app rejects. Rejected.

## Detailed Implementation

- `mcp/store.ts`: pure functions over a root directory (`list`, `get`, `save`, `archive`,
  `index`, history read). Unit-tested against a temp dir.
- `mcp/server.ts`: tool registration only; resolves the repo root from its own path.
- `src/lib/exportHistory.ts`: `historyExport(rows)` → the file shape; History screen
  downloads it.
- `src/components/programs/SyncFromDisk.tsx`: dev-only button, fetches `index.json`, saves
  each file by id with `replace`.
- `data/programs/` is seeded with Workout A and B (the fixtures).
- Registration: `~/.config/opencode/opencode.json` → `mcp.servers.workout` running
  `npx tsx <repo>/mcp/server.ts`.

Failure behaviour: a corrupt program file is reported per id and skipped, never deleted;
a missing history export returns an empty list with a hint, not an error.
