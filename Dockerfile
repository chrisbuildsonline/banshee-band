# The whole Banshee Band gate in a clean Linux box: install from bun.lock, then run every check.
#
#   docker build -t banshee-band-test .
#   docker run --rm --ipc=host banshee-band-test
#
# The Playwright image brings Node and the Chromium build @playwright/test expects (keep its tag
# equal to the Playwright version in bun.lock). bun is copied in from its own image.
FROM oven/bun:1.4.2 AS bun

FROM mcr.microsoft.com/playwright:v1.65.1-noble
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app
ENV CI=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

# Build before the tests so tests/pwa/build.test.ts has dist/sw.js to check. Stops at the first red step.
CMD ["sh", "-c", "bun run typecheck && bun run build && bun run test && bun run e2e"]
