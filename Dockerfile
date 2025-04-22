ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.16
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install packages
RUN apk add --no-cache \
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    nodejs \
    npm \
    ffmpeg \
    bash \
    curl \
    socat \
    xvfb \
    x11vnc \
    mesa-dri-swrast \
    mesa-gl \
    ttf-dejavu \
    supervisor \
    chromium

# Set up working directory
WORKDIR /app

# Copy application files
COPY app/ /app/

# Install Node.js dependencies
RUN cd /app && npm install

# Copy configuration files
COPY config.yaml /
COPY run.sh /
COPY supervisord.conf /etc/supervisor/conf.d/

# Make scripts executable
RUN chmod +x /run.sh

# Set up virtual display and audio
ENV DISPLAY=:99
ENV PULSE_SERVER=unix:/tmp/pulse/native

# Create directory for PulseAudio socket
RUN mkdir -p /tmp/pulse

# Expose ports
EXPOSE 8099 5900

# Set entrypoint
CMD [ "/run.sh" ] 