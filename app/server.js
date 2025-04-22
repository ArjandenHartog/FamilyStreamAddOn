const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const axios = require('axios');
const https = require('https');
const { exec, spawn } = require('child_process');
const fs = require('fs');

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

// Global variables to track state
let currentFirefoxAudioStream = null;
let streamingProcess = null;

// Function to find Firefox audio stream
async function findFirefoxAudioStream() {
  return new Promise((resolve, reject) => {
    exec('pactl list sink-inputs', (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting audio streams:', error);
        reject(error);
        return;
      }
      
      // Find Firefox audio stream in pactl output
      const lines = stdout.split('\n');
      let sinkInputId = null;
      let sinkId = null;
      let inFirefoxSection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('Sink Input #')) {
          sinkInputId = line.match(/Sink Input #(\d+)/)[1];
          inFirefoxSection = false;
        }
        
        if (line.includes('application.name = "Firefox"') || 
            line.includes('application.name = "firefox"') ||
            line.includes('application.process.binary = "firefox"') ||
            line.includes('application.process.binary = "firefox-esr"')) {
          inFirefoxSection = true;
        }
        
        if (inFirefoxSection && line.startsWith('Sink: ')) {
          sinkId = line.match(/Sink: (\d+)/)[1];
          // Found all the information we need
          break;
        }
      }
      
      if (sinkInputId && inFirefoxSection) {
        console.log(`Found Firefox audio: Sink Input #${sinkInputId}, Sink #${sinkId}`);
        resolve({ sinkInputId, sinkId });
      } else {
        console.log('No Firefox audio stream found. Firefox might be silent or not playing audio.');
        reject(new Error('No Firefox audio stream found'));
      }
    });
  });
}

// Setup audio streaming using ffmpeg
async function setupAudioStream(entityId, volume) {
  try {
    // Stop any existing stream
    if (streamingProcess) {
      streamingProcess.kill();
      streamingProcess = null;
    }
    
    // Find Firefox audio
    const { sinkInputId, sinkId } = await findFirefoxAudioStream();
    
    // Create a virtual sink for Firefox audio if needed
    // This allows us to isolate and capture Firefox audio
    exec(`pactl load-module module-null-sink sink_name=firefox_capture sink_properties=device.description="Firefox Audio Capture"`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error creating virtual sink:', error);
        return;
      }
      
      const virtualSinkId = stdout.trim();
      console.log(`Created virtual sink with ID ${virtualSinkId}`);
      
      // Move Firefox audio to our virtual sink
      exec(`pactl move-sink-input ${sinkInputId} firefox_capture`, async (error, stdout, stderr) => {
        if (error) {
          console.error('Error moving Firefox audio to virtual sink:', error);
          return;
        }
        
        console.log('Moved Firefox audio to virtual sink');
        
        // Prepare HTTP stream for Home Assistant
        const streamUrl = `http://${process.env.HOSTNAME || 'localhost'}:${port}/audio/firefox.mp3`;
        currentFirefoxAudioStream = streamUrl;
        
        // Start FFmpeg to stream from our virtual sink to HTTP
        const ffmpeg = spawn('ffmpeg', [
          '-f', 'pulse',
          '-i', 'firefox_capture.monitor',
          '-acodec', 'libmp3lame',
          '-ab', '192k',
          '-ac', '2',
          '-f', 'mp3',
          '-fflags', 'nobuffer',
          '-content_type', 'audio/mpeg',
          'pipe:1'
        ]);
        
        ffmpeg.stdout.on('data', (data) => {
          // We'll handle this data in the audio endpoint
          // This just sets up the stream
        });
        
        ffmpeg.stderr.on('data', (data) => {
          console.log(`FFmpeg: ${data}`);
        });
        
        ffmpeg.on('close', (code) => {
          console.log(`FFmpeg process exited with code ${code}`);
        });
        
        streamingProcess = ffmpeg;
        
        // Send play command to Home Assistant
        await sendPlayCommand(entityId, streamUrl, volume);
        
        return { success: true, url: streamUrl };
      });
    });
  } catch (error) {
    console.error('Error setting up audio stream:', error);
    throw error;
  }
}

// Send play command to Home Assistant
async function sendPlayCommand(entityId, url, volume) {
  try {
    // Play media on Home Assistant
    const playData = {
      entity_id: entityId,
      media_content_id: url,
      media_content_type: 'music',
      metadata: {
        title: "FamilyStream Audio",
        artist: "Firefox Browser"
      }
    };
    
    await axiosInstance.post('http://supervisor/core/api/services/media_player/play_media', playData, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Set volume if provided
    if (volume !== undefined) {
      await axiosInstance.post('http://supervisor/core/api/services/media_player/volume_set', {
        entity_id: entityId,
        volume_level: volume
      }, {
        headers: {
          Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error sending play command to Home Assistant:', error);
    throw error;
  }
}

// Audio stream endpoint - serves the audio as an HTTP stream
app.get('/audio/firefox.mp3', (req, res) => {
  if (!streamingProcess) {
    return res.status(404).send('No audio stream available');
  }
  
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  streamingProcess.stdout.pipe(res);
  
  req.on('close', () => {
    console.log('Client disconnected from audio stream');
  });
});

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
    res.status(500).json({ error: 'Failed to fetch media players' });
  }
});

// Endpoint to stream Firefox audio to a Home Assistant media player
app.post('/api/play', async (req, res) => {
  try {
    const { entity_id, volume } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    const result = await setupAudioStream(entity_id, volume);
    res.json({ success: true, url: result.url });
  } catch (error) {
    console.error('Error playing media:', error);
    res.status(500).json({ error: 'Failed to play media' });
  }
});

// Endpoint to control media playback
app.post('/api/media_control', async (req, res) => {
  try {
    const { entity_id, action } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
    if (!['play', 'pause', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be play, pause, or stop' });
    }
    
    // If stopping, kill the FFmpeg process
    if (action === 'stop' && streamingProcess) {
      streamingProcess.kill();
      streamingProcess = null;
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
    res.status(500).json({ error: 'Failed to control media' });
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
    res.status(500).json({ error: 'Failed to set volume' });
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