#
# Build web-application.
#
FROM node:24-bullseye AS frontend
WORKDIR /opt/frontend

COPY ./frontend/package.json ./frontend/package-lock.json ./
RUN npm ci

COPY ./frontend/ ./
RUN npm run build

#
# Prepare passwords.
#
FROM debian:bookworm-20231009 AS htpasswd

RUN apt-get update && apt-get -y install apache2-utils

ARG WEB_SERVICE_USER
ARG WEB_SERVICE_PASSWORD

WORKDIR /opt/htpasswd
# https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-http-basic-authentication/
RUN htpasswd -b -c /opt/htpasswd/.htpasswd ${WEB_SERVICE_USER} ${WEB_SERVICE_PASSWORD}

#
# Gateway image
#
FROM nginx:1.25.2

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=frontend /opt/frontend/dist /opt/prankweb-frontend
COPY --from=htpasswd /opt/htpasswd/.htpasswd /etc/apache2/.htpasswd

COPY ./gateway/nginx/cors.conf /etc/nginx/
COPY ./gateway/nginx/restricted.conf /etc/nginx/

COPY ./gateway/conf.d/ /etc/nginx/conf.d/
COPY ./gateway/docker-entrypoint.d/ /docker-entrypoint.d/

RUN chmod +x /docker-entrypoint.d/20-google-analytics.sh
