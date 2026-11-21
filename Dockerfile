# TaxMitra — static site + API in one image. No npm install: the server has no dependencies.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

# Only what the running server needs.
COPY server ./server
COPY js ./js
COPY css ./css
COPY pages ./pages
COPY index.html login.html signup.html manifest.json sw.js robots.txt sitemap.xml ./
COPY README.md SERVER.md BACKEND_SETUP.md IMPLEMENTATION.md SECRETS_SETUP.md AGENTS.md ./

# Persist the SQLite database here (mount a volume, or books vanish on redeploy).
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# JWT_SECRET is required in production; the container refuses to start without it.
CMD ["node", "server/index.js"]
