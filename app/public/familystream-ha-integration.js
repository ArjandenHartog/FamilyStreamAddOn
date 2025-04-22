// FamilyStream Home Assistant Integration Script
(function() {
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

  // Function to capture current playing audio and cast to HA
  async function castToHomeAssistant() {
    try {
      // Get selected media player
      const entityId = mediaPlayerSelect.value;
      if (!entityId) {
        statusEl.textContent = 'Please select a media player';
        return;
      }

      // Find audio source
      const audioElements = document.querySelectorAll('audio');
      if (audioElements.length === 0) {
        statusEl.textContent = 'No audio element found on page';
        return;
      }

      // Get the audio element that is currently playing or the first one
      let audioElement = Array.from(audioElements).find(audio => !audio.paused) || audioElements[0];
      
      // Try to find track info
      let title = 'FamilyStream Audio';
      let artist = '';
      
      // Look for possible title elements
      const possibleTitleElements = document.querySelectorAll('.title, .track-title, .song-title, h1, h2');
      for (const el of possibleTitleElements) {
        if (el.textContent.trim()) {
          title = el.textContent.trim();
          break;
        }
      }
      
      // Look for possible artist elements
      const possibleArtistElements = document.querySelectorAll('.artist, .track-artist, .song-artist');
      for (const el of possibleArtistElements) {
        if (el.textContent.trim()) {
          artist = el.textContent.trim();
          break;
        }
      }

      // Get audio source URL
      const audioSrc = audioElement.src || audioElement.currentSrc;
      if (!audioSrc) {
        statusEl.textContent = 'Could not find audio source';
        return;
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
          url: audioSrc,
          title,
          artist
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

  // Initialize on load
  console.log('FamilyStream Home Assistant integration initialized');
})(); 