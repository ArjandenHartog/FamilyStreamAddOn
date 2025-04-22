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
      padding: 15px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      max-width: 320px;
      transition: all 0.3s ease;
    }
    .ha-controller h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
      font-weight: bold;
    }
    .ha-controller select {
      width: 100%;
      padding: 8px;
      margin-bottom: 10px;
      border-radius: 5px;
      border: none;
    }
    .ha-controller button {
      background-color: #0288d1;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 5px;
      cursor: pointer;
      margin-right: 5px;
      margin-bottom: 5px;
      transition: background-color 0.2s;
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
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 10000;
      transition: all 0.3s ease;
    }
    .ha-controller-toggle:hover {
      background-color: #0288d1;
    }
    .ha-status {
      font-size: 13px;
      margin-top: 8px;
      padding: 6px;
      background-color: rgba(255,255,255,0.1);
      border-radius: 4px;
    }
    .ha-section {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.2);
    }
    .ha-section-title {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .ha-volume-control {
      width: 100%;
      margin: 5px 0;
    }
    .ha-label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
    }
  `;
  document.head.appendChild(style);

  // Wait until DOM is fully loaded
  function initializeUI() {
    // Create toggle button
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'ha-controller-toggle';
    toggleBtn.innerHTML = 'HA<br>Audio';
    toggleBtn.addEventListener('click', toggleController);
    document.body.appendChild(toggleBtn);
  
    // Create controller UI
    const controller = document.createElement('div');
    controller.className = 'ha-controller';
    controller.style.display = 'none';
    controller.innerHTML = `
      <h3>FamilyStream Browser Audio Forwarding</h3>
      
      <div class="ha-section">
        <div class="ha-section-title">Kies uitvoer apparaat:</div>
        <select id="ha-media-player"></select>
        <div>
          <button id="ha-cast-btn">Stuur Audio naar Apparaat</button>
          <button id="ha-refresh-btn">Ververs Apparatenlijst</button>
        </div>
      </div>
      
      <div class="ha-section">
        <div class="ha-section-title">Audio besturing:</div>
        <label class="ha-label" for="ha-volume">Volume:</label>
        <input type="range" id="ha-volume" class="ha-volume-control" min="0" max="100" value="50">
        <div>
          <button id="ha-play-btn">▶️ Play</button>
          <button id="ha-pause-btn">⏸️ Pause</button>
          <button id="ha-stop-btn">⏹️ Stop</button>
        </div>
      </div>
      
      <div class="ha-section">
        <div class="ha-section-title">Nu afspelend:</div>
        <div id="ha-now-playing">Geen audio afgespeeld</div>
      </div>
      
      <div class="ha-status" id="ha-status">Klaar om audio door te sturen</div>
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
    const volumeSlider = document.getElementById('ha-volume');
    const playBtn = document.getElementById('ha-play-btn');
    const pauseBtn = document.getElementById('ha-pause-btn');
    const stopBtn = document.getElementById('ha-stop-btn');
    const nowPlayingEl = document.getElementById('ha-now-playing');
    
    // Current state
    let currentEntityId = '';
    let currentTrackInfo = {
      title: '',
      artist: '',
      audioSrc: ''
    };
  
    // Load media players from Home Assistant
    async function loadMediaPlayers() {
      try {
        statusEl.textContent = 'Media apparaten laden...';
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
        
        statusEl.textContent = `${mediaPlayers.length} apparaten geladen`;
      } catch (error) {
        console.error('Error loading media players:', error);
        statusEl.textContent = 'Fout bij laden van media apparaten';
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
    
    // Update now playing information
    function updateNowPlaying(trackInfo) {
      if (trackInfo.title) {
        let displayText = trackInfo.title;
        if (trackInfo.artist) {
          displayText += ` - ${trackInfo.artist}`;
        }
        nowPlayingEl.textContent = displayText;
      } else {
        nowPlayingEl.textContent = 'Onbekend nummer';
      }
    }
  
    // Function to capture current playing audio and cast to HA
    async function castToHomeAssistant() {
      try {
        // Get selected media player
        const entityId = mediaPlayerSelect.value;
        if (!entityId) {
          statusEl.textContent = 'Selecteer eerst een media apparaat';
          return;
        }
        
        currentEntityId = entityId;
  
        // Find track info
        currentTrackInfo = findTrackInfo();
        if (!currentTrackInfo.audioSrc) {
          // If we still don't have an audio source, try to use the current page URL
          // FamilyStream might be using a custom player that's harder to detect
          currentTrackInfo.audioSrc = window.location.href;
          statusEl.textContent = 'Pagina URL gebruikt als audio bron';
        }
        
        // Update display
        updateNowPlaying(currentTrackInfo);
  
        // Cast to Home Assistant
        statusEl.textContent = `Audio naar ${entityId} sturen...`;
        const response = await fetch('/api/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_id: entityId,
            url: currentTrackInfo.audioSrc,
            title: currentTrackInfo.title,
            artist: currentTrackInfo.artist,
            volume: volumeSlider.value / 100
          }),
        });
  
        const result = await response.json();
        if (result.success) {
          statusEl.textContent = `Audio speelt nu op ${entityId}`;
        } else {
          statusEl.textContent = 'Fout: ' + (result.error || 'Onbekende fout');
        }
      } catch (error) {
        console.error('Error casting to Home Assistant:', error);
        statusEl.textContent = 'Fout bij doorsturen van audio';
      }
    }
    
    // Function to control media playback
    async function controlMedia(action) {
      if (!currentEntityId) {
        statusEl.textContent = 'Stuur eerst audio naar een apparaat';
        return;
      }
      
      try {
        const response = await fetch('/api/media_control', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_id: currentEntityId,
            action: action
          }),
        });
        
        const result = await response.json();
        if (result.success) {
          statusEl.textContent = `${action} commando gestuurd naar ${currentEntityId}`;
        } else {
          statusEl.textContent = 'Fout: ' + (result.error || 'Onbekende fout');
        }
      } catch (error) {
        console.error(`Error sending ${action} command:`, error);
        statusEl.textContent = `Fout bij versturen van ${action} commando`;
      }
    }
    
    // Function to set volume
    async function setVolume() {
      if (!currentEntityId) {
        return; // Don't show error, just do nothing
      }
      
      try {
        const volume = volumeSlider.value / 100;
        await fetch('/api/volume', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_id: currentEntityId,
            volume: volume
          }),
        });
      } catch (error) {
        console.error('Error setting volume:', error);
      }
    }
  
    // Add event listeners
    castBtn.addEventListener('click', castToHomeAssistant);
    refreshBtn.addEventListener('click', loadMediaPlayers);
    playBtn.addEventListener('click', () => controlMedia('play'));
    pauseBtn.addEventListener('click', () => controlMedia('pause'));
    stopBtn.addEventListener('click', () => controlMedia('stop'));
    volumeSlider.addEventListener('change', setVolume);
    
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