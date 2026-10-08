FROM nginx:stable-alpine
COPY Admin/index.html Admin/hm-api-config.js /usr/share/nginx/html/
COPY Admin/assets/ /usr/share/nginx/html/assets/
COPY Shared/ /usr/share/nginx/html/shared/
COPY Frontend/assets/vendor/socket.io.min.js /usr/share/nginx/html/assets/vendor/socket.io.min.js
COPY Admin/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
