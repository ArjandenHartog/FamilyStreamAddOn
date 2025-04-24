#!/usr/bin/env bash
set -e

CONFIG_PATH=/data/options.json
MEDIA_PLAYER=$(jq --raw-output ".media_player" $CONFIG_PATH)

# Export configuration for streaming script
export MEDIA_PLAYER="$MEDIA_PLAYER"
export HASS_API="http://supervisor/core/api"
export SUPERVISOR_TOKEN="$SUPERVISOR_TOKEN"

# Start supervisor which manages all processes
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf 