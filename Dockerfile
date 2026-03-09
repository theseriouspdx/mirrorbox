# Mirror Box Orchestrator — Milestone 0.1 Engine Base
FROM node:18-alpine

# Install Git and Docker CLI for repository and sandbox operations
RUN apk add --no-cache git docker-cli

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
# Skip production-only for now while building foundation
RUN npm install

# Copy engine source and governance
COPY src/ ./src/
COPY .dev/governance/ .dev/governance/
COPY AGENTS.md .gitignore ./

# Mount points for persistent state and project code
VOLUME ["/config", "/project", "/data"]

# Default entrypoint (to be refined in Milestone 0.6)
CMD ["node", "src/index.js"]
