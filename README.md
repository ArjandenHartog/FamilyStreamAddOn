# Firefox with Audio Streaming

## Home Assistant Add-on for Firefox with Audio Streaming to Media Player

This Home Assistant add-on provides a Firefox browser instance with audio streaming capabilities. The audio from Firefox is captured and automatically streamed to a configured Home Assistant media player entity.

## Features

- Full Firefox browser experience within Home Assistant
- Audio capture and streaming to any Home Assistant media player
- Easy configuration with a single setting
- Available through Ingress for seamless Home Assistant integration
- Based on the official Firefox browser

## Installation

1. Add this repository to your Home Assistant instance
2. Install the "Firefox with Audio Streaming" add-on
3. Configure the media player entity for audio output
4. Start the add-on

## Configuration

The add-on requires minimal configuration:

```yaml
media_player: "your_media_player"  # The media_player entity to send audio to (without the media_player. prefix)
```

### Options

#### Option: `media_player`

The media player entity ID to which the Firefox audio will be streamed. This should be just the entity ID without the `media_player.` prefix.

For example, if your media player is `media_player.living_room_speaker`, enter `living_room_speaker`.

## How it works

1. The add-on starts a Firefox browser in a Docker container
2. PulseAudio is configured to capture all audio from Firefox
3. FFmpeg captures the audio and streams it to your configured media player
4. You can access Firefox through the Home Assistant interface

## Support

For issues with this add-on, please open an issue on GitHub.

## License

MIT License 