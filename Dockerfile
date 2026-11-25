# Banshee Band in a clean Linux box, installed from bun.lock. Two targets:
#
#   docker build -t banshee-band . && docker run --rm -p 4173:4173 banshee-band
#     the default (last) stage: builds the app and serves it on http://localhost:4173 (set PORT to move it)
#
#   docker build --target test -t banshee-band-test . && docker run --rm --ipc=host banshee-band-test
#     the whole gate: typecheck, build, unit tests, then the Playwright e2e tests in Chromium
#
# The Playwright image brings Node and the Chromium build @playwright/test expects (keep its tag
# equal to the Playwright version in bun.lock). bun is copied in from its own image.
FROM oven/bun:1.4.2 AS bun

FROM mcr.microsoft.com/playwright:v1.65.1-noble AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app
ENV CI=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

FROM base AS test
# Build before the tests so tests/pwa/build.test.ts has dist/sw.js to check. Stops at the first red step,
# and the last line says whether the gate passed.
CMD ["sh", "-c", "bun run typecheck && bun run build && bun run test && bun run e2e && echo 'GATE PASSED: typecheck, build, test, e2e' || { echo 'GATE FAILED'; exit 1; }"]

FROM base AS app
# The production build: the station, the band simulator, the YAMNet model and the six sample clips. No key needed.
RUN bun run build
ENV PORT=4173
EXPOSE 4173
CMD ["sh", "-c", "exec bunx vite preview --host 0.0.0.0 --port ${PORT:-4173} --strictPort"]
