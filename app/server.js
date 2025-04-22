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

// Endpoint to play media on a Home Assistant player
app.post('/api/play', async (req, res) => {
  try {
    const { entity_id, url, title, artist, volume } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    console.log(`Playing "${title}" by "${artist}" on ${entity_id} with URL: ${url}`);
    
    const playData = {
      entity_id,
      media_content_id: url,
      media_content_type: 'music',
    };
    
    if (title) {
      playData.metadata = {
        title,
        artist: artist || 'FamilyStream',
      };
    }
    
    await axiosInstance.post('http://supervisor/core/api/services/media_player/play_media', playData, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Set volume if provided
    if (volume !== undefined) {
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
    
    console.log(`Setting volume to ${volume} on ${entity_id}`);
    
    await axiosInstance.post('http://supervisor/core/api/services/media_player/volume_set', {
      entity_id,
      volume_level: volume
    }, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting volume:', error);
    res.status(500).json({ error: 'Failed to set volume', details: error.message });
  }
});

// Helper page for the floating controls
app.get('/controls', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controls.html'));
});

// Improved proxy configuration for FamilyStream
const familyStreamProxy = createProxyMiddleware({
  target: 'https://web.familystream.com',
  changeOrigin: true,
  secure: false,
  ws: true,
  followRedirects: true,
  cookieDomainRewrite: {
    '*': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add necessary headers
    proxyReq.setHeader('Origin', 'https://web.familystream.com');
    proxyReq.setHeader('Referer', 'https://web.familystream.com/');
    
    // Log proxy requests for debugging
    console.log(`Proxying request to: ${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Handle CORS headers
    proxyRes.headers['access-control-allow-origin'] = '*';
    
    // Add Home Assistant controls if HTML
    if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      delete proxyRes.headers['content-length'];
      
      const _write = res.write;
      let body = '';
      
      res.write = function(data) {
        if (data) {
          body += data.toString('utf8');
        }
        
        if (body.includes('</body>')) {
          const script = `
            <div id="ha-audio-controls" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 5px; color: white;">
              <button id="ha-open-controls" style="background: #03a9f4; color: white; border: none; padding: 5px 10px; border-radius: 3px;">
                HA Audio Controls
              </button>
              <script>
                document.getElementById('ha-open-controls').addEventListener('click', function() {
                  window.open('/controls', 'ha_controls', 'width=400,height=600');
                });
                
                // Enhanced audio interception
                document.addEventListener('play', function(e) {
                  if (e.target.tagName === 'AUDIO') {
                    console.log('Audio playing:', e.target.src);
                    // Send audio info to HA controls
                    window.postMessage({
                      type: 'ha_audio_playing',
                      url: e.target.src,
                      title: e.target.title || 'Unknown Track',
                      artist: 'FamilyStream'
                    }, '*');
                  }
                }, true);
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
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'nl,en-US;q=0.7,en;q=0.3',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// Apply proxy to all routes not handled by other middleware
app.use('/', familyStreamProxy);

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 