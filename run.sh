#!/usr/bin/with-contenv bash

# Set environment variables
export SUPERVISOR_TOKEN=$(cat /data/options.json | jq -r '.supervisor_token // empty')
export DEFAULT_MEDIA_PLAYER=$(cat /data/options.json | jq -r '.default_media_player // empty')

echo "Starting FamilyStream add-on..."
echo "Default media player: ${DEFAULT_MEDIA_PLAYER}"

# Start the Node.js server
cd /app
node server.js 