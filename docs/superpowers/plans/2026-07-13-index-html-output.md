# Index HTML Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `dist/index.html` the project's only distributable HTML artifact and update every runtime consumer to use it.

**Architecture:** Keep the existing single-file Node ESM build pipeline. Change its exported canonical output path, remove only the known legacy artifact before writing, and point the server and standalone validator at the new file without changing page content.

**Tech Stack:** Node.js ESM, `node:fs/promises`, Node test runner, npm scripts

## Global Constraints

- The canonical build output is exactly `dist/index.html`.
- A build removes `dist/laptop-performance-handoff.html` if it exists, but does not clear unrelated files from `dist`.
- `scripts/serve.mjs` and the executable validator read `dist/index.html`.
- Historical design and implementation-plan documents are not rewritten.
- Page content and browser behavior remain unchanged.

---

### Task 1: Rename and verify the standalone artifact

**Files:**
- Modify: `tests/build.test.mjs`
- Modify: `scripts/build.mjs`
- Modify: `scripts/serve.mjs`
- Modify: `scripts/validate-html.mjs`
- Create: `dist/index.html` (generated)
- Delete: `dist/laptop-performance-handoff.html`

**Interfaces:**
- Consumes: `buildPage(): Promise<Array<ConversionReport>>` and the existing `outputPath: string` export from `scripts/build.mjs`.
- Produces: `outputPath` resolving to `<project-root>/dist/index.html`; `buildPage()` removes only `<project-root>/dist/laptop-performance-handoff.html` before writing the new artifact.

- [ ] **Step 1: Write the failing filename and migration-cleanup test**

Update the imports at the top of `tests/build.test.mjs`:

```js
import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';
import { validateHtml } from '../scripts/validate-html.mjs';
```

Replace the setup portion of the first build test with:

```js
test('build emits index.html as the only canonical standalone artifact', async () => {
  const legacyOutputPath = resolve('dist/laptop-performance-handoff.html');
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });
  await writeFile(legacyOutputPath, 'legacy artifact', 'utf8');

  await buildPage();

  assert.equal(basename(outputPath), 'index.html');
  await assert.rejects(access(legacyOutputPath), { code: 'ENOENT' });
  const html = await readFile(outputPath, 'utf8');
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10);
  assert.doesNotMatch(html, /<img[^>]+src=["'](?!data:)/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /\{\{[^}]+\}\}/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern='build emits index.html' tests/build.test.mjs
```

Expected: FAIL because `basename(outputPath)` is still `laptop-performance-handoff.html` and the legacy path is not removed.

- [ ] **Step 3: Implement the canonical path and targeted legacy cleanup**

In `scripts/build.mjs`, add `rm` to the filesystem imports and define the paths together:

```js
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const legacyOutputPath = resolve(root, 'dist/laptop-performance-handoff.html');
export const outputPath = resolve(root, 'dist/index.html');
```

Immediately before creating `dist` and writing the artifact, remove only the legacy file:

```js
  await rm(legacyOutputPath, { force: true });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
```

In `scripts/serve.mjs`, change the file read path:

```js
const file = resolve('dist/index.html');
```

In the executable block of `scripts/validate-html.mjs`, change the file read path:

```js
  const html = await readFile(resolve('dist/index.html'), 'utf8');
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern='build emits index.html' tests/build.test.mjs
```

Expected: PASS; `dist/index.html` exists and the seeded legacy artifact is absent.

- [ ] **Step 5: Rebuild the tracked artifact and verify direct consumers**

Run:

```bash
npm run build
node scripts/validate-html.mjs
```

Expected: the build prints an absolute path ending in `dist/index.html`; validation prints `Standalone HTML validation passed.`; Git sees `dist/index.html` added and `dist/laptop-performance-handoff.html` removed.

Start `npm run serve` in an `exec_command` session, request `http://127.0.0.1:4173/`, verify HTTP 200 and the expected HTML doctype, then terminate the server session. Do not leave the server running.

- [ ] **Step 6: Run the full verification suite and inspect scope**

Run:

```bash
npm run verify
git diff --check
git status --short
git diff --stat
git diff -- scripts/build.mjs scripts/serve.mjs scripts/validate-html.mjs tests/build.test.mjs
```

Expected: all tests, build, and standalone validation pass; `git diff --check` prints nothing; only the four source/test files, the generated artifact rename, and this plan are changed. The user's untracked `.DS_Store` remains untouched.

Attempt touched-file diagnostics through `vscode_mcp_server`. If that tool or its workspace session is unavailable, record the skipped diagnostics and reason in the final response instead of claiming they ran.

- [ ] **Step 7: Commit the implementation**

```bash
git add -- scripts/build.mjs scripts/serve.mjs scripts/validate-html.mjs tests/build.test.mjs dist/index.html dist/laptop-performance-handoff.html docs/superpowers/plans/2026-07-13-index-html-output.md
git commit -m "build: emit index html artifact"
```

Expected: one implementation commit containing no `.DS_Store` and no unrelated files.
