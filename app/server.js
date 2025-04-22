const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 8099;
const defaultMediaPlayer = process.env.DEFAULT_MEDIA_PLAYER || '';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Create API for interacting with Home Assistant
app.get('/api/media_players', async (req, res) => {
  try {
    const haResponse = await axios.get('http://supervisor/core/api/states', {
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

// Endpoint to control playback on a media player
app.post('/api/play', async (req, res) => {
  try {
    const { entity_id, url, title, artist } = req.body;
    
    if (!entity_id) {
      return res.status(400).json({ error: 'Media player entity ID is required' });
    }
    
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
    
    await axios.post('http://supervisor/core/api/services/media_player/play_media', playData, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error playing media:', error);
    res.status(500).json({ error: 'Failed to play media' });
  }
});

// Proxy to FamilyStream website
app.use('/', createProxyMiddleware({
  target: 'https://web.familystream.com',
  changeOrigin: true,
  onProxyRes: function(proxyRes, req, res) {
    // Inject our script to capture audio and add controls
    if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      delete proxyRes.headers['content-length'];
      let originalBody = '';
      const _write = res.write;
      res.write = function(chunk) {
        originalBody += chunk.toString('utf8');
        return true;
      };
      
      const _end = res.end;
      res.end = function() {
        // Inject our script before the closing body tag
        const modifiedBody = originalBody.replace(
          '</body>',
          `<script src="/familystream-ha-integration.js"></script></body>`
        );
        _write.call(res, Buffer.from(modifiedBody));
        _end.call(res);
      };
    }
  }
}));

// Start the server
app.listen(port, () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 