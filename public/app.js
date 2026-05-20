// State management for travel map
let currentView = 'globe'; // 'globe' or 'flat'
let cities = [];
let selectedCity = null;

// Map visualizers instances
let globeInstance = null;
let leafletMap = null;
let leafletMarkersGroup = null;

// Animation frame ID for label size updates
let labelSizeAnimationId = null;

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Initialize default form dates to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('new-last-visit').value = today;
  document.getElementById('node-last-visit').value = today;

  // Initial fetch
  fetchCities();

  // Setup Drag & Drop Handlers
  setupDragAndDrop();
});

// ==========================================================================
// DATA ACQUISITION & RENDERING
// ==========================================================================
async function fetchCities() {
  try {
    const response = await fetch('/api/cities');
    if (!response.ok) throw new Error("Failed to retrieve coordinates from central core.");
    
    cities = await response.json();
    console.log("Loaded destinations:", cities);
    
    // Update Stats HUD
    updateStatsHUD();

    // Render on active visuals
    renderGlobe();
    renderFlatMap();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateStatsHUD() {
  const count = cities.length;
  const totalVisits = cities.reduce((sum, c) => sum + (c.visits_count || 1), 0);
  
  // Format numbers to double digits for retro-cyber feel
  document.getElementById('stat-cities-count').textContent = count.toString().padStart(2, '0');
  document.getElementById('stat-visits-count').textContent = totalVisits.toString().padStart(2, '0');
  
  // Find last visit
  if (count > 0) {
    // Sort by last_visit_date descending
    const sorted = [...cities].sort((a, b) => new Date(b.last_visit_date) - new Date(a.last_visit_date));
    const last = sorted[0];
    document.getElementById('stat-last-visit').textContent = 
      `${last.name.toUpperCase()} // ${last.last_visit_date}`;
  } else {
    document.getElementById('stat-last-visit').textContent = "NO RECORDED PATH";
  }
}

// ==========================================================================
// 3D EARTH GLOBE RENDERING (GLOBE.GL)
// ==========================================================================
function renderGlobe() {
  const container = document.getElementById('globe-container');

  // If we haven't built the globe yet, initialize it
  if (!globeInstance) {
    // Build Globe with glowing green tactical theme
    globeInstance = Globe()(container)
      // Custom earth nighttime texture or sleek dark terrain
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundColor('rgba(0,0,0,0)') // Make background transparent to match layout
      .showAtmosphere(true)
      .atmosphereColor('#39ff14') // Green atmosphere glow
      .atmosphereAltitude(0.18)
      // Display labels for cities
      .labelsData(cities)
      .labelLat(d => d.latitude)
      .labelLng(d => d.longitude)
      .labelText(d => d.name.toUpperCase())
      .labelSize(1.6) // Initial size, will be updated dynamically
      .labelDotRadius(() => 0.35) // Fixed radius for all cities (not dependent on visits)
      .labelColor(() => '#39ff14')
      .labelResolution(3)
      .onLabelClick((labelNode) => inspectNode(labelNode));

    // Slow self-rotation on start
    globeInstance.controls().autoRotate = true;
    globeInstance.controls().autoRotateSpeed = 0.5;

    // Stop autoRotate on user drag
    globeInstance.controls().addEventListener('start', () => {
      globeInstance.controls().autoRotate = false;
    });

    // Start animation loop for dynamic label size
    startDynamicLabelSizeUpdate();
  } else {
    // Just update the data
    globeInstance.labelsData(cities);
  }
}

// Dynamic label size based on camera distance
function startDynamicLabelSizeUpdate() {
  if (labelSizeAnimationId) {
    cancelAnimationFrame(labelSizeAnimationId);
  }

  function updateLabelSize() {
    if (!globeInstance) return;

    try {
      const camera = globeInstance.camera();
      if (!camera) {
        labelSizeAnimationId = requestAnimationFrame(updateLabelSize);
        return;
      }

      // Calculate distance from camera to globe center (0,0,0)
      const distance = Math.sqrt(
        camera.position.x ** 2 +
        camera.position.y ** 2 +
        camera.position.z ** 2
      );

      // Map distance to label size (like normal maps)
      // Far away (distance > 350) = tiny text (0.15)
      // Very close (distance < 80) = readable text (0.9)
      const farDistance = 380;
      const closeDistance = 70;
      const farSize = 0.12;
      const closeSize = 0.95;

      let newSize;
      if (distance > farDistance) {
        newSize = farSize;
      } else if (distance < closeDistance) {
        newSize = closeSize;
      } else {
        // Linear interpolation between far and close
        const ratio = (distance - closeDistance) / (farDistance - closeDistance);
        newSize = closeSize + ratio * (farSize - closeSize);
      }

      globeInstance.labelSize(newSize);
    } catch (e) {
      console.error('Error updating label size:', e);
    }

    labelSizeAnimationId = requestAnimationFrame(updateLabelSize);
  }

  labelSizeAnimationId = requestAnimationFrame(updateLabelSize);
}

// ==========================================================================
// 2D RADAR GRID RENDERING (LEAFLET)
// ==========================================================================
function renderFlatMap() {
  const container = document.getElementById('leaflet-container');
  
  if (!leafletMap) {
    // Initialize Leaflet Map centered in Europe/Atlantic coordinates
    leafletMap = L.map('leaflet-container', {
      zoomControl: true,
      minZoom: 2,
      maxZoom: 10
    }).setView([20, 0], 2);
    
    // Leaflet customized dark theme tiles (CartoDB Dark Matter)
    // The CSS custom filter makes it glow green automatically
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB &copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
    
    leafletMarkersGroup = L.layerGroup().addTo(leafletMap);
  }

  // Clear previous markers
  leafletMarkersGroup.clearLayers();

  // Add custom neon tactical nodes
  cities.forEach(city => {
    const icon = L.divIcon({
      className: 'tactical-marker',
      html: `<div class="pulse-node" title="${city.name}"></div>`,
      iconSize: [20, 20]
    });

    const marker = L.marker([city.latitude, city.longitude], { icon })
      .addTo(leafletMarkersGroup);
      
    // Bind click to open inspection
    marker.on('click', () => {
      inspectNode(city);
    });

    // Elegant neon tooltip
    marker.bindTooltip(
      `<div style="font-family:'Share Tech Mono',monospace;color:#39ff14;background-color:#0d0e16;border:1px solid #39ff14;padding:4px 8px;border-radius:2px;box-shadow:0 0 10px rgba(57,255,20,0.3)">
        <strong>${city.name.toUpperCase()}</strong><br>
        VISITS: ${city.visits_count}<br>
        LAST: ${city.last_visit_date}
       </div>`, 
      {
        direction: 'top',
        opacity: 0.95,
        className: 'cyber-tooltip',
        permanent: false
      }
    );
  });
}

// Switch between 3D Globe and 2D Radar
function switchView(view) {
  if (view === currentView) return;

  currentView = view;

  const btnGlobe = document.getElementById('btn-globe');
  const btnFlat = document.getElementById('btn-flat');
  const globeContainer = document.getElementById('globe-container');
  const leafletContainer = document.getElementById('leaflet-container');

  if (view === 'globe') {
    btnGlobe.classList.add('active');
    btnFlat.classList.remove('active');
    globeContainer.classList.remove('hidden');
    leafletContainer.classList.add('hidden');
    // Force rerender to trigger animations
    if (globeInstance) {
      globeInstance.width(globeContainer.clientWidth);
      // Restart label size update loop
      startDynamicLabelSizeUpdate();
    }
  } else {
    btnGlobe.classList.remove('active');
    btnFlat.classList.add('active');
    globeContainer.classList.add('hidden');
    leafletContainer.classList.remove('hidden');
    // Stop label size updates when switching away from globe
    if (labelSizeAnimationId) {
      cancelAnimationFrame(labelSizeAnimationId);
      labelSizeAnimationId = null;
    }
    // Force leaflet recalculation
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 100);
    }
  }
}

