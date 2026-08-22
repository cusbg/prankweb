#!/bin/sh
set -eu

GA_ID="${GOOGLE_ANALYTICS:-}"
find /opt/prankweb-frontend -type f -name '*.html' \
  -exec sed -i "s#__GOOGLE_ANALYTICS_ID__#${GA_ID}#g" {} +
