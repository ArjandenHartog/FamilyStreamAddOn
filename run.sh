#!/usr/bin/with-contenv bashio

# Export Home Assistant supervisor token
export SUPERVISOR_TOKEN=$(bashio::config 'supervisor_token')

# Export default media player if configured
export DEFAULT_MEDIA_PLAYER=$(bashio::config 'default_media_player')

# Start supervisord which will manage all services
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 