const fs = require('fs');
const readline = require('readline');
const db = require('./db');

/**
 * Calculates the distance between two coordinates in kilometers using the Haversine formula.
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cleans up and extracts city name from Google Maps address or name fields.
 */
function cleanCityName(name, address) {
  if (!address && !name) return "Unknown Destination";
  
  // If we have an address, let's try to extract the city portion
  if (address) {
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      // Typically, city is the second to last element in standard postal formats,
      // or somewhere in the middle. E.g., "75001 Paris, France" or "San Francisco, CA 94103, USA"
      let cityPart = parts[parts.length - 2];
      
      // Let's clean the city part (remove postal codes, state abbreviations, digits)
      let cleaned = cityPart
        .replace(/\b[A-Z]{2}\b/g, '') // remove US states (CA, NY, etc.)
        .replace(/\d+/g, '')          // remove postal/ZIP codes
        .trim();
        
      if (cleaned.length > 2) {
        return cleaned;
      }
    }
    
    // If splitting didn't yield a good result, fallback to first part of address
    if (parts[0] && parts[0].length > 2 && parts[0].length < 30) {
      return parts[0];
    }
  }

  // Fallback to name if it is reasonable
  if (name && name.length > 1 && name.length < 40 && !name.includes('+')) {
    return name;
  }
  
  return name || "Visited Node";
}

/**
 * Utility to parse strings like "41.9121836°, 12.5016623°" into lat and lng float values.
 */
