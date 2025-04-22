const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
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
app.use('/cache', express.static(path.join(__dirname, 'cache'))); // Serve cached files

// Custom middleware to fix MIME types
app.use((req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    if (req.path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    } else if (req.path.endsWith('.css')) {
      res.set('Content-Type', 'text/css');
    } else if (req.path.endsWith('.woff') || req.path.endsWith('.woff2') || req.path.endsWith('.ttf')) {
      res.set('Content-Type', 'font/woff2');
    }
    
    // Add CORS headers to every response
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    return originalSend.call(this, body);
  };
  
  next();
});

// Cache middleware
const cacheDir = path.join(__dirname, 'cache');
const cacheMiddleware = (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') return next();
  
  // Only cache certain file types
  const fileTypes = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
  const shouldCache = fileTypes.some(type => req.path.endsWith(type));
  
  if (!shouldCache) return next();
  
  // Create cache path
  const cachePath = path.join(cacheDir, req.path);
  const cacheDirPath = path.dirname(cachePath);
  
  // Check if file exists in cache
  if (fs.existsSync(cachePath)) {
    console.log(`Serving cached file: ${req.path}`);
    return res.sendFile(cachePath);
  }
  
  // Ensure cache directory exists
  if (!fs.existsSync(cacheDirPath)) {
    fs.mkdirSync(cacheDirPath, { recursive: true });
  }
  
  next();
};

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
    res.status(500).json({ error: 'Failed to fetch media players' });
  }
});

// Endpoint to control playback on a media player
app.post('/api/play', async (req, res) => {
  try {
    const { entity_id, url, title, artist, volume } = req.body;
    
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
    res.status(500).json({ error: 'Failed to play media' });
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

// Serve our custom integration script directly
app.get('/familystream-ha-integration.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'familystream-ha-integration.js'));
});

// Route to fetch any URL from FamilyStream
app.get('/proxy/*', async (req, res) => {
  try {
    const url = req.path.replace('/proxy/', '');
    const fullUrl = `https://web.familystream.com/${url}`;
    
    console.log(`Proxying request to: ${fullUrl}`);
    
    const response = await axiosInstance.get(fullUrl, {
      responseType: 'arraybuffer'
    });
    
    // Set appropriate content type
    if (url.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    } else if (url.endsWith('.css')) {
      res.set('Content-Type', 'text/css');
    } else if (url.endsWith('.woff') || url.endsWith('.woff2')) {
      res.set('Content-Type', 'font/woff2');
    } else if (url.endsWith('.ttf')) {
      res.set('Content-Type', 'font/ttf');
    } else if (url.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (url.endsWith('.svg')) {
      res.set('Content-Type', 'image/svg+xml');
    } else if (url.endsWith('.ico')) {
      res.set('Content-Type', 'image/x-icon');
    } else {
      res.set('Content-Type', response.headers['content-type']);
    }
    
    // Add CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    
    res.send(response.data);
  } catch (error) {
    console.error(`Error proxying request: ${error.message}`);
    res.status(500).send(`Error proxying request: ${error.message}`);
  }
});

// Proxy middleware configuration
const proxyOptions = {
  target: 'https://web.familystream.com',
  changeOrigin: true,
  secure: false,
  followRedirects: true,
  logLevel: 'debug',
  selfHandleResponse: true,
  onProxyReq: (proxyReq, req, res) => {
    // Set cookies and headers to make the request look like it's coming from a browser
    proxyReq.setHeader('Origin', 'https://web.familystream.com');
    proxyReq.setHeader('Referer', 'https://web.familystream.com/');
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Forward cookies
    if (req.headers.cookie) {
      proxyReq.setHeader('Cookie', req.headers.cookie);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Copy all headers from the proxied response
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    
    // Override certain headers for CORS and content types
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Fix content types
    const url = req.url;
    if (url.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (url.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    
    // Handle HTML response to inject our script and rewrite URLs
    if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      let body = '';
      
      // Collect response data
      proxyRes.on('data', chunk => {
        body += chunk.toString();
      });
      
      // Process and send the response
      proxyRes.on('end', () => {
        // Replace absolute URLs with our proxy URLs
        let modifiedBody = body
          .replace(/href="\/design\//g, 'href="/proxy/design/')
          .replace(/src="\/design\//g, 'src="/proxy/design/')
          .replace(/url\(\/design\//g, 'url(/proxy/design/');
        
        // Inject our custom script
        modifiedBody = modifiedBody.replace(
          '</head>',
          `<script>
            // Fix for missing InputPreventDefault function
            if (typeof InputPreventDefault === 'undefined') {
              window.InputPreventDefault = function(event) {
                if (event && event.preventDefault) {
                  event.preventDefault();
                }
                return false;
              };
            }
          </script>
          </head>`
        );
        
        modifiedBody = modifiedBody.replace(
          '</body>',
          `<script src="/familystream-ha-integration.js"></script></body>`
        );
        
        res.send(modifiedBody);
      });
    } else {
      // For non-HTML responses, just pipe the data
      proxyRes.pipe(res);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });
    res.end(`Proxy error: ${err.message}`);
  }
};

// Apply proxy for the home page
app.use('/', createProxyMiddleware(proxyOptions));

// Start the server
app.listen(port, () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 