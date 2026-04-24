# --- Build Stage ---
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files for caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/mongo-vision/package.json ./artifacts/mongo-vision/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build all packages
# We need to set these env vars so Vite builds don't fail as per the previous fixes
ENV PORT=3005
ENV BASE_PATH=/
RUN pnpm run build

# Prepare the final public directory for the backend
RUN mkdir -p artifacts/api-server/dist/public && \
    cp -r artifacts/mongo-vision/dist/public/* artifacts/api-server/dist/public/

# --- Production Stage ---
FROM node:20-slim

WORKDIR /app

# Copy only the built artifacts from the builder stage
# api-server/dist contains the bundled server + the public folder with FE
COPY --from=builder /app/artifacts/api-server/dist ./dist
# We still need the node_modules for external dependencies mentioned in build.mjs
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
