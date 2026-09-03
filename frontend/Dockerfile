# Production CheckStation SPA: Vite build → nginx static server.
# Local Compose continues to use Dockerfile.dev (Vite dev server).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Browser-facing origins only — baked at build time (never localhost).
ARG VITE_API_BASE_URL
ARG VITE_PUBLIC_SITE_URL
ARG VITE_DOCS_PUBLIC_URL
ARG VITE_STATUS_PUBLIC_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL \
    VITE_DOCS_PUBLIC_URL=$VITE_DOCS_PUBLIC_URL \
    VITE_STATUS_PUBLIC_URL=$VITE_STATUS_PUBLIC_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