function parseLatLngString(str) {
  try {
    if (!str) return null;
    const cleanStr = str.replace(/°/g, '').replace(/[\u00b0\u02da\u1d52]/g, '').trim();
    const parts = cleanStr.split(',');
    if (parts.length === 2) {
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  } catch (e) {
    console.error("Failed to parse LatLng string:", str, e);
  }
  return null;
}

/**
 * Parses Google Maps semanticSegments format (new Timeline format).
 * This format has { semanticSegments: [ { visit, timelinePath, activity, startTime } ] }
 * Focus on visit nodes since those represent actual place visits.
 */
function parseSemanticSegmentsJson(data) {
  const cities = [];
  const visitedCoords = new Set(); // Track visited coordinates to avoid duplicates
  let locationCounter = 0;

  if (!data.semanticSegments || !Array.isArray(data.semanticSegments)) {
    return cities;
  }

  console.log(`Scanning ${data.semanticSegments.length} semantic segments...`);

  for (const segment of data.semanticSegments) {
    // Only parse visit nodes - these represent actual place visits
    // Ignore timelinePath (movement paths) and activity (journey segments)
    if (segment.visit && segment.visit.topCandidate) {
      const candidate = segment.visit.topCandidate;
      let lat = null;
      let lng = null;

      // Extract coordinates from placeLocation
      if (candidate.placeLocation && candidate.placeLocation.latLng) {
        const coords = parseLatLngString(candidate.placeLocation.latLng);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      // Extract date from segment
      let date = segment.startTime || segment.endTime;
      if (date) {
        date = date.split('T')[0];
      }

      // Generate a generic English location name for clustering
      // Names will be updated during clustering based on actual locations
      locationCounter++;
      let name = `Location ${locationCounter}`;

      // Only add if we have valid coordinates
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

        // Avoid adding duplicate visit points
        if (!visitedCoords.has(coordKey)) {
          visitedCoords.add(coordKey);
          cities.push({
            name: name,
            latitude: parseFloat(lat.toFixed(5)),
            longitude: parseFloat(lng.toFixed(5)),
            date: date || new Date().toISOString().split('T')[0]
          });
        }
      }
    }

    // Alternative: if no visit data but we have activity data, extract endpoints
    // This helps capture movement-based location changes
    if (!segment.visit && segment.activity && segment.activity.start && segment.activity.start.latLng) {
      const coords = parseLatLngString(segment.activity.start.latLng);
      if (coords) {
        let date = segment.startTime || segment.endTime;
        if (date) {
          date = date.split('T')[0];
        }

        const coordKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
        if (!visitedCoords.has(coordKey)) {
          visitedCoords.add(coordKey);
          locationCounter++;
          cities.push({
            name: `Location ${locationCounter}`,
            latitude: parseFloat(coords.lat.toFixed(5)),
            longitude: parseFloat(coords.lng.toFixed(5)),
            date: date || new Date().toISOString().split('T')[0]
          });
        }
      }
    }
  }

  console.log(`Parsed ${cities.length} unique visit locations from semantic segments.`);
  return cities;
}

/**
 * Parsers a Semantic Location History JSON string.
 * This format has { timelineObjects: [ { placeVisit: { location: { latitudeE7, longitudeE7, name, address } } } ] }
 */
function parseSemanticJson(data) {
  const cities = [];
  
  if (!data.timelineObjects || !Array.isArray(data.timelineObjects)) {
    return cities;
  }
  
  console.log(`Scanning ${data.timelineObjects.length} timeline objects...`);
  
  for (const obj of data.timelineObjects) {
    if (obj.placeVisit && obj.placeVisit.location) {
      const loc = obj.placeVisit.location;
      const lat = loc.latitudeE7 / 1e7;
      const lng = loc.longitudeE7 / 1e7;
      const name = loc.name;
      const address = loc.address;
      
      // Extract duration or fallback
      let date = null;
      if (obj.placeVisit.duration) {
        const start = obj.placeVisit.duration.startTimestamp;
        if (start) {
          date = start.split('T')[0]; // Extract YYYY-MM-DD
        }
      }
      
      if (!isNaN(lat) && !isNaN(lng)) {
        cities.push({
          name: cleanCityName(name, address),
          latitude: parseFloat(lat.toFixed(5)),
          longitude: parseFloat(lng.toFixed(5)),
          date: date || new Date().toISOString().split('T')[0]
        });
      }
    }
  }
  
  return cities;
}

/**
 * Parsers raw locations (Records.json) using a fast regex stream-based parser to avoid out-of-memory errors on massive files.
 */
async function parseRawRecordsStream(filePath) {
  return new Promise((resolve, reject) => {
    const cities = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let currentLat = null;
    let currentLng = null;
    let currentDate = null;
    let count = 0;

    console.log("Parsing raw coordinates stream...");

    rl.on('line', (line) => {
      // Find latitudeE7, longitudeE7, and timestamp using fast string searches or simple regex
      if (line.includes('latitudeE7')) {
        const match = line.match(/"latitudeE7"\s*:\s*(-?\d+)/);
        if (match) currentLat = parseInt(match[1]) / 1e7;
      } else if (line.includes('longitudeE7')) {
        const match = line.match(/"longitudeE7"\s*:\s*(-?\d+)/);
        if (match) currentLng = parseInt(match[1]) / 1e7;
      } else if (line.includes('timestamp')) {
        const match = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
        if (match) currentDate = match[1].split('T')[0];
      }

      // If we have a full point, add it and reset
      if (currentLat !== null && currentLng !== null && currentDate !== null) {
        count++;
        // Downsample raw records to avoid storing every single ping (take 1 every 500 pings for speed)
        if (count % 500 === 0) {
          cities.push({
            name: `Node [${currentLat.toFixed(2)}, ${currentLng.toFixed(2)}]`,
            latitude: parseFloat(currentLat.toFixed(5)),
            longitude: parseFloat(currentLng.toFixed(5)),
            date: currentDate
          });
        }
        currentLat = null;
        currentLng = null;
        currentDate = null;
      }
    });

    rl.on('close', () => {
      console.log(`Stream parsed. Found ${cities.length} downsampled coordinate frames.`);
      resolve(cities);
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Clusters visited points into a structured list of unique cities.
 * Distance threshold determines clustering size (default 25km).
 */
function clusterVisitedPoints(points, distanceThresholdKm = 25) {
  const clusters = [];
  
  for (const pt of points) {
    let matchedCluster = null;
    
    // Find if this point belongs to any existing cluster
    for (const cluster of clusters) {
      const dist = getDistance(pt.latitude, pt.longitude, cluster.latitude, cluster.longitude);
      if (dist < distanceThresholdKm) {
        matchedCluster = cluster;
        break;
      }
    }
    
    if (matchedCluster) {
      // Update cluster details
      matchedCluster.visits_count += 1;
      
      // Update to the latest visit date
      if (new Date(pt.date) > new Date(matchedCluster.last_visit_date)) {
        matchedCluster.last_visit_date = pt.date;
      }
      
      // If the point has a more specific city-like name than the cluster, use it
      if (pt.name && pt.name !== "Visited Node" && !pt.name.startsWith("Node [") && 
         (matchedCluster.name === "Visited Node" || matchedCluster.name.startsWith("Node [") || matchedCluster.name.length < pt.name.length)) {
        matchedCluster.name = pt.name;
      }
    } else {
      // Create a new cluster
      clusters.push({
        name: pt.name,
        latitude: pt.latitude,
        longitude: pt.longitude,
        last_visit_date: pt.date,
        note: `Discovered during Google Timeline scan on ${pt.date}.`,
        visits_count: 1
      });
    }
  }
  
  return clusters;
}

/**
 * Core parsing routine that accepts a file path, detects the format, clusters locations, and saves to database.
 */
async function processTimelineUpload(filePath) {
  let rawPoints = [];
  let logOutput = "";
  
  try {
    // 1. Detect file type by reading the first 1000 characters
    const fileSnippet = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).substring(0, 2000);
    
    if (fileSnippet.includes("timelineObjects")) {
      logOutput += "Detected Google Semantic Location History format.\n";
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      rawPoints = parseSemanticJson(jsonData);
      logOutput += `Successfully extracted ${rawPoints.length} place visits.\n`;
    } else if (fileSnippet.includes("semanticSegments")) {
      logOutput += "Detected Google Maps Timeline (semanticSegments) format.\n";
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      rawPoints = parseSemanticSegmentsJson(jsonData);
      logOutput += `Successfully extracted ${rawPoints.length} route and visit points.\n`;
    } else if (fileSnippet.includes("locations") || fileSnippet.includes("latitudeE7")) {
      logOutput += "Detected raw Google Location History (Records.json) format. Commencing fast stream parse...\n";
      rawPoints = await parseRawRecordsStream(filePath);
      logOutput += `Successfully extracted ${rawPoints.length} coordinates from stream.\n`;
    } else {
      throw new Error("Unrecognized JSON format. File must be a Google Maps Takeout location history export.");
    }
    
    if (rawPoints.length === 0) {
      logOutput += "Warning: No valid location records were parsed from this file.\n";
      return { success: false, log: logOutput, inserted: 0 };
    }
    
    // 2. Cluster raw points spatially to compile a cohesive list of cities
    // Use larger clustering radius for more aggressive city grouping (50km instead of 25km)
    logOutput += "Clustering coordinate points to identify central visited regions...\n";
    const clusters = clusterVisitedPoints(rawPoints, 50);
    logOutput += `Aggregated coordinates into ${clusters.length} unique geographical hubs.\n`;
    
    // 3. Save to database (merge or insert)
    logOutput += "Writing entries to SQLite travel log...\n";
    let insertedCount = 0;
    let updatedCount = 0;
    
    for (const city of clusters) {
      const existing = await db.getCityByName(city.name);
      if (existing) {
        // Merge visits
        const updatedVisits = existing.visits_count + city.visits_count;
        const latestDate = new Date(city.last_visit_date) > new Date(existing.last_visit_date) 
          ? city.last_visit_date 
          : existing.last_visit_date;
        
        await db.updateCity(existing.id, {
          name: existing.name,
          latitude: existing.latitude,
          longitude: existing.longitude,
          last_visit_date: latestDate,
          note: existing.note ? `${existing.note}\nTimeline update: Visit count increased.` : city.note,
          visits_count: updatedVisits
        });
        updatedCount++;
      } else {
        await db.createCity(city);
        insertedCount++;
      }
    }
    
    logOutput += `Completed. Created ${insertedCount} new destinations, updated ${updatedCount} existing entries.\n`;
    return {
      success: true,
      log: logOutput,
      inserted: insertedCount,
      updated: updatedCount,
      totalParsed: clusters.length
    };
    
  } catch (error) {
    console.error("Timeline parsing error:", error);
    logOutput += `Parsing Failure: ${error.message}\n`;
    return { success: false, log: logOutput, error: error.message };
  } finally {
    // Delete temporary file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("Failed to delete temp file:", e);
    }
  }
}

module.exports = {
  processTimelineUpload
};
