# FamilyStream Add-on for Home Assistant

This add-on provides integration between FamilyStream and Home Assistant, allowing you to stream music from FamilyStream to any media player in your Home Assistant setup.

## Installation

1. Add the repository URL to your Home Assistant add-on store
2. Install the "FamilyStream" add-on
3. Configure and start the add-on

## Configuration

The add-on has the following configuration options:

| Option | Description |
|--------|-------------|
| `default_media_player` | (Optional) Default media player entity ID to use for casting. Leave empty to select at runtime. |

Example configuration:

```yaml
default_media_player: media_player.living_room_speaker
```

## How to use

1. After starting the add-on, access it through the sidebar in Home Assistant
2. Browse the FamilyStream website as normal
3. When you want to cast audio to a Home Assistant media player, click the "HA" button in the bottom right corner
4. Select a media player from the dropdown menu
5. Click "Cast to Player" to send the currently playing audio to the selected media player

## Troubleshooting

If you encounter any issues:

1. Check the add-on logs for error messages
2. Make sure your media player is available and supports the audio format
3. Try refreshing the player list using the "Refresh Players" button
4. Restart the add-on if problems persist

## Support

For issues and feature requests, please file an issue on GitHub. 