# FamilyStream Firefox Kiosk Add-on for Home Assistant

This add-on provides a complete Firefox browser in kiosk mode running FamilyStream, with audio capture and forwarding to Home Assistant media players. The add-on creates a dedicated media entity in Home Assistant for easy control.

## Features

- Firefox browser running in fullscreen kiosk mode
- Audio capture from the browser
- Creates a dedicated media entity (`media_player.familystream_audio`) in Home Assistant
- Stream audio to any media player in Home Assistant
- Web-based control interface for media playback
- VNC access to the browser interface (optional)

## Installation

1. Add the repository URL to your Home Assistant add-on store
2. Install the "FamilyStream Firefox Kiosk" add-on
3. Configure and start the add-on

## Configuration

The add-on has the following configuration options:

| Option | Description |
|--------|-------------|
| `default_media_player` | (Optional) Default media player entity ID to use for forwarding audio. Leave empty to select at runtime. |
| `supervisor_token` | Home Assistant Supervisor token (auto-filled on installation) |

Example configuration:

```yaml
default_media_player: media_player.living_room_speaker
supervisor_token: LONG-SUPERVISOR-TOKEN
```

## How to use

1. After starting the add-on, access it through the sidebar in Home Assistant
2. The browser will automatically load FamilyStream in kiosk mode
3. When audio plays on the website, it will be captured and forwarded to:
   - Your default media player (if configured)
   - The `media_player.familystream_audio` entity created by the add-on
4. You can control audio playback through:
   - The floating controls button in the browser
   - Any Home Assistant dashboard or automation using the media entity
   - Home Assistant's media control panel

## Accessing the Audio Controls

Click the "HA Audio Controls" button in the bottom-right corner of the browser to open the control panel. From there, you can:

1. Select any media player in your Home Assistant instance
2. Control volume
3. Play, pause, and stop audio
4. See currently playing content information

## Troubleshooting

If you encounter any issues:

1. Check the add-on logs for error messages
2. Verify that PulseAudio is working correctly (check logs)
3. Make sure your media player is available and supports the audio format
4. Try restarting the add-on if problems persist

## Support

For issues and feature requests, please file an issue on GitHub. 