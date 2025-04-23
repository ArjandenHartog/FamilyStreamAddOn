#!/usr/bin/with-contenv bash

# Set environment variables
export SUPERVISOR_TOKEN=$(cat /data/options.json | jq -r '.supervisor_token // empty')
export DEFAULT_MEDIA_PLAYER="media_player.slaapkamer"

# Make audio capture script executable
chmod +x /app/audio_capture.sh

echo "Starting FamilyStream Firefox add-on..."
echo "Default media player: ${DEFAULT_MEDIA_PLAYER}"

# Start supervisord with environment variables passed through
exec env SUPERVISOR_TOKEN=$SUPERVISOR_TOKEN DEFAULT_MEDIA_PLAYER=$DEFAULT_MEDIA_PLAYER /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 