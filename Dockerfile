ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.16
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install packages
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg \
    curl \
    bash \
    jq

# Create working directory
WORKDIR /app

# Copy application files
COPY app/ /app/

# Install Node.js dependencies
RUN cd /app && npm install

# Copy configuration files
COPY config.yaml /
COPY run.sh /

# Make scripts executable
RUN chmod +x /run.sh

# Set environment variables
ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Expose port
EXPOSE 8099

# Set entrypoint
CMD [ "/run.sh" ] 