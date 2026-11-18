FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY start.cjs server.js config.js auth-contract.js two-factor.js totp-crypto.js email-otp.js resend-mail.js gmail-mail.js email-provider.js mail-envelope.js email-registration.js receipt-transactions.js payment-operations.js payment-provider.js yape-pilot.js outbox-crypto.js email-outbox.js ./
COPY password-recovery.js password-recovery-crypto.js password-recovery-worker.js push.js push-credentials.js push-provider.js push-worker.js incident-tracking.js ./
COPY workers/ ./workers/
COPY notification-transport.js ./
COPY auth-gateway.cjs admin-date-validation.js ./
COPY services/conversation/ ./services/conversation/
COPY services/auth/reporting.cjs ./services/auth/
COPY services/billing/routes.cjs ./services/billing/
COPY services/operations/routes.cjs ./services/operations/
COPY services/notifications/routes.cjs ./services/notifications/

EXPOSE 3000

CMD ["node", "start.cjs"]
