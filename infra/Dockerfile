# Base stage
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# Dependencies stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# API production stage
FROM base AS api
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Worker production stage
FROM base AS worker
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
CMD ["node", "dist/worker-main.js"]
