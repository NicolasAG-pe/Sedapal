FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx wget \
    && rm -rf /var/lib/apt/lists/*

RUN rm -rf /var/www/html/*

COPY Frontend/index.html /var/www/html/index.html
COPY Frontend/hm-api-config.js /var/www/html/hm-api-config.js
COPY Frontend/assets/ /var/www/html/assets/
COPY Shared/api.js Shared/ui.js Shared/styles.css Shared/icons.js /var/www/html/shared/
COPY Shared/assets/ /var/www/html/shared/assets/

COPY Frontend/nginx/default.conf /etc/nginx/sites-available/default

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
