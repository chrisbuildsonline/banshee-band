# Tasks: banshee-log MCP server (F13)

Each task ends in a test gate. Write the test first and see it fail for the right reason, then implement. Run `bun run typecheck` and `bun run test` at every gate. Requirement numbers refer to `requirements.md`. Before task 1 read `.kiro/steering/*.md`, `src/events/`, `src/station/runner.ts`, `src/station/types.ts`, `src/classify/classifier.ts`, `src/haptics/index.ts`, `public/clips/manifest.json`, `tests/classify/fs-fetch.ts` and `README.md`. Do not change `src/`. Add `.banshee/` to `.gitignore`.

- [ ] 1. The log module
  - [ ] 1.1 Write `tests/mcp/log.test.ts` against a throwing stub of `mcp/log.ts`: every case of Requirement 8.1.
    - _Requirements: 1.1-1.3, 2.2, 3.1-3.3, 8.1_
  - [ ] 1.2 Implement `mcp/log.ts` by `design.md`. Add `@modelcontextprotocol/sdk` and `zod` 4 to `package.json` and `mcp` to `tsconfig.json`.
    - _Requirements: 6.1, 7.2_
  - **Gate:** `tests/mcp/log.test.ts` passes; `bun run typecheck` and `bun run test` pass.

- [ ] 2. Replay and the server
  - [ ] 2.1 Write `tests/mcp/banshee-log.test.ts` first (Requirements 8.2 and 8.3) and see it fail because `mcp/banshee-log.ts` is missing.
    - _Requirements: 8.2, 8.3_
  - [ ] 2.2 Implement `mcp/vite-shim.ts` and `mcp/replay.ts` (`listClips`, `replayClip`) with the cached classifier, the file fetch and no outputs.
    - _Requirements: 4.2, 4.3, 4.4, 6.2, 6.3_
  - [ ] 2.3 Implement `mcp/banshee-log.ts`: the three tools with their zod schemas, JSON text results, `isError: true` for schema, unknown-clip and failed-run cases, and `append` through `appendRecord`. Add the `mcp:banshee-log` script.
    - _Requirements: 2.1, 3.1, 4.1, 4.5, 5.1-5.4, 7.2_
  - **Gate:** `tests/mcp/banshee-log.test.ts` passes, including every bad-input case; `bun run typecheck` and `bun run test` pass; nothing in `src/` changed (`git diff --stat src` is empty).

- [ ] 3. Seed script and registration
  - [ ] 3.1 Implement `scripts/log-clips.ts` and the `log:seed` script; run it against a temp `BANSHEE_LOG` and read 18 records back with `recent_events`.
    - _Requirements: 7.1, 7.2_
  - [ ] 3.2 Check `.kiro/settings/mcp.json` and `.kiro/steering/structure.md` against the final files, and add a short `mcp/` note to `README.md` only if the owner asks.
    - _Requirements: 6.4, 7.3_
  - **Gate:** `bun run log:seed` writes 18 valid records; `bun run typecheck` and `bun run test` pass.
