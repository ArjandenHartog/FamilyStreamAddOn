#!/bin/bash

# Stop any running D-Bus processes
killall -9 dbus-daemon 2>/dev/null || true

# Clean up any existing socket files
rm -f /run/dbus/system_bus_socket 2>/dev/null || true
rm -f /var/run/dbus/system_bus_socket 2>/dev/null || true

# Ensure directories exist with correct permissions
mkdir -p /run/dbus
mkdir -p /var/run/dbus
mkdir -p /var/lib/dbus

# Set proper ownership (messagebus user might not exist, so we handle both cases)
if getent passwd messagebus >/dev/null; then
  chown -R messagebus:messagebus /run/dbus /var/run/dbus /var/lib/dbus
else
  chown -R root:root /run/dbus /var/run/dbus /var/lib/dbus
fi

# Ensure proper permissions
chmod -R 755 /run/dbus /var/run/dbus /var/lib/dbus

# Create necessary symlinks
if [ ! -e /var/run/dbus/system_bus_socket ]; then
  ln -sf /run/dbus/system_bus_socket /var/run/dbus/system_bus_socket
fi

# Generate machine-id if needed
if [ ! -f /etc/machine-id ]; then
  dbus-uuidgen > /etc/machine-id
fi

# Create a custom D-Bus configuration with relaxed permissions
cat > /etc/dbus-custom.conf << EOF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>system</type>
  <fork/>
  <keep_umask/>
  <listen>unix:path=/run/dbus/system_bus_socket</listen>
  <standard_system_servicedirs/>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
    <allow user="*"/>
    <allow receive_type="method_call"/>
    <allow receive_type="method_return"/>
    <allow receive_type="error"/>
    <allow receive_type="signal"/>
    <allow send_type="method_call"/>
    <allow send_type="method_return"/>
    <allow send_type="error"/>
    <allow send_type="signal"/>
  </policy>
</busconfig>
EOF

# Start D-Bus with custom configuration
exec /usr/bin/dbus-daemon --config-file=/etc/dbus-custom.conf --nofork 