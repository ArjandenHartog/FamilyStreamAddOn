#!/usr/bin/with-contenv bashio

echo "Starting FamilyStream add-on..."

# Export Home Assistant supervisor token for API access
export SUPERVISOR_TOKEN="$(bashio::supervisor.token)"

# Export default media player if configured
export DEFAULT_MEDIA_PLAYER="$(bashio::config 'default_media_player')"

# Make sure the PulseAudio socket directory exists
mkdir -p /tmp/pulse

# Create a PulseAudio config
mkdir -p /etc/pulse
cat > /etc/pulse/client.conf << EOF
default-server = unix:/tmp/pulse/native
autospawn = no
daemon-binary = /bin/true
enable-memfd = yes
EOF

# Fix permission rights for supervisor config directory
chmod +x /etc/supervisor/conf.d/supervisord.conf

# Make sure supervisord config directory exists (Alpine path)
mkdir -p /etc/supervisor.d

# Create supervisor config for Alpine
cat > /etc/supervisor.d/familystream.ini << EOF
[supervisord]
nodaemon=true
user=root

[program:xvfb]
command=/usr/bin/Xvfb :99 -screen 0 1920x1080x24
autorestart=true
priority=10

[program:pulseaudio]
command=/usr/bin/pulseaudio --system --disallow-exit --disallow-module-loading=false --high-priority
autorestart=true
priority=20
environment=DISPLAY=":99",PULSE_SERVER="unix:/tmp/pulse/native"

[program:x11vnc]
command=/usr/bin/x11vnc -display :99 -forever -shared -nopw
autorestart=true
priority=30

[program:firefox]
command=/usr/bin/firefox --kiosk --no-remote --private-window https://web.familystream.com
environment=DISPLAY=":99",PULSE_SERVER="unix:/tmp/pulse/native"
autorestart=true
priority=40

[program:nodejs]
command=node /app/server.js
directory=/app
autorestart=true
priority=50
environment=DISPLAY=":99",PULSE_SERVER="unix:/tmp/pulse/native",SUPERVISOR_TOKEN="%(ENV_SUPERVISOR_TOKEN)s",DEFAULT_MEDIA_PLAYER="%(ENV_DEFAULT_MEDIA_PLAYER)s"
EOF

# Start supervisord
exec /usr/bin/supervisord -c /etc/supervisor.d/familystream.ini 