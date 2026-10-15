FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apk add --no-cache python3 make g++ \
    && npm install -g corepack@latest \
    && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
