const path = require('path');
const fs = require('fs');

// Paths for persistence. In Docker we store in /data, locally in ./data.
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
const jsonDbPath = path.join(path.dirname(dbPath), 'database.json');

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Seed Cities Data
const seedCities = [
  {
    id: 1,
    name: "Белград",
    latitude: 44.8176,
    longitude: 20.4633,
    last_visit_date: "2026-05-20",
    note: "Danube river capital with vibrant nightlife.",
    visits_count: 1
  },
  {
    id: 2,
    name: "Нови Сад",
    latitude: 45.2671,
    longitude: 19.8335,
    last_visit_date: "2026-05-20",
    note: "Second largest city in Serbia, fortress and culture.",
    visits_count: 1
  },
  {
    id: 3,
    name: "Рим",
    latitude: 41.9028,
    longitude: 12.4964,
    last_visit_date: "2026-05-20",
    note: "Eternal city, history and architecture.",
    visits_count: 1
  },
  {
    id: 4,
    name: "Венеция",
    latitude: 45.4408,
    longitude: 12.3155,
    last_visit_date: "2026-05-20",
    note: "Lagoon city, canals and gondolas.",
    visits_count: 1
  },
  {
    id: 5,
    name: "Вена",
    latitude: 48.2082,
    longitude: 16.3738,
    last_visit_date: "2026-05-20",
    note: "Vienna, classical music and architecture.",
    visits_count: 1
  }
];

let useSqlite = false;
let db = null;

// Try to load sqlite modules
try {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  useSqlite = true;
  console.log("[DATABASE] SQLite3 native driver loaded successfully.");
} catch (e) {
  console.log("[DATABASE] SQLite3 driver not available or failed to compile locally.");
  console.log("[DATABASE] Activating ultra-portable JSON database fallback engine.");
  useSqlite = false;
}

// ==========================================================================
// SQLITE DATABASE ENGINE IMPLEMENTATION
// ==========================================================================
async function getSqliteDb() {
  if (db) return db;
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  return db;
}

// ==========================================================================
// PORTABLE JSON FILE ENGINE IMPLEMENTATION
// ==========================================================================
function readJsonDb() {
  if (!fs.existsSync(jsonDbPath)) {
    fs.writeFileSync(jsonDbPath, JSON.stringify({ cities: seedCities }, null, 2));
    return { cities: seedCities };
  }
  try {
    const raw = fs.readFileSync(jsonDbPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse database.json. Resetting storage...", error);
    fs.writeFileSync(jsonDbPath, JSON.stringify({ cities: seedCities }, null, 2));
    return { cities: seedCities };
  }
}

function writeJsonDb(data) {
  fs.writeFileSync(jsonDbPath, JSON.stringify(data, null, 2));
}

// ==========================================================================
// UNIFIED INTERFACE
// ==========================================================================
async function initializeDb() {
  if (useSqlite) {
    try {
      const database = await getSqliteDb();
      await database.exec(`
        CREATE TABLE IF NOT EXISTS cities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          last_visit_date TEXT,
          note TEXT,
          visits_count INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      const countRow = await database.get("SELECT COUNT(*) as count FROM cities");
      if (countRow.count === 0) {
        console.log("[DATABASE] Seeding default destinations in SQLite...");
        for (const city of seedCities) {
          await database.run(`
            INSERT INTO cities (name, latitude, longitude, last_visit_date, note, visits_count)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [city.name, city.latitude, city.longitude, city.last_visit_date, city.note, city.visits_count]);
        }
      }
      console.log("[DATABASE] SQLite engine initialized successfully.");
    } catch (err) {
      console.error("[DATABASE] Failed to initialize SQLite, falling back to JSON engine:", err.message);
      useSqlite = false;
      initializeJsonDb();
    }
  } else {
    initializeJsonDb();
  }
}

function initializeJsonDb() {
  if (!fs.existsSync(jsonDbPath)) {
    writeJsonDb({ cities: seedCities });
  }
  console.log("[DATABASE] Portable JSON storage engine initialized.");
}

async function getAllCities() {
  if (useSqlite) {
    const database = await getSqliteDb();
    return database.all("SELECT * FROM cities ORDER BY last_visit_date DESC");
  } else {
    const dbData = readJsonDb();
    return [...dbData.cities].sort((a, b) => new Date(b.last_visit_date) - new Date(a.last_visit_date));
  }
}

async function getCityById(id) {
  const targetId = parseInt(id);
  if (useSqlite) {
    const database = await getSqliteDb();
    return database.get("SELECT * FROM cities WHERE id = ?", [targetId]);
  } else {
    const dbData = readJsonDb();
    return dbData.cities.find(c => c.id === targetId) || null;
  }
}

async function getCityByName(name) {
  if (useSqlite) {
    const database = await getSqliteDb();
    return database.get("SELECT * FROM cities WHERE name = ?", [name]);
  } else {
    const dbData = readJsonDb();
    const cleanName = name.trim().toLowerCase();
    return dbData.cities.find(c => c.name.trim().toLowerCase() === cleanName) || null;
  }
}

async function createCity(city) {
  if (useSqlite) {
    const database = await getSqliteDb();
    const { name, latitude, longitude, last_visit_date, note, visits_count } = city;
    const result = await database.run(`
      INSERT INTO cities (name, latitude, longitude, last_visit_date, note, visits_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, latitude, longitude, last_visit_date || null, note || '', visits_count || 1]);
    return result.lastID;
  } else {
    const dbData = readJsonDb();
    const newId = dbData.cities.length > 0 ? Math.max(...dbData.cities.map(c => c.id)) + 1 : 1;
    
    const newCity = {
      id: newId,
      name: city.name,
      latitude: parseFloat(city.latitude),
      longitude: parseFloat(city.longitude),
      last_visit_date: city.last_visit_date || new Date().toISOString().split('T')[0],
      note: city.note || '',
      visits_count: parseInt(city.visits_count) || 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    dbData.cities.push(newCity);
    writeJsonDb(dbData);
    return newId;
  }
}

async function updateCity(id, city) {
  const targetId = parseInt(id);
  if (useSqlite) {
    const database = await getSqliteDb();
    const { name, latitude, longitude, last_visit_date, note, visits_count } = city;
    await database.run(`
      UPDATE cities
      SET name = ?, latitude = ?, longitude = ?, last_visit_date = ?, note = ?, visits_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, latitude, longitude, last_visit_date, note, visits_count, targetId]);
    return getCityById(targetId);
  } else {
    const dbData = readJsonDb();
    const index = dbData.cities.findIndex(c => c.id === targetId);
    if (index === -1) return null;
    
    dbData.cities[index] = {
      ...dbData.cities[index],
      name: city.name || dbData.cities[index].name,
      latitude: city.latitude !== undefined ? parseFloat(city.latitude) : dbData.cities[index].latitude,
      longitude: city.longitude !== undefined ? parseFloat(city.longitude) : dbData.cities[index].longitude,
      last_visit_date: city.last_visit_date !== undefined ? city.last_visit_date : dbData.cities[index].last_visit_date,
      note: city.note !== undefined ? city.note : dbData.cities[index].note,
      visits_count: city.visits_count !== undefined ? parseInt(city.visits_count) : dbData.cities[index].visits_count,
      updated_at: new Date().toISOString()
    };
    
    writeJsonDb(dbData);
    return dbData.cities[index];
  }
}

async function deleteCity(id) {
  const targetId = parseInt(id);
  if (useSqlite) {
    const database = await getSqliteDb();
    return database.run("DELETE FROM cities WHERE id = ?", [targetId]);
  } else {
    const dbData = readJsonDb();
    dbData.cities = dbData.cities.filter(c => c.id !== targetId);
    writeJsonDb(dbData);
    return { id: targetId };
  }
}

async function resetDb() {
  if (useSqlite) {
    try {
      const database = await getSqliteDb();
      await database.run("DROP TABLE IF EXISTS cities");
      await initializeDb();
    } catch (e) {
      console.error("[DATABASE] Failed to reset SQLite DB, resetting fallback...", e.message);
      useSqlite = false;
      resetJsonDb();
    }
  } else {
    resetJsonDb();
  }
}

function resetJsonDb() {
  writeJsonDb({ cities: seedCities });
}

module.exports = {
  initializeDb,
  getAllCities,
  getCityById,
  getCityByName,
  createCity,
  updateCity,
  deleteCity,
  resetDb
};
