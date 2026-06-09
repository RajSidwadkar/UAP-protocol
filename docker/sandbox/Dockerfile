FROM node:20-alpine
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
RUN apk add --no-cache dumb-init
WORKDIR /tool
COPY runner.js .
USER sandbox
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "/tool/runner.js"]
