FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node index.js validation.js archive.js ./
COPY --chown=node:node storage/ ./storage/
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 STORAGE_BACKEND=local DATA_DIR=/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "index.js"]
