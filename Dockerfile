# Builds the API and runs the compiled output. Migrations (schema and the
# fixed resource list) run at boot, so the container only needs DATABASE_URL.
FROM node:24-slim AS build
RUN npm install -g pnpm@10.33.2
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
