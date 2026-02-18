FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copia il prisma dalla cartella corretta
COPY apps/server/prisma ./prisma

# Copia tutto il codice del server
COPY apps/server ./

RUN npm run build

EXPOSE 4000

CMD sh -c "npx prisma generate && npx prisma migrate deploy && node dist/index.js"
