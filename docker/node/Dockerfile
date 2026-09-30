FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

RUN npm install -g pnpm@11.3.0

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000
RUN test "$LOCAL_UID" -gt 0 \
    && groupmod -o -g "$LOCAL_GID" node \
    && usermod -o -u "$LOCAL_UID" -g "$LOCAL_GID" node \
    && mkdir -p /workspace/node_modules \
    && chown -R node:node /workspace /home/node

USER node
WORKDIR /workspace
