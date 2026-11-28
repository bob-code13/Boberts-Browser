FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apk add --no-cache python3 make g++ \
    && npm install -g corepack@latest \
    && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

RUN npm install --prefix /opt/bobert-math --no-audit --no-fund --ignore-scripts katex@0.16.22
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
