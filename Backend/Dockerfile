FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY start.cjs server.js config.js email-otp.js resend-mail.js gmail-mail.js email-provider.js mail-envelope.js email-registration.js receipt-transactions.js outbox-crypto.js email-outbox.js ./
COPY workers/ ./workers/

EXPOSE 3000

CMD ["node", "start.cjs"]
