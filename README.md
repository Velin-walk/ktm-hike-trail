# Kathmandu Valley Hikes

A modern, responsive React application built to visualize hiking trails and hills around the Kathmandu Valley using raw KML files. The application automatically calculates distance, elevation gain/loss, and difficulty levels directly from GPS data.

## Features
- **Auto-KML Parsing:** Drop `.kml` files into a folder and let the app handle the math.
- **Dynamic Elevation Charts:** Visualizes the elevation profile of your hikes automatically.
- **Theme Support:** Clean, beautiful Light and Dark modes.
- **Responsive Design:** Functions flawlessly on desktop and operates as a full-screen app on mobile devices.
- **Metadata Overrides:** Easy-to-use JSON file allows you to manually override trail names, descriptions, and difficulty calculations without touching code.

---

## Getting Started

### 1. Installation
Ensure you have Node.js installed, then run the following in your terminal:
```bash
npm install
```

### 2. Starting the App
To run the app locally in development mode:
```bash
npm start
```
The app will open at `http://localhost:3000`.

---

## How to Add New Routes

Adding new hikes is incredibly simple. You don't need to write any code.

### Step 1: Add your KML files
Take any `.kml` file (exported from Google Earth, Strava, Garmin, etc.) and drop it directly into the following folder:
`public/kml/`

### Step 2: Update the Manifest
Because web browsers cannot magically scan folders, you must tell the app that new files exist. In your terminal, run:
```bash
npm run manifest
```
*What this does:* This triggers a background script that scans the `public/kml/` folder and generates/updates a master list called `routes-metadata.json`.

### Step 3: Edit Route Details (Optional)
When you run the command above, the app generates a block in `public/kml/routes-metadata.json` that looks like this:

```json
"your_new_hike.kml": {
  "name": "Your New Hike",
  "description": "",
  "difficultyOverride": "Auto",
  "hoursOverride": "Auto",
  "calculatedDifficulty": "Moderate",
  "stats": {
    "distance": 12.34,
    "elevationGain": 650,
    "elevationLoss": 640,
    "minElevation": 1450,
    "maxElevation": 2120,
    "estimatedHours": 3.8
  },
  "bounds": [[27.6, 85.2], [27.8, 85.5]],
  "startPos": { "lat": 27.7, "lng": 85.3 }
}
```

You can open `routes-metadata.json` and edit it manually! 
- **`name` & `description`**: Replace these with whatever text you want to appear in the app.
- **`difficultyOverride`**: Keep as `"Auto"` to use calculated difficulty, or set `"Easy"`, `"Moderate"`, `"Hard"`, or `"Extreme"`.
- **`hoursOverride`**: Keep as `"Auto"` to use the calculated value, or set a number (like `4.5`).

*Note: The `npm run manifest` script will **never** overwrite changes you've manually made to this file! Your edits are safe.*

### Step 4: Refresh
Once you've run the manifest command and made your optional edits, just go to your browser and hit **F5** to refresh the page. Your new routes will appear instantly!

---

## Deployment (GitHub Pages + GitHub Actions)

This project is configured to auto-deploy to GitHub Pages whenever code is pushed to the `main` branch.

### Current setup
- `package.json` includes:
  - `"homepage": "https://833M0L3.github.io/ktm-hike-trail"`
  - `prebuild`, `predeploy`, and `deploy` scripts
- GitHub Actions workflow: `.github/workflows/deploy.yml`
  - Installs dependencies with `npm ci`
  - Builds with `npm run build` which now runs `npm run manifest` first via `prebuild`
  - Publishes `./build` to the `gh-pages` branch

### One-time GitHub Pages settings
1. Open repository settings: `https://github.com/833M0L3/ktm-hike-trail/settings/pages`
2. Under **Source**, choose **Deploy from a branch**
3. Select branch `gh-pages` and folder `/ (root)`
4. Save

Your site URL is:
`https://833M0L3.github.io/ktm-hike-trail`

### How deployments work
- Push to `main` -> workflow runs -> `gh-pages` branch is updated.
- You can monitor deployments in the **Actions** tab.

### Manual deploy (optional)
If you ever want to deploy manually from local machine:
```bash
npm run deploy
```

### Important note for route loading on GitHub Pages
The app fetches route files using `process.env.PUBLIC_URL` (for example, `.../kml/routes-metadata.json`) so assets load correctly under the GitHub Pages subpath (`/ktm-hike-trail`).

Before building/deploying, route metadata is refreshed automatically as part of `npm run build`.

If you want to regenerate metadata without building, you can still run:
```bash
npm run manifest
```

## Vercel uploads

The local Express server can write to `public/kml/`, but Vercel's filesystem is temporary. The Vercel function at `api/upload.js` commits uploaded route files and metadata to GitHub, which then triggers the normal deployment.

In the Vercel project settings, add these environment variables:

```text
GITHUB_TOKEN       GitHub token with Contents read/write access
GITHUB_OWNER       GitHub repository owner
GITHUB_REPO        GitHub repository name
GITHUB_BRANCH      Branch to update, normally main
FIREBASE_API_KEY   Firebase Web API key for the existing project
```

The GitHub token stays server-side. Uploads still require the signed-in Firebase user session, and the route is inserted into the current browser session immediately after GitHub accepts the commit.
