FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx wget \
    && rm -rf /var/lib/apt/lists/*

RUN rm -rf /var/www/html/*

COPY index.html /var/www/html/index.html
COPY assets/ /var/www/html/assets/

COPY nginx/default.conf /etc/nginx/sites-available/default

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
