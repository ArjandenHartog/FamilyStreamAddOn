const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
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
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create API for interacting with Home Assistant
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

// Endpoint to control playback on a media player
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

// Start the server
app.listen(port, () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 