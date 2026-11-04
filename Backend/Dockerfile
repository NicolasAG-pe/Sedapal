FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY *.js *.cjs ./
COPY workers/ ./workers/

EXPOSE 3000

CMD ["node", "start.cjs"]
