#!/usr/bin/with-contenv bashio

CONFIG_PATH=/data/options.json
DEFAULT_MEDIA_PLAYER=$(bashio::config 'default_media_player')

echo "Starting FamilyStream add-on..."
echo "Default media player: $DEFAULT_MEDIA_PLAYER"

# Start the Node.js application
cd /app
export DEFAULT_MEDIA_PLAYER=$DEFAULT_MEDIA_PLAYER
node server.js 