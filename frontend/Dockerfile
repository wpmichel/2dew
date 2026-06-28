# Build the static site, then serve it with nginx.
# Debian-based (glibc) image so the native tsgo/oxc binaries run correctly.
FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . ./
# Baked in at build time; point the browser at the host-exposed backend URL.
ARG VITE_API_URL=http://localhost:5088
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
