// FamilyStream Home Assistant Integration Script
(function() {
  // Ensure script only runs once
  if (window.familyStreamHAIntegrationLoaded) return;
  window.familyStreamHAIntegrationLoaded = true;
  
  console.log('FamilyStream Home Assistant integration initializing...');

  // Style for the controller UI
  const style = document.createElement('style');
  style.innerHTML = `
    .ha-controller {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #03a9f4;
      color: white;
      border-radius: 10px;
      padding: 10px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      max-width: 300px;
    }
    .ha-controller h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
    }
    .ha-controller select {
      width: 100%;
      padding: 5px;
      margin-bottom: 10px;
      border-radius: 5px;
      border: none;
    }
    .ha-controller button {
      background-color: #0288d1;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 5px;
      cursor: pointer;
      margin-right: 5px;
    }
    .ha-controller button:hover {
      background-color: #026da7;
    }
    .ha-controller-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #03a9f4;
      color: white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 10000;
    }
    .ha-status {
      font-size: 12px;
      margin-top: 5px;
    }
  `;
  document.head.appendChild(style);

  // Wait until DOM is fully loaded
  function initializeUI() {
    // Create toggle button
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'ha-controller-toggle';
    toggleBtn.innerHTML = 'HA';
    toggleBtn.addEventListener('click', toggleController);
    document.body.appendChild(toggleBtn);
  
    // Create controller UI
    const controller = document.createElement('div');
    controller.className = 'ha-controller';
    controller.style.display = 'none';
    controller.innerHTML = `
      <h3>FamilyStream HA Controller</h3>
      <select id="ha-media-player"></select>
      <div>
        <button id="ha-cast-btn">Cast to Player</button>
        <button id="ha-refresh-btn">Refresh Players</button>
      </div>
      <div class="ha-status" id="ha-status"></div>
    `;
    document.body.appendChild(controller);
  
    // Function to toggle controller visibility
    function toggleController() {
      if (controller.style.display === 'none') {
        controller.style.display = 'block';
        toggleBtn.style.display = 'none';
        loadMediaPlayers();
      } else {
        controller.style.display = 'none';
        toggleBtn.style.display = 'flex';
      }
    }
  
    // Get elements
    const mediaPlayerSelect = document.getElementById('ha-media-player');
    const castBtn = document.getElementById('ha-cast-btn');
    const refreshBtn = document.getElementById('ha-refresh-btn');
    const statusEl = document.getElementById('ha-status');
  
    // Load media players from Home Assistant
    async function loadMediaPlayers() {
      try {
        statusEl.textContent = 'Loading media players...';
        const response = await fetch('/api/media_players');
        const mediaPlayers = await response.json();
        
        // Clear previous options
        mediaPlayerSelect.innerHTML = '';
        
        // Add options for each media player
        mediaPlayers.forEach(player => {
          const option = document.createElement('option');
          option.value = player.entity_id;
          option.textContent = `${player.name} (${player.state})`;
          mediaPlayerSelect.appendChild(option);
        });
        
        statusEl.textContent = `Loaded ${mediaPlayers.length} media players`;
      } catch (error) {
        console.error('Error loading media players:', error);
        statusEl.textContent = 'Error loading media players';
      }
    }
  
    // Find all audio elements in the page (including those in iframes if possible)
    function findAudioElements() {
      let audioElements = document.querySelectorAll('audio');
      
      if (audioElements.length === 0) {
        // Try to find audio in iframes
        try {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeAudioElements = iframe.contentDocument.querySelectorAll('audio');
              audioElements = [...audioElements, ...iframeAudioElements];
            } catch (e) {
              console.log('Could not access iframe content:', e);
            }
          }
        } catch (e) {
          console.log('Error finding audio in iframes:', e);
        }
      }
      
      return audioElements;
    }
    
    // Function to find playing track information
    function findTrackInfo() {
      // Default track info
      let trackInfo = {
        title: 'FamilyStream Audio',
        artist: '',
        audioSrc: ''
      };
      
      // Check for audio elements
      const audioElements = findAudioElements();
      if (audioElements.length > 0) {
        // Get the audio element that is currently playing or the first one
        const audioElement = Array.from(audioElements).find(audio => !audio.paused) || audioElements[0];
        trackInfo.audioSrc = audioElement.src || audioElement.currentSrc;
      }
      
      // Try to find metadata in the page
      // Look for possible title elements
      const possibleTitleElements = document.querySelectorAll('.title, .track-title, .song-title, h1, h2');
      for (const el of possibleTitleElements) {
        if (el.textContent.trim()) {
          trackInfo.title = el.textContent.trim();
          break;
        }
      }
      
      // Look for possible artist elements
      const possibleArtistElements = document.querySelectorAll('.artist, .track-artist, .song-artist');
      for (const el of possibleArtistElements) {
        if (el.textContent.trim()) {
          trackInfo.artist = el.textContent.trim();
          break;
        }
      }
      
      // If no audio source was found, try to find media URLs in the page
      if (!trackInfo.audioSrc) {
        // Look for media sources in source elements
        const sourceElements = document.querySelectorAll('source');
        for (const source of sourceElements) {
          if (source.src && (source.src.endsWith('.mp3') || source.src.endsWith('.m4a') || source.src.endsWith('.wav'))) {
            trackInfo.audioSrc = source.src;
            break;
          }
        }
        
        // Look for media sources in links
        if (!trackInfo.audioSrc) {
          const linkElements = document.querySelectorAll('a[href]');
          for (const link of linkElements) {
            if (link.href && (link.href.endsWith('.mp3') || link.href.endsWith('.m4a') || link.href.endsWith('.wav'))) {
              trackInfo.audioSrc = link.href;
              break;
            }
          }
        }
      }
      
      return trackInfo;
    }
  
    // Function to capture current playing audio and cast to HA
    async function castToHomeAssistant() {
      try {
        // Get selected media player
        const entityId = mediaPlayerSelect.value;
        if (!entityId) {
          statusEl.textContent = 'Please select a media player';
          return;
        }
  
        // Find track info
        const trackInfo = findTrackInfo();
        if (!trackInfo.audioSrc) {
          // If we still don't have an audio source, try to use the current page URL
          // FamilyStream might be using a custom player that's harder to detect
          trackInfo.audioSrc = window.location.href;
          statusEl.textContent = 'Using page URL as fallback source';
        }
  
        // Cast to Home Assistant
        statusEl.textContent = 'Casting to ' + entityId + '...';
        const response = await fetch('/api/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_id: entityId,
            url: trackInfo.audioSrc,
            title: trackInfo.title,
            artist: trackInfo.artist
          }),
        });
  
        const result = await response.json();
        if (result.success) {
          statusEl.textContent = 'Successfully cast to ' + entityId;
        } else {
          statusEl.textContent = 'Error: ' + (result.error || 'Unknown error');
        }
      } catch (error) {
        console.error('Error casting to Home Assistant:', error);
        statusEl.textContent = 'Error casting to media player';
      }
    }
  
    // Add event listeners
    castBtn.addEventListener('click', castToHomeAssistant);
    refreshBtn.addEventListener('click', loadMediaPlayers);
  
    // Initialize controller
    console.log('FamilyStream Home Assistant integration initialized');
  }
  
  // Initialize when DOM is loaded or now if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI);
  } else {
    initializeUI();
  }
})(); 