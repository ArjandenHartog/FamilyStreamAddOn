#!/usr/bin/env bash
set -e

# Wait for PulseAudio to be ready
until pactl info &> /dev/null; do
  echo "Waiting for PulseAudio to start..."
  sleep 1
done

echo "PulseAudio started, setting up audio streaming..."

# Wait for the configured media player
if [ -z "$MEDIA_PLAYER" ]; then
  echo "No media player configured. Audio streaming disabled."
  # Keep script running even if no media player to avoid supervisor restarts
  while true; do sleep 3600; done
fi

echo "Streaming audio to media player: $MEDIA_PLAYER"

# Create audio stream
STREAM_URL="http://localhost:8123/api/stream"
HEADERS=(-H "Authorization: Bearer $SUPERVISOR_TOKEN" -H "Content-Type: application/json")
MEDIA_PLAYER_ENTITY="media_player.$MEDIA_PLAYER"

# Start FFmpeg to capture audio from PulseAudio and stream it
exec ffmpeg -loglevel warning \
  -f pulse -i stream.monitor \
  -ac 2 -ar 44100 -f mp3 -acodec libmp3lame -ab 128k \
  -metadata title="Firefox Audio Stream" \
  -metadata artist="Home Assistant Add-on" \
  -re -fflags +genpts \
  pipe:1 | \
while true; do
  # Try to send audio to the media player
  curl -X POST "${HASS_API}/services/media_player/play_media" \
    "${HEADERS[@]}" \
    -d "{\"entity_id\":\"${MEDIA_PLAYER_ENTITY}\",\"media_content_id\":\"${STREAM_URL}\",\"media_content_type\":\"music\"}" \
    || echo "Failed to send audio to media player"
  
  # Wait before trying again
  sleep 5
done 