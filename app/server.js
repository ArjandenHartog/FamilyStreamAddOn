const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const axios = require('axios');
const https = require('https');

const app = express();
const port = process.env.PORT || 8099;
const defaultMediaPlayer = process.env.DEFAULT_MEDIA_PLAYER || '';

// Audio stream state
let currentAudioState = {
  is_playing: false,
  stream_url: '',
  title: 'FamilyStream Audio',
  artist: 'FamilyStream',
  entity_id: defaultMediaPlayer
};

// Create axios instance with SSL verification disabled
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

// Middleware
app.use(compression()); // Enable compression
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
})); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON request bodies

// Serve static files (for helper UI)
app.use('/ha-controls', express.static(path.join(__dirname, 'public')));

// API for HA media players
app.get('/api/media_players', async (req, res) => {
  try {
    const haResponse = await axiosInstance.get('http://supervisor/core/api/states', {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    const mediaPlayers = haResponse.data
      .filter(entity => entity.entity_id.startsWith('media_player.'))
      .map(entity => ({
        entity_id: entity.entity_id,
        name: entity.attributes.friendly_name || entity.entity_id,
        state: entity.state,
      }));
    
    res.json(mediaPlayers);
  } catch (error) {
    console.error('Error fetching media players:', error);
    res.status(500).json({ error: 'Failed to fetch media players', details: error.message });
  }
});

// Endpoint to receive notification about audio stream
app.post('/api/notify_audio_stream', async (req, res) => {
  try {
    const { stream_url, title, artist, is_playing } = req.body;
    
    // Update current audio state
    if (stream_url) currentAudioState.stream_url = stream_url;
    if (title) currentAudioState.title = title;
    if (artist) currentAudioState.artist = artist || 'FamilyStream';
    currentAudioState.is_playing = is_playing;
    
    // If we have a default media player and stream is playing, send to Home Assistant
    if (defaultMediaPlayer && is_playing && stream_url) {
      await playAudioOnHomeAssistant(defaultMediaPlayer, stream_url, title, artist);
      console.log(`Sent audio stream to ${defaultMediaPlayer}: ${title}`);
    } else if (defaultMediaPlayer && !is_playing) {
      // Stop playback if audio stopped
      await stopAudioOnHomeAssistant(defaultMediaPlayer);
      console.log(`Stopped audio on ${defaultMediaPlayer}`);
    }
    
    res.json({ success: true, current_state: currentAudioState });
  } catch (error) {
    console.error('Error handling audio stream notification:', error);
    res.status(500).json({ error: 'Failed to handle audio stream', details: error.message });
  }
});

// Endpoint to get current audio state
app.get('/api/audio_state', (req, res) => {
  res.json(currentAudioState);
});

// Endpoint to play media on a Home Assistant player
app.post('/api/play', async (req, res) => {
  try {
    const { entity_id, url, title, artist, volume } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    // Update current audio state with new target entity
    currentAudioState.entity_id = entity_id;
    
    if (url) {
      await playAudioOnHomeAssistant(entity_id, url, title, artist);
      console.log(`Playing "${title}" by "${artist}" on ${entity_id} with URL: ${url}`);
    }
    
    // Set volume if provided
    if (volume !== undefined) {
      await setVolumeOnHomeAssistant(entity_id, volume);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error playing media:', error);
    res.status(500).json({ error: 'Failed to play media', details: error.message });
  }
});

// Endpoint to control media playback (play/pause/stop)
app.post('/api/media_control', async (req, res) => {
  try {
    const { entity_id, action } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    if (!['play', 'pause', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be play, pause, or stop' });
    }
    
    console.log(`Sending ${action} command to ${entity_id}`);
    
    // Update current audio state
    currentAudioState.entity_id = entity_id;
    if (action === 'stop') {
      currentAudioState.is_playing = false;
    }
    
    // Map actions to Home Assistant services
    const serviceMap = {
      play: 'media_play',
      pause: 'media_pause',
      stop: 'media_stop'
    };
    
    const service = serviceMap[action];
    
    await axiosInstance.post(`http://supervisor/core/api/services/media_player/${service}`, {
      entity_id
    }, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error controlling media:', error);
    res.status(500).json({ error: 'Failed to control media', details: error.message });
  }
});

// Endpoint to set volume
app.post('/api/volume', async (req, res) => {
  try {
    const { entity_id, volume } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    if (volume === undefined || volume < 0 || volume > 1) {
      return res.status(400).json({ error: 'Volume must be a value between 0 and 1' });
    }
    
    await setVolumeOnHomeAssistant(entity_id, volume);
    console.log(`Setting volume to ${volume} on ${entity_id}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting volume:', error);
    res.status(500).json({ error: 'Failed to set volume', details: error.message });
  }
});

// Helper function to play audio on Home Assistant
async function playAudioOnHomeAssistant(entity_id, url, title, artist) {
  const playData = {
    entity_id,
    media_content_id: url,
    media_content_type: 'music',
  };
  
  if (title) {
    playData.metadata = {
      title,
      artist: artist || 'FamilyStream',
      media_class: 'music',
    };
  }
  
  await axiosInstance.post('http://supervisor/core/api/services/media_player/play_media', playData, {
    headers: {
      Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  
  // Create/update media entity in Home Assistant
  await createOrUpdateMediaEntity();
}

// Helper function to stop audio on Home Assistant
async function stopAudioOnHomeAssistant(entity_id) {
  await axiosInstance.post('http://supervisor/core/api/services/media_player/media_stop', {
    entity_id
  }, {
    headers: {
      Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  
  // Update media entity state
  await createOrUpdateMediaEntity(false);
}

// Helper function to set volume on Home Assistant
async function setVolumeOnHomeAssistant(entity_id, volume) {
  await axiosInstance.post('http://supervisor/core/api/services/media_player/volume_set', {
    entity_id,
    volume_level: volume
  }, {
    headers: {
      Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

// Helper function to create or update a media entity in Home Assistant
async function createOrUpdateMediaEntity(is_playing = true) {
  try {
    const entityId = 'media_player.familystream_audio';
    const state = is_playing ? 'playing' : 'idle';
    
    const entityData = {
      state: state,
      attributes: {
        friendly_name: 'FamilyStream Audio',
        source: 'FamilyStream',
        media_title: currentAudioState.title,
        media_artist: currentAudioState.artist,
        media_content_id: currentAudioState.stream_url,
        media_content_type: 'music',
        supported_features: 20753, // Standard media player features
        device_class: 'speaker',
        icon: 'mdi:cast-audio',
        volume_level: 1.0,
        is_volume_muted: false,
      }
    };
    
    await axiosInstance.post(`http://supervisor/core/api/states/${entityId}`, entityData, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`Updated media entity ${entityId} with state: ${state}`);
  } catch (error) {
    console.error('Error creating/updating media entity:', error);
  }
}

// Helper page for the floating controls
app.get('/controls', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controls.html'));
});

// Proxy all other requests to web.familystream.com
app.use('/', createProxyMiddleware({
  target: 'https://web.familystream.com',
  changeOrigin: true,
  secure: false,
  ws: true,
  onProxyReq: (proxyReq, req, res) => {
    // Add cookie handling if needed
    console.log(`Proxying request to: ${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add script to page for HA audio controls
    if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      delete proxyRes.headers['content-length'];
      
      const _write = res.write;
      let body = '';
      
      res.write = function(data) {
        if (data) {
          body += data.toString('utf8');
        }
        
        if (body.includes('</body>')) {
          // Add our floating controls before the end of body
          const script = `
            <div id="ha-audio-controls" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 5px; color: white;">
              <button id="ha-open-controls" style="background: #03a9f4; color: white; border: none; padding: 5px 10px; border-radius: 3px;">
                HA Audio Controls
              </button>
              <script>
                document.getElementById('ha-open-controls').addEventListener('click', function() {
                  window.open('/controls', 'ha_controls', 'width=400,height=600');
                });
                
                // Intercept audio elements to add Home Assistant controls
                const originalAudioPlay = Audio.prototype.play;
                Audio.prototype.play = function() {
                  console.log('Audio playing:', this.src);
                  fetch('/api/notify_audio_stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      stream_url: 'http://localhost:8081',
                      title: 'FamilyStream Audio',
                      is_playing: true
                    })
                  });
                  return originalAudioPlay.apply(this);
                };
                
                const originalAudioPause = Audio.prototype.pause;
                Audio.prototype.pause = function() {
                  console.log('Audio paused');
                  fetch('/api/notify_audio_stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_playing: false })
                  });
                  return originalAudioPause.apply(this);
                };
              </script>
            </div>
          `;
          
          body = body.replace('</body>', script + '</body>');
          return _write.call(res, body);
        }
        
        return _write.call(res, data);
      };
    }
  },
  pathRewrite: {
    '^/': '/'
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/91.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'nl,en-US;q=0.7,en;q=0.3',
    'Referer': 'https://web.familystream.com/'
  }
}));

// Start the server
app.listen(port, () => {
  console.log(`FamilyStream Firefox add-on running on port ${port}`);
  
  // Create initial media entity
  createOrUpdateMediaEntity(false);
  
  console.log('Audio capture system initialized');
  if (defaultMediaPlayer) {
    console.log(`Default media player set to: ${defaultMediaPlayer}`);
  } else {
    console.log('No default media player set');
  }
}); 