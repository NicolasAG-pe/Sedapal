FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY config.js auth-contract.js two-factor.js totp-crypto.js email-otp.js email-outbox.js \
     email-provider.js resend-mail.js gmail-mail.js mail-envelope.js email-registration.js \
     outbox-crypto.js password-recovery.js password-recovery-crypto.js notification-transport.js ./
COPY services/auth/internal-transport.cjs services/auth/server.cjs ./services/auth/
# El worker de outbox es código existente del dominio Auth (MS-02): la imagen
# puede ejecutarlo como proceso separado con EMAIL_WORKER_ENABLED=1.
COPY workers/email-outbox.cjs ./workers/email-outbox.cjs
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "services/auth/server.cjs"]
