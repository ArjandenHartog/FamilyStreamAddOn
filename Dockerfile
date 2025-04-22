ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.16
FROM ${BUILD_FROM}

# Install required packages
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    ffmpeg \
    alsa-utils \
    ca-certificates \
    curl \
    openssl

# Create app directory
WORKDIR /app

# Copy app files
COPY app /app

# Install npm dependencies
RUN cd /app && npm install

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

# Create cache directories for static files
RUN mkdir -p /app/cache/design/css
RUN mkdir -p /app/cache/design/js
RUN mkdir -p /app/cache/design/fonts
RUN mkdir -p /app/cache/design/images

# Set environment variables
ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

CMD [ "/run.sh" ] 