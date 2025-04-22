const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const https = require('https');
const { spawn, exec } = require('child_process');
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
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
}));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Global variables to track state
let currentFirefoxAudioStream = null;
let streamingProcess = null;

// Function to find Firefox audio stream (Alpine version)
async function findFirefoxAudioStream() {
  return new Promise((resolve, reject) => {
    // On Alpine Linux, we'll use a different approach
    // First, ensure the audio device exists
    exec('pactl list sinks', (error, stdout, stderr) => {
      if (error) {
        console.error('Error checking audio sinks:', error);
        reject(error);
        return;
      }
      
      // Check if default sink exists
      const lines = stdout.split('\n');
      let defaultSink = 'alsa_output.default';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Name: ')) {
          defaultSink = line.substring(6).trim();
          break;
        }
      }
      
      console.log(`Found default audio sink: ${defaultSink}`);
      resolve({ defaultSink });
    });
  });
}

// Setup audio streaming using ffmpeg (Alpine version)
async function setupAudioStream(entityId, volume) {
  try {
    // Stop any existing stream
    if (streamingProcess) {
      streamingProcess.kill();
      streamingProcess = null;
    }
    
    // Find Firefox audio
    const { defaultSink } = await findFirefoxAudioStream();
    
    // Create a virtual audio sink
    console.log('Setting up PulseAudio virtual sink for Firefox...');
    
    // Create null sink for capturing audio
    exec('pactl load-module module-null-sink sink_name=firefoxcapture sink_properties=device.description="Firefox-Capture"', (error, stdout, stderr) => {
      if (error) {
        console.error('Error creating null sink:', error);
        return;
      }
      
      // Create loopback from default sink to our null sink
      exec('pactl load-module module-loopback source=firefoxcapture.monitor sink=' + defaultSink, (error, stdout, stderr) => {
        if (error) {
          console.error('Error creating loopback:', error);
          return;
        }
        
        console.log('PulseAudio configured for Firefox audio capture');
        
        // Set stream URL
        const streamUrl = `http://${process.env.HOSTNAME || 'localhost'}:${port}/audio/firefox.mp3`;
        currentFirefoxAudioStream = streamUrl;
        
        // Start FFmpeg to stream audio
        console.log('Starting FFmpeg stream...');
        const ffmpeg = spawn('ffmpeg', [
          '-f', 'pulse',
          '-i', 'firefoxcapture.monitor',
          '-acodec', 'libmp3lame',
          '-ab', '192k',
          '-ac', '2',
          '-f', 'mp3',
          '-fflags', 'nobuffer',
          'pipe:1'
        ]);
        
        ffmpeg.stderr.on('data', (data) => {
          console.log(`FFmpeg log: ${data}`);
        });
        
        ffmpeg.on('close', (code) => {
          console.log(`FFmpeg process exited with code ${code}`);
        });
        
        streamingProcess = ffmpeg;
        
        // Send play command to Home Assistant
        sendPlayCommand(entityId, streamUrl, volume)
          .then(() => {
            console.log('Audio streaming started successfully');
          })
          .catch(err => {
            console.error('Error starting audio stream:', err);
          });
      });
    });
    
    return { success: true, message: 'Audio streaming setup initiated' };
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

// API endpoint to get media players from Home Assistant
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
    res.json({ success: true, message: result.message });
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
      
      // Clean up PulseAudio modules
      exec('pactl unload-module module-loopback', () => {
        exec('pactl unload-module module-null-sink', () => {
          console.log('PulseAudio modules unloaded');
        });
      });
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

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 