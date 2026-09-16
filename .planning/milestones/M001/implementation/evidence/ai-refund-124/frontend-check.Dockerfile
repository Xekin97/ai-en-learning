FROM node:24.8.0-alpine3.22@sha256:3e843c608bb5232f39ecb2b25e41214b958b0795914707374c8acc28487dea17 AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm exec eslint app/infrastructure/http/schemas/generation.ts tests/unit/generation-refund-contract.test.ts && pnpm lint:boundaries && pnpm exec vitest run tests/unit/generation-refund-contract.test.ts tests/unit/generation-reducer.test.ts tests/unit/strict-contracts.test.ts && pnpm build
