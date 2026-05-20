# 🌐 Nexus // Cyberpunk Travel Map & Globe

A beautiful, high-tech personal travel map visualizer featuring a neon-green glowing 3D Earth globe, tactical 2D grid radar, Google Maps Timeline JSON ingestion, and robust SQLite CRUD logging.

Designed to be lightweight, fast, and completely Dockerized for instant self-hosting via **Coolify**.

---

## ⚡ Immersive Systems (Features)

1. **Dual Visualizations HUD**:
   - **3D Glowing Earth**: An interactive Three.js-based green tactical sphere showing floating city beacons and path logs.
   - **2D Tactical Radar**: A customized flat map styled like a cyber security defense grid (DEFCON aesthetic) using custom CSS visual filters.
2. **Google Maps Ingestion Stream**:
   - Parses both **Semantic Location History** (monthly logs containing names/addresses) and **Records.json** (massive raw GPS tracks).
   - Features a custom stream reader to handle huge file sizes without crashing.
   - Automatically clusters points spatially (within ~25km) to identify main city hubs and increments visits count.
3. **Operational Console (CRUD)**:
   - Full manual override to add, edit, or decommission destination nodes.
   - Quick check-in counter stepper and date records.
   - Add detailed encrypted text logs for each destination.
4. **Reseed Module**: Instant database system restoration to default coordinates for testing.

---

## 🛠️ Stack & Architecture

- **Backend**: Node.js + Express
- **Database**: SQLite3 (persisted locally)
- **Frontend**: Vanilla HTML5, Custom Cyberpunk CSS variables, Vanilla Javascript
- **CDNs Utilized**: Globe.gl (ThreeJS wrapper), Leaflet (Flat mapping), FontAwesome, Google Fonts
- **Deployment**: Multi-stage lightweight Docker container

---

## 🚀 Local Deployment

### Option A: Standard Node Execution (Development)

Ensure you have Node.js 18+ installed.

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Launch Core (Hot-reloading)**:
   ```bash
   npm run dev
   ```
3. **Access Control Panel**: Open `http://localhost:3000` in your web browser.

### Option B: Local Docker Build

1. **Launch Containers**:
   ```bash
   docker compose up --build
   ```
2. **Access Control Panel**: Open `http://localhost:3000`.
3. **Data Location**: SQLite database is automatically persisted within a local Docker volume (`nexus_data`).

---

## 🪐 Self-Hosting Deploy Guide (Coolify)

Nexus is fully Coolify-native, making deployment a 2-minute process.

### Step 1: Connect Git Repository
- Push this codebase to your GitHub, GitLab, or self-hosted Git system.

### Step 2: Initialize Coolify Application
1. Open your **Coolify dashboard**.
2. Go to **Sources** and click **+ Add Resource** -> **Public Repository** or **Private Repository**.
3. Select your repository and branch containing this project.

### Step 3: Configure Build Settings
Coolify will automatically inspect the repository and identify the `docker-compose.yml` or `Dockerfile`.
1. Under **Build Pack**, select **Docker Compose**.
2. Coolify will read the `docker-compose.yml` automatically.
3. Keep default settings. Ensure **Destination** is linked to your target docker server.

### Step 4: Configure Data Persistence (SQLite)
Coolify handles Docker volumes beautifully out of the box. 
- The `docker-compose.yml` has a volume `nexus_data` mapped to `/data` in the container.
- Coolify will automatically provision a persistent directory on the host server. Your travel records are **100% safe** during redeployments and server restarts.

### Step 5: Assign Domains
1. In the application settings, scroll to **Domains**.
2. Add your custom domain (e.g. `https://travel.yourdomain.com`).
3. Coolify will automatically fetch and renew the Let's Encrypt SSL certificate and route requests through its reverse proxy!

### Step 6: Deploy
- Click **Deploy** at the top right of Coolify.
- Watch the build stream. Once complete, your personal cyberpunk travel log is live worldwide!

---

## 📂 Google Takeout Timeline Ingestion Instructions

1. Visit [Google Takeout](https://takeout.google.com/).
2. Select **Location History (Timeline)** and export in JSON format.
3. Once downloaded, extract the zip file.
4. **Semantic History**: Navigate to `Location History/Semantic Location History/`. Select any monthly `.json` file (e.g., `2024_JANUARY.json`) and drop it into the Nexus control panel.
5. **Raw History**: Navigate to `Location History/` and locate `Records.json`. Drop it into the panel. (Nexus downsamples raw records streams to identify cities cleanly).

---

## 🔒 Security & Future Authentication

This MVP is optimized for simplicity and local execution. To add authentication:
1. Express routing in `backend/server.js` is structured cleanly.
2. You can drop in any OAuth2 (e.g., Google OAuth) or standard JWT middleware to intercept `/api/*` endpoints.
3. Serve static front-end assets behind a simple session validation token.
