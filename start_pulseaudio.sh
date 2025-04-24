#!/bin/bash

# Stop any running PulseAudio processes
killall -9 pulseaudio 2>/dev/null || true

# Create necessary directories with correct permissions
mkdir -p /tmp/pulse
mkdir -p /var/run/pulse
mkdir -p /var/run/pulse/.config/pulse
mkdir -p /root/.config/pulse

# Set proper permissions
chmod -R 777 /tmp/pulse /var/run/pulse /root/.config/pulse

# Create the PulseAudio cookie file
if [ ! -f /var/run/pulse/.config/pulse/cookie ]; then
  dd if=/dev/urandom bs=1 count=256 2>/dev/null | base64 > /var/run/pulse/.config/pulse/cookie
  chmod 600 /var/run/pulse/.config/pulse/cookie
fi

# Create a copy of the cookie file where PulseAudio might look for it
cp /var/run/pulse/.config/pulse/cookie /root/.config/pulse/cookie 2>/dev/null || true

# Create client.conf to disable authentication for local clients
cat > /var/run/pulse/.config/pulse/client.conf << EOF
autospawn = no
daemon-binary = /bin/true
enable-shm = no
disable-shm = yes
EOF

# Create daemon.conf to run without D-Bus
cat > /var/run/pulse/.config/pulse/daemon.conf << EOF
daemonize = no
allow-module-loading = yes
use-pid-file = no
system-instance = yes
local-server-type = system
exit-idle-time = -1
disable-shm = yes
enable-shm = no
disable-memfd = yes
fail-on-connect-error = no
high-priority = yes
nice-level = -11
realtime-scheduling = yes
realtime-priority = 9
EOF

# Set environment variables
export PULSE_CONFIG_PATH=/var/run/pulse/.config/pulse
export PULSE_RUNTIME_PATH=/var/run/pulse
export PULSE_STATE_PATH=/var/run/pulse
export HOME=/var/run/pulse
export PULSE_SERVER=unix:/tmp/pulse/native

# Start PulseAudio with debug info but without D-Bus dependency
exec /usr/bin/pulseaudio --system --disallow-exit --log-level=debug --disallow-module-loading=false \
  --disable-shm=yes --enable-shm=no --exit-idle-time=-1 