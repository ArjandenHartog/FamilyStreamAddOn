#!/usr/bin/with-contenv bash

# Set environment variables
export SUPERVISOR_TOKEN=$(cat /data/options.json | jq -r '.supervisor_token // empty')
export DEFAULT_MEDIA_PLAYER="media_player.slaapkamer"
export DISPLAY=":99"
export PULSE_SERVER="unix:/tmp/pulse/native"

# Make audio capture script executable
chmod +x /app/audio_capture.sh

echo "Starting FamilyStream Firefox add-on..."
echo "Default media player: ${DEFAULT_MEDIA_PLAYER}"

# Try to start supervisord
echo "Trying to start services with supervisord..."
if ! /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf; then
    # If supervisord fails, fall back to starting services directly
    echo "Supervisord failed, falling back to direct service start..."
    /start_services.sh
fi 