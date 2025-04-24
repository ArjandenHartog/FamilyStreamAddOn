#!/usr/bin/with-contenv bash

# Set environment variables
export SUPERVISOR_TOKEN=$(cat /data/options.json | jq -r '.supervisor_token // empty')
export DEFAULT_MEDIA_PLAYER="media_player.slaapkamer"
export DISPLAY=":99"
export PULSE_SERVER="unix:/tmp/pulse/native"

# Ensure script files are executable
chmod +x /start_dbus.sh
chmod +x /start_pulseaudio.sh
chmod +x /app/audio_capture.sh
chmod +x /start_services.sh

# Create necessary directories with proper permissions (backup method)
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

# Try to set ownership if the messagebus user exists
if getent passwd messagebus >/dev/null; then
  chown -R messagebus:messagebus /run/dbus /var/run/dbus /var/lib/dbus
fi

echo "Starting FamilyStream Firefox add-on..."
echo "Default media player: ${DEFAULT_MEDIA_PLAYER}"

# Try to start supervisord
echo "Trying to start services with supervisord..."
if ! /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf; then
    # If supervisord fails, fall back to starting services directly
    echo "Supervisord failed, falling back to direct service start..."
    /start_services.sh
fi 