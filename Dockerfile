ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.16
FROM ${BUILD_FROM}

# Install required packages
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    ffmpeg \
    alsa-utils

# Create app directory
WORKDIR /app

# Copy app files
COPY app /app

# Install npm dependencies
RUN cd /app && npm install

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ] 