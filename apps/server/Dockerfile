FROM node:20-bullseye-slim

WORKDIR /app

# deps native (canvas/sharp ecc.)
RUN apt-get update && apt-get install -y \
  python3 make g++ pkg-config \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

# 1) Install deps del SERVER (incluse dev, perché usiamo ts-node in runtime)
COPY apps/server/package*.json ./
RUN npm ci --include=dev

# 2) Copia prisma + codice server
COPY apps/server/prisma ./prisma
COPY apps/server ./

EXPOSE 4000

# Prisma generate + migrate deploy + start (TS transpile-only)
CMD sh -c "npx prisma generate && npx prisma migrate deploy && node -r ts-node/register/transpile-only src/index.ts"





