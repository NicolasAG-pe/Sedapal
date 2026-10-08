FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY server.js config.js ./

EXPOSE 3000

CMD ["node", "server.js"]
