FROM node:20.4.0

RUN curl -fsSL https://get.pnpm.io/install.sh | PNPM_VERSION=8.6.7 bash -s -- --global

ENV PATH=$PATH:/root/.local/share/pnpm

WORKDIR /workspace