// ==========================================================================
// DRAWER / INSPECTOR ACTIONS (CRUD)
// ==========================================================================
function inspectNode(city) {
  selectedCity = city;
  
  // Populate form fields
  document.getElementById('node-id').value = city.id;
  document.getElementById('node-name').value = city.name;
  document.getElementById('node-lat').value = city.latitude;
  document.getElementById('node-lng').value = city.longitude;
  document.getElementById('node-last-visit').value = city.last_visit_date;
  document.getElementById('node-visits-count').value = city.visits_count;
  document.getElementById('node-note').value = city.note || '';

  // Slide open drawer
  document.getElementById('inspector-drawer').classList.remove('collapsed');
}

function closeInspector() {
  document.getElementById('inspector-drawer').classList.add('collapsed');
  selectedCity = null;
}

function stepVisits(amount) {
  const input = document.getElementById('node-visits-count');
  let currentVal = parseInt(input.value) || 1;
  currentVal = Math.max(1, currentVal + amount);
  input.value = currentVal;
}

async function saveNodeChanges(event) {
  event.preventDefault();
  
  if (!selectedCity) return;

  const id = document.getElementById('node-id').value;
  const payload = {
    name: document.getElementById('node-name').value,
    latitude: parseFloat(document.getElementById('node-lat').value),
    longitude: parseFloat(document.getElementById('node-lng').value),
    last_visit_date: document.getElementById('node-last-visit').value,
    visits_count: parseInt(document.getElementById('node-visits-count').value),
    note: document.getElementById('node-note').value
  };

  try {
    const response = await fetch(`/api/cities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to commit changes to database core.");
    }
    
    showToast("DATABASE MATRIX REWRITTEN - NODE UPDATED", "info");
    closeInspector();
    fetchCities(); // Reload
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deleteNode() {
  if (!selectedCity) return;
  
  const name = selectedCity.name.toUpperCase();
  if (!confirm(`ARE YOU ABSOLUTELY SURE YOU WANT TO DECOMMISSION NODE [${name}]? ALL LOGS WILL BE PERMANENTLY ERASED.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/cities/${selectedCity.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error("Decommission sequence failed.");

    showToast(`NODE [${name}] HAS BEEN SUCCESSFULLY ERASED.`, "info");
    closeInspector();
    fetchCities();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// ==========================================================================
// MODAL & NEW NODE INGESTION (CRUD CREATE)
// ==========================================================================
function openAddCityModal() {
  document.getElementById('add-city-modal').classList.remove('hidden');
}

function closeAddCityModal() {
  document.getElementById('add-city-modal').classList.add('hidden');
  document.getElementById('add-node-form').reset();
  document.getElementById('new-last-visit').value = new Date().toISOString().split('T')[0];
}

async function createNewNode(event) {
  event.preventDefault();

  const payload = {
    name: document.getElementById('new-name').value,
    latitude: parseFloat(document.getElementById('new-lat').value),
    longitude: parseFloat(document.getElementById('new-lng').value),
    last_visit_date: document.getElementById('new-last-visit').value,
    visits_count: parseInt(document.getElementById('new-visits-count').value),
    note: document.getElementById('new-note').value
  };

  try {
    const response = await fetch('/api/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Destination grid registration rejected.");
    }

    showToast("NEW COORDINATE REGISTERED IN GLOBAL MATRIX", "success");
    closeAddCityModal();
    fetchCities();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function resetDatabase() {
  if (!confirm("WARNING: PROCEEDING WILL COMPLETELY WIPE THE CURRENT GEOGRAPHICAL CORE AND RESTORE SEED DEMO DESTINATIONS. ARE YOU CERTAIN?")) {
    return;
  }

  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    if (!response.ok) throw new Error("Matrix rebuild error.");

    showToast("MATRIX GEOMETRY RESTORED TO DEFAULT SPEC", "info");
    closeInspector();
    fetchCities();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// ==========================================================================
// GOOGLE TIMELINE JSON DRAG & DROP / FILE UPLOAD
// ==========================================================================
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) handleTimelineUpload(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length) handleTimelineUpload(fileInput.files[0]);
  });
}

async function handleTimelineUpload(file) {
  if (!file.name.endsWith('.json')) {
    showToast("INVALID FILE TYPE. ONLY CODES WRITTEN IN JSON FORMAT PERMITTED.", "error");
    return;
  }

  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressStatus = document.getElementById('upload-status');
  const logsBox = document.getElementById('terminal-logs');

  // Initialize terminal visualization
  progressContainer.classList.remove('hidden');
  progressBar.style.width = '20%';
  progressStatus.textContent = "UPLOADING_LOGS_STREAM...";
  logsBox.textContent = `[SYSTEM INIT] Initializing secure transfer of ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...\n`;

  // Start sending
  const formData = new FormData();
  formData.append('timeline', file);

  try {
    // Fake upload progression for visual style
    setTimeout(() => {
      progressBar.style.width = '45%';
      progressStatus.textContent = "SYNCHRONIZING_BUFFERS...";
      logsBox.textContent += `[BUFFER] Chunk uploads successfully queued.\n[SYSTEM] Deploying stream parsing algorithms...\n`;
    }, 400);

    setTimeout(() => {
      progressBar.style.width = '70%';
      progressStatus.textContent = "RUNNING_MATRIX_PARSER...";
      logsBox.textContent += `[MATRIX] Processing Google Maps JSON formats.\n[MATRIX] Scanning coordinates, dates, and locations...\n`;
    }, 1200);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Timeline parser encounter fatal error.");
    }

    // Success styling
    progressBar.style.width = '100%';
    progressStatus.textContent = "SYNCHRONIZATION_COMPLETE // SECURE";
    logsBox.textContent += `\n[PARSER LOGS]:\n${result.log}`;
    logsBox.textContent += `\n[FINISH] Synchronization successfully finished.\n`;
    
    showToast(`SYNCHRONIZED: ${result.totalParsed} DESTINATIONS IMPORTED`, "success");
    
    // Refresh maps
    fetchCities();
  } catch (error) {
    progressBar.style.width = '100%';
    progressBar.style.backgroundColor = 'var(--neon-pink)';
    progressStatus.textContent = "TRANSMISSION_ERROR";
    logsBox.textContent += `\n[FATAL ERROR]: ${error.message}\n`;
    showToast(error.message, "error");
  }
}

// ==========================================================================
// TOAST SYSTEM
// ==========================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div>${message.toUpperCase()}</div>
  `;

  container.appendChild(toast);

  // Fade out
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4000);
}
