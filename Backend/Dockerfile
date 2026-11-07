FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY safe-log.js local-check-transport.js start.cjs server.js config.js auth-contract.js two-factor.js totp-crypto.js email-otp.js mail-address.js resend-mail.js gmail-mail.js email-provider.js mail-envelope.js email-registration.js receipt-transactions.js payment-operations.js payment-provider.js yape-pilot.js outbox-crypto.js email-outbox.js ./
COPY password-recovery.js password-recovery-crypto.js password-recovery-worker.js push.js push-credentials.js push-provider.js push-worker.js incident-tracking.js ./
COPY workers/ ./workers/

# La API y los workers solo necesitan escribir en /tmp; los secretos montados
# deben ser legibles por UID 1000 sin conceder acceso a otros usuarios.
USER node

EXPOSE 3000

CMD ["node", "start.cjs"]
