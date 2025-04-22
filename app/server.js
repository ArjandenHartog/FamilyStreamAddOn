const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 8099;
const defaultMediaPlayer = process.env.DEFAULT_MEDIA_PLAYER || '';

// Middleware
app.use(compression()); // Enable compression
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public')));
app.use('/cache', express.static(path.join(__dirname, 'cache'))); // Serve cached files

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

// Serve our custom integration script directly
app.get('/familystream-ha-integration.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'familystream-ha-integration.js'));
});

// Apply cache middleware
app.use(cacheMiddleware);

// Proxy to FamilyStream website with improved configuration
const proxyOptions = {
  target: 'https://web.familystream.com',
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  logLevel: 'debug',
  autoRewrite: true,
  protocolRewrite: 'https',
  cookieDomainRewrite: { '*': '' },
  onProxyRes: function(proxyRes, req, res) {
    // Fix CORS issues
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    
    // Fix content-type issues for scripts
    if (req.path.endsWith('.js') && proxyRes.headers['content-type'] === 'text/plain') {
      proxyRes.headers['content-type'] = 'application/javascript';
    }
    
    // Cache static files
    const fileTypes = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
    const shouldCache = fileTypes.some(type => req.path.endsWith(type));
    
    if (shouldCache) {
      const cachePath = path.join(cacheDir, req.path);
      const cacheDirPath = path.dirname(cachePath);
      
      if (!fs.existsSync(cacheDirPath)) {
        fs.mkdirSync(cacheDirPath, { recursive: true });
      }
      
      let body = Buffer.from([]);
      const _write = res.write;
      res.write = function(chunk) {
        body = Buffer.concat([body, chunk]);
        return _write.call(res, chunk);
      };
      
      const _end = res.end;
      res.end = function() {
        fs.writeFileSync(cachePath, body);
        console.log(`Cached file: ${req.path}`);
        _end.call(res);
      };
    }
    
    // Inject our script only in HTML responses
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
        // Fix any broken relative URLs
        let modifiedBody = originalBody
          .replace(/src="\/design\//g, 'src="/design/')
          .replace(/href="\/design\//g, 'href="/design/')
          .replace(/url\(\/design\//g, 'url(/design/');
          
        // Inject our script before the closing body tag
        modifiedBody = modifiedBody.replace(
          '</body>',
          `<script src="/familystream-ha-integration.js"></script></body>`
        );
        
        // Add polyfill for missing InputPreventDefault function
        modifiedBody = modifiedBody.replace(
          '<head>',
          `<head>
          <script>
            // Fix for missing InputPreventDefault function
            if (typeof InputPreventDefault === 'undefined') {
              window.InputPreventDefault = function(event) {
                if (event && event.preventDefault) {
                  event.preventDefault();
                }
                return false;
              };
            }
          </script>`
        );
        
        _write.call(res, Buffer.from(modifiedBody));
        _end.call(res);
      };
    }
  },
  // Handle errors in proxy
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });
    res.end('Proxy error connecting to FamilyStream: ' + err.message);
  },
  // Modify request headers
  onProxyReq: (proxyReq, req, res) => {
    // Set referer to the original site to avoid referer-based blocking
    proxyReq.setHeader('Referer', 'https://web.familystream.com/');
    proxyReq.setHeader('Origin', 'https://web.familystream.com');
    
    // Set cookie handling
    proxyReq.setHeader('Cookie', req.headers.cookie || '');
    
    // Keep alive connection
    proxyReq.setHeader('Connection', 'keep-alive');
  }
};

// Apply proxy middleware with proper routing
app.use('/', createProxyMiddleware(proxyOptions));

// Start the server
app.listen(port, () => {
  console.log(`FamilyStream add-on running on port ${port}`);
}); 