const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const parser = require('./parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer upload config
const upload = multer({ 
  dest: uploadsDir,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit for massive location logs
});

// Middleware
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true }));

// Set UTF-8 charset for all responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- API ROUTES ---

// 1. Get all cities
app.get('/api/cities', async (req, res) => {
  try {
    const list = await db.getAllCities();
    res.json(list);
  } catch (error) {
    console.error("Failed to fetch cities:", error);
    res.status(500).json({ error: "Failed to retrieve travel records." });
  }
});

// 2. Add manual city
app.post('/api/cities', async (req, res) => {
  try {
    const { name, latitude, longitude, last_visit_date, note, visits_count } = req.body;
    
    if (!name || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: "Missing required parameters: name, latitude, and longitude must be provided." });
    }
    
    // Check if city name already exists to avoid SQLITE_CONSTRAINT
    const existing = await db.getCityByName(name);
    if (existing) {
      return res.status(400).json({ error: `City with name '${name}' already exists. Select the existing point to edit or check-in instead.` });
    }

    const cityId = await db.createCity({
      name,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      last_visit_date: last_visit_date || new Date().toISOString().split('T')[0],
      note: note || '',
      visits_count: parseInt(visits_count) || 1
    });
    
    const newCity = await db.getCityById(cityId);
    res.status(201).json(newCity);
  } catch (error) {
    console.error("Failed to create city:", error);
    res.status(500).json({ error: "Failed to log destination." });
  }
});

// 3. Update city details (check-in / edit)
app.put('/api/cities/:id', async (req, res) => {
  try {
    const cityId = req.params.id;
    const existing = await db.getCityById(cityId);
    
    if (!existing) {
      return res.status(404).json({ error: "Target destination not found." });
    }

    const { name, latitude, longitude, last_visit_date, note, visits_count } = req.body;
    
    const updated = await db.updateCity(cityId, {
      name: name || existing.name,
      latitude: latitude !== undefined ? parseFloat(latitude) : existing.latitude,
      longitude: longitude !== undefined ? parseFloat(longitude) : existing.longitude,
      last_visit_date: last_visit_date !== undefined ? last_visit_date : existing.last_visit_date,
      note: note !== undefined ? note : existing.note,
      visits_count: visits_count !== undefined ? parseInt(visits_count) : existing.visits_count
    });

    res.json(updated);
  } catch (error) {
    console.error("Failed to update city:", error);
    res.status(500).json({ error: "Failed to update destination details." });
  }
});

// 4. Delete city
app.delete('/api/cities/:id', async (req, res) => {
  try {
    const cityId = req.params.id;
    const existing = await db.getCityById(cityId);
    
    if (!existing) {
      return res.status(404).json({ error: "Destination not found." });
    }

    await db.deleteCity(cityId);
    res.json({ message: "Successfully deleted destination.", id: cityId });
  } catch (error) {
    console.error("Failed to delete city:", error);
    res.status(500).json({ error: "Failed to remove destination from log." });
  }
});

// 5. Upload Google Maps Takeout Timeline file
app.post('/api/upload', upload.single('timeline'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Please upload a valid JSON timeline file." });
  }

  try {
    console.log(`Starting parsing processing for file: ${req.file.originalname} (${req.file.size} bytes)`);
    const parseResult = await parser.processTimelineUpload(req.file.path);
    
    if (parseResult.success) {
      res.json(parseResult);
    } else {
      res.status(422).json(parseResult);
    }
  } catch (error) {
    console.error("File processing failed:", error);
    res.status(500).json({ error: "Fatal parsing error occurred.", details: error.message });
  }
});

// 6. Reset / Reseed database
app.post('/api/reset', async (req, res) => {
  try {
    await db.resetDb();
    const refreshed = await db.getAllCities();
    res.json({ message: "Database reseeded successfully.", cities: refreshed });
  } catch (error) {
    console.error("Reset failed:", error);
    res.status(500).json({ error: "Database reset routine failed." });
  }
});

// Serve frontend SPA fallback (fallback to index.html for clientside styling/routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start DB & Express
async function startServer() {
  try {
    console.log("Initializing SQLite storage engine...");
    await db.initializeDb();
    console.log("Database online.");
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`=================================================`);
      console.log(`  NEXUS TRAVEL MAP RUNNING ON PORT ${PORT}`);
      console.log(`  Local Address:  http://localhost:${PORT}`);
      console.log(`  Docker Ready:   Listening on 0.0.0.0`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error("Critical server startup failure:", error);
    process.exit(1);
  }
}

startServer();
