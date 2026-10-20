# Carnet — image légère, sans dépendance npm. Fonctionne sur x86 (NAS) et ARM (Raspberry Pi).
FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 CARNET_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.mjs"]
