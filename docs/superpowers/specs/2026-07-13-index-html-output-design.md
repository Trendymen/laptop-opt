# Index HTML Output Design

## Goal

Change the project's single distributable HTML artifact from
`dist/laptop-performance-handoff.html` to `dist/index.html`.

## Scope

- Make `dist/index.html` the canonical build output.
- Update the local server and standalone validator to read `dist/index.html`.
- Remove the legacy artifact during a build so an existing checkout does not retain two HTML outputs.
- Add a build contract test that verifies the output filename and the absence of the legacy artifact.
- Rebuild and track `dist/index.html`; remove the tracked legacy artifact.

Historical design and implementation-plan documents remain unchanged because they record the original delivery decisions rather than current runtime configuration.

## Implementation Design

`scripts/build.mjs` will expose `dist/index.html` through its existing `outputPath` export. Before writing the artifact, the build will remove the legacy `dist/laptop-performance-handoff.html` path if present. It will not delete the entire `dist` directory, avoiding accidental removal of unrelated future outputs.

`scripts/serve.mjs` and the executable path in `scripts/validate-html.mjs` will use `dist/index.html`. Tests that already consume `outputPath` will continue to do so, and `tests/build.test.mjs` will add explicit assertions for the canonical filename and legacy-file cleanup.

## Verification

1. Seed the legacy artifact and run the focused build test, proving it is removed and `dist/index.html` is created.
2. Run the complete `npm run verify` workflow.
3. Run `git diff --check` and inspect the final changed-file set.
4. If VS Code diagnostics are unavailable, report that explicitly; the changed files are Node ESM scripts and tests, so the project test suite remains the primary executable verification.

## Acceptance Criteria

- `npm run build` produces `dist/index.html`.
- `dist/laptop-performance-handoff.html` is absent after the build.
- `npm run serve` and the standalone validator read `dist/index.html`.
- The full verification workflow passes without changing page content or behavior.
