FROM node:22-alpine
WORKDIR /app
COPY email-provider.js resend-mail.js gmail-mail.js email-otp.js notification-transport.js ./
COPY services/notifications/server.cjs ./services/notifications/server.cjs
USER node
EXPOSE 3104
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3104)+'/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "services/notifications/server.cjs"]
