# Host nginx Cloudflare geo trust (CheckStation)
#
# Install on the VPS (not inside the frontend container):
#
#   1. Copy conf files to /etc/nginx/checkstation/
#   2. In http {} of nginx.conf (or a conf.d include):
#        include /etc/nginx/checkstation/cloudflare-realip.conf;
#        include /etc/nginx/checkstation/cloudflare-geo-map.conf;
#   3. In every location that proxies to checkstation_backend, after the usual
#      Host / X-Forwarded-* headers:
#        include /etc/nginx/checkstation/proxy-geo-headers.conf;
#   4. nginx -t && systemctl reload nginx
#
# Docs/status/manager DNS-only peers are not Cloudflare → trusted country empty
# → Django falls back to global/en. Japan47 and Umami are untouched.
