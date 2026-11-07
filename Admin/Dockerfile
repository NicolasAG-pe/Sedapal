FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx wget \
    && rm -rf /var/lib/apt/lists/*

COPY Admin/index.html Admin/hm-api-config.js /usr/share/nginx/html/
COPY Admin/assets/ /usr/share/nginx/html/assets/
COPY Shared/ /usr/share/nginx/html/shared/
COPY Frontend/assets/vendor/socket.io.min.js /usr/share/nginx/html/assets/vendor/socket.io.min.js
COPY Admin/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY Admin/nginx/nginx.conf /etc/nginx/hidro.conf
COPY Admin/nginx/security-headers.conf /etc/nginx/hidro-security-headers.conf
USER www-data
EXPOSE 8080
STOPSIGNAL SIGQUIT
ENTRYPOINT []
CMD ["nginx", "-c", "/etc/nginx/hidro.conf", "-g", "daemon off;"]
