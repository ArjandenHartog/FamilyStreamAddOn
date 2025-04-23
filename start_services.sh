#!/bin/bash

# Export environment variables
export DISPLAY=":99"
export PULSE_SERVER="unix:/tmp/pulse/native"
export DEFAULT_MEDIA_PLAYER="media_player.slaapkamer"

# Start Xvfb
/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac &
sleep 2

# Start dbus
/usr/bin/dbus-daemon --system --nofork &
sleep 2

# Start PulseAudio
/usr/bin/pulseaudio --system --realtime=true --disallow-exit --disallow-module-loading=false &
sleep 3

# Start VNC server
/usr/bin/x11vnc -display :99 -forever -shared -nopw &
sleep 2

# Make audio script executable
chmod +x /app/audio_capture.sh

# Start audio capture script
/app/audio_capture.sh &
sleep 2

# Start Node.js server
cd /app
node server.js &
sleep 5

# Start Firefox
/usr/bin/firefox-esr --kiosk --private-window --no-remote --window-size=1920,1080 http://localhost:8099/

# Keep script running
wait 