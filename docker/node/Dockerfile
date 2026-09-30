FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe

# npm is only a bootstrap tool; the development environment uses pnpm.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpcre2-8-0=10.46-1~deb13u3 \
        libssl3t64=3.5.7-1~deb13u3 \
        openssl-provider-legacy=3.5.7-1~deb13u3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.28.2 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000
RUN test "$LOCAL_UID" -gt 0 \
    && test "$LOCAL_GID" -gt 0 \
    && groupmod -o -g "$LOCAL_GID" node \
    && usermod -o -u "$LOCAL_UID" -g "$LOCAL_GID" node \
    && mkdir -p /workspace/node_modules \
    && chown -R node:node /workspace /home/node

USER ${LOCAL_UID}:${LOCAL_GID}
WORKDIR /workspace
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["node", "-e", "const fs = require('node:fs'); for (const p of ['/workspace', '/workspace/node_modules']) fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);"]
