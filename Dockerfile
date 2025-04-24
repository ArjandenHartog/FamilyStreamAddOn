ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.18
FROM ${BUILD_FROM}

# Set environment variables
ENV USER_ID=0
ENV GROUP_ID=0
ENV TZ=Etc/UTC
ENV KEEP_APP_RUNNING=1
ENV DISPLAY_WIDTH=1280
ENV DISPLAY_HEIGHT=720
ENV ENABLE_CJK_FONT=1
ENV DARK_MODE=1

# Install dependencies
RUN apk add --no-cache \
    bash \
    firefox \
    xvfb \
    x11vnc \
    openbox \
    novnc \
    supervisor \
    pulseaudio \
    pulseaudio-utils \
    ffmpeg \
    curl

# Create necessary directories
RUN mkdir -p /root/.vnc /root/.config/pulse /app

# Setup PulseAudio
RUN echo "default-server = unix:/tmp/pulseaudio.socket" > /root/.config/pulse/client.conf && \
    echo "autospawn = no" >> /root/.config/pulse/client.conf && \
    echo "daemon-binary = /bin/true" >> /root/.config/pulse/client.conf && \
    echo "enable-shm = false" >> /root/.config/pulse/client.conf

# Configure PulseAudio server
COPY pulse-server.conf /etc/pulse/server.conf
COPY pulse-client.conf /etc/pulse/client.conf
COPY pulse-default.pa /etc/pulse/default.pa

# Setup supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Setup streaming script
COPY streaming.sh /app/streaming.sh
RUN chmod +x /app/streaming.sh

# Copy Home Assistant integration scripts
COPY run.sh /
RUN chmod a+x /run.sh

# Home Assistant integration scripts
COPY stream-audio.sh /usr/bin/
RUN chmod +x /usr/bin/stream-audio.sh

# Home Assistant add-on configuration
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION} \
    maintainer="Addon Creator" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.vendor="Home Assistant Add-ons" \
    org.opencontainers.image.authors="Addon Creator" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://addons.community" \
    org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
    org.opencontainers.image.documentation="https://github.com/${BUILD_REPOSITORY}/blob/main/README.md" \
    org.opencontainers.image.created=${BUILD_DATE} \
    org.opencontainers.image.revision=${BUILD_REF} \
    org.opencontainers.image.version=${BUILD_VERSION}

EXPOSE 5800 5900

ENTRYPOINT ["/run.sh"] 