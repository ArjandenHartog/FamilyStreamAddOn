ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bullseye
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    ffmpeg \
    curl \
    jq \
    dbus-x11 \
    xvfb \
    x11vnc \
    firefox-esr \
    pulseaudio \
    alsa-utils \
    pulseaudio-utils \
    supervisor \
    dbus \
    libnss3-tools \
    libpulse0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /tmp/pulse /config

# Create working directory
WORKDIR /app

# Copy application files
COPY app/ /app/

# Install Node.js dependencies
RUN cd /app && npm install

# Copy configuration files
COPY config.yaml /
COPY run.sh /
COPY start_services.sh /
COPY supervisord.conf /etc/supervisor/conf.d/

# Make scripts executable
RUN chmod +x /run.sh /start_services.sh

# Set environment variables
ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV DISPLAY=:99
ENV PULSE_SERVER=unix:/tmp/pulse/native

# Expose port
EXPOSE 8099
EXPOSE 5900

# Set entrypoint
CMD ["/run.sh"] 