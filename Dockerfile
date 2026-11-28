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
RUN npm install --prefix /opt/render --no-audit --no-fund --ignore-scripts marked@15.0.12 dompurify@3.2.6 katex@0.16.22 highlight.js@11.11.1 @highlightjs/cdn-assets@11.11.1 chart.js@4.4.9 mermaid@11.6.0 \
 && mkdir -p public/render \
 && cp -r /opt/render/node_modules/katex/dist public/render/katex \
 && cp /opt/render/node_modules/marked/lib/marked.umd.js public/render/ \
 && cp /opt/render/node_modules/dompurify/dist/purify.min.js public/render/ \
 && cp /opt/render/node_modules/@highlightjs/cdn-assets/highlight.min.js public/render/ \
 && cp /opt/render/node_modules/@highlightjs/cdn-assets/styles/github.min.css public/render/ \
 && cp /opt/render/node_modules/chart.js/dist/chart.umd.js public/render/ \
 && cp -r /opt/render/node_modules/mermaid/dist public/render/mermaid \
 && rm -rf /opt/render
EXPOSE 3000
CMD ["node", "src/index.js"]
