# FamilyStream Firefox Kiosk for Home Assistant

This add-on provides a complete Firefox kiosk solution for FamilyStream with audio capture and integration with Home Assistant's media player system. It creates a dedicated media entity that can be used in automations and dashboards.

## Features

- Firefox browser running in kiosk mode for FamilyStream
- Audio capture from the browser with ffmpeg
- Dedicated media player entity in Home Assistant
- Stream audio to any Home Assistant media player
- Control volume and playback through Home Assistant
- Web-based control interface
- VNC access for troubleshooting (port 5900)

## Technical Details

- Uses Firefox ESR in kiosk mode on a Debian base
- PulseAudio for audio routing
- Virtual audio devices to capture browser audio
- FFmpeg for audio streaming via HTTP
- Node.js server for proxying and controlling the system

## Installation

1. Add this repository URL to your Home Assistant add-on store
2. Install the "FamilyStream Firefox Kiosk" add-on
3. Configure the add-on with your preferences
4. Start the add-on and access it through the sidebar

## Configuration

See the [Documentation](DOCS.md) for detailed configuration options and usage instructions. 