FROM ghcr.io/home-assistant/amd64-base-debian:bullseye

# Install required packages
RUN apt-get update && apt-get install -y \
    firefox-esr \
    xvfb \
    pulseaudio \
    nodejs \
    npm \
    x11vnc \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

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

# Expose ports
EXPOSE 8099 5900

# Set entrypoint
ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"] 