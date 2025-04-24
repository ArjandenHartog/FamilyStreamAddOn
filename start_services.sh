#!/bin/bash

# Export environment variables
export DISPLAY=":99"
export PULSE_SERVER="unix:/tmp/pulse/native"
export DEFAULT_MEDIA_PLAYER="media_player.slaapkamer"

# Ensure script files are executable
chmod +x /start_dbus.sh
chmod +x /start_pulseaudio.sh
chmod +x /app/audio_capture.sh

# Create necessary directories (backup method)
mkdir -p /run/dbus
mkdir -p /var/run/dbus
mkdir -p /var/lib/dbus
mkdir -p /tmp/pulse
mkdir -p /var/run/pulse
mkdir -p /var/run/pulse/.config/pulse
mkdir -p /root/.config/pulse

# Set permissions
chmod -R 755 /run/dbus /var/run/dbus
chmod -R 777 /tmp/pulse /var/run/pulse /root/.config/pulse

# Start Xvfb
/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac &
sleep 2

# Start dbus using our custom script
/bin/bash /start_dbus.sh &
sleep 3

# Start PulseAudio using our custom script
/bin/bash /start_pulseaudio.sh &
sleep 3

# Start VNC server
/usr/bin/x11vnc -display :99 -forever -shared -nopw &
sleep 2

# Start audio capture script (with delay to ensure PulseAudio is ready)
(sleep 15 && /app/audio_capture.sh) &
sleep 2

# Start Node.js server
cd /app
node server.js &
sleep 5

# Start Firefox
/usr/bin/firefox-esr --kiosk --private-window --no-remote --window-size=1920,1080 http://localhost:8099/

# Keep script running
wait 