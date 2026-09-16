FROM nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8

COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY snippets/proxy-headers.conf /etc/nginx/snippets/proxy-headers.conf

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["nginx", "-t"]

