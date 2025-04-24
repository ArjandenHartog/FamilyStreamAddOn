#!/bin/bash

echo "Audio capture system initialized"

# Wait for pulseaudio to start and become responsive
MAX_RETRIES=30
RETRY_COUNT=0

while ! pulseaudio --check && [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Waiting for PulseAudio to start... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT+1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "PulseAudio failed to start after $MAX_RETRIES attempts"
    
    # Try to restart PulseAudio if it's not running
    killall -9 pulseaudio 2>/dev/null
    sleep 2
    /usr/bin/pulseaudio --system --realtime=true --disallow-exit --disallow-module-loading=false &
    sleep 5
fi

# Create a virtual sink for capturing Firefox audio
pacmd load-module module-null-sink sink_name=firefox_audio sink_properties=device.description="Firefox Audio Capture" || echo "Failed to create virtual sink"

# Create a virtual source that monitors the Firefox sink
pacmd load-module module-virtual-source source_name=firefox_monitor master=firefox_audio.monitor source_properties=device.description="Firefox Audio Monitor" || echo "Failed to create virtual source"

# Set Firefox to use the virtual sink
pacmd set-default-sink firefox_audio || echo "Failed to set default sink"

echo "Audio capture system ready!"

# Monitor for audio and create an HTTP stream
while true; do
  # Check if audio is playing - with error handling
  if pactl list sink-inputs 2>/dev/null | grep -q "RUNNING"; then
    # If not already streaming, start streaming
    if ! pgrep -f "ffmpeg.*http" > /dev/null; then
      echo "Audio detected, starting stream..."
      
      # Start streaming to a local HTTP endpoint
      ffmpeg -hide_banner -loglevel error \
        -f pulse -i firefox_audio.monitor \
        -c:a mp3 -b:a 128k -content_type audio/mp3 \
        -f mp3 -listen 1 http://localhost:8081 &
      
      # Notify Node.js server about the audio stream
      curl -X POST http://localhost:8099/api/notify_audio_stream \
        -H "Content-Type: application/json" \
        -d '{"stream_url": "http://localhost:8081", "title": "FamilyStream Audio", "is_playing": true}' || echo "Failed to notify server"
    fi
  else
    # If no audio is playing but we're streaming, stop the stream
    if pgrep -f "ffmpeg.*http" > /dev/null; then
      echo "No audio detected, stopping stream..."
      pkill -f "ffmpeg.*http"
      
      # Notify Node.js server that audio has stopped
      curl -X POST http://localhost:8099/api/notify_audio_stream \
        -H "Content-Type: application/json" \
        -d '{"is_playing": false}' || echo "Failed to notify server"
    fi
  fi
  
  sleep 2
done 