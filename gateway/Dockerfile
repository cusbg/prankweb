#
# Build web-application.
#
FROM node:19.7-bullseye AS frontend

WORKDIR /opt/frontend

# copy package.json and package-lock.json to prevent re-running npm ci on every code change
COPY ./frontend/package.json ./
COPY ./frontend/package-lock.json ./

RUN npm ci

#
# Build the application.
#
FROM frontend AS build
# copy the rest of the source codes and build the application
COPY ./frontend/ ./

ARG GOOGLE_ANALYTICS

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
#
#
FROM nginx:1.25.2

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /opt/frontend/dist /opt/prankweb-frontend
COPY --from=htpasswd /opt/htpasswd/.htpasswd /etc/apache2/.htpasswd

COPY ./gateway/nginx/gateway.conf /etc/nginx/conf.d/
COPY ./gateway/nginx/cors.conf /etc/nginx/
COPY ./gateway/nginx/restricted.conf /etc/nginx/
