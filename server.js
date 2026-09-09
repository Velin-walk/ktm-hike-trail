const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DOMParser } = require('@xmldom/xmldom');

const app = express();
const port = Number(process.env.PORT || 3001);
const projectRoot = __dirname;
const publicKmlDir = path.join(projectRoot, 'public', 'kml');
const buildDir = path.join(projectRoot, 'build');
const buildKmlDir = path.join(buildDir, 'kml');

fs.mkdirSync(publicKmlDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, extension === '.kml' || extension === '.gpx');
  },
});

function safeFileName(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'uploaded-route';
}

function refreshManifest() {
  execFileSync(process.execPath, [path.join(projectRoot, 'update-manifest.js')], {
    cwd: projectRoot,
    stdio: 'ignore',
  });

  if (fs.existsSync(buildKmlDir)) {
    fs.copyFileSync(
      path.join(publicKmlDir, 'routes-metadata.json'),
      path.join(buildKmlDir, 'routes-metadata.json')
    );
  }
}

function toKml(buffer, extension, name) {
  if (extension === '.kml') return buffer;
  const xmlDoc = new DOMParser().parseFromString(buffer.toString('utf8'), 'application/xml');
  const points = Array.from(xmlDoc.getElementsByTagName('trkpt'))
    .map(point => {
      const lat = Number(point.getAttribute('lat'));
      const lng = Number(point.getAttribute('lon'));
      const elevationNode = point.getElementsByTagName('ele')[0];
      const elevation = elevationNode ? Number(elevationNode.textContent) : 0;
      return Number.isFinite(lat) && Number.isFinite(lng) ? `${lng},${lat},${Number.isFinite(elevation) ? elevation : 0}` : null;
    })
    .filter(Boolean);
  if (points.length < 2) throw new Error('The GPX file does not contain a valid track.');
  const escapedName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(`<kml><Document><name>${escapedName}</name><Placemark><LineString><coordinates>${points.join(' ')}</coordinates></LineString></Placemark></Document></kml>`);
}

app.post('/api/upload', upload.single('file'), (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: 'Choose a KML file to upload.' });
  }

  const submittedName = String(request.body.name || '').trim();
  if (!submittedName) {
    return response.status(400).json({ error: 'Add a trail name.' });
  }

  const originalExtension = path.extname(request.file.originalname).toLowerCase();
  const baseName = safeFileName(path.basename(request.file.originalname, originalExtension));
  const fileName = `${Date.now()}_${baseName}.kml`;
  const targetPath = path.join(publicKmlDir, fileName);

  try {
    fs.writeFileSync(targetPath, toKml(request.file.buffer, originalExtension, submittedName));
  } catch (error) {
    return response.status(422).json({ error: error.message || 'The uploaded route is invalid.' });
  }
  if (fs.existsSync(buildKmlDir)) {
    fs.mkdirSync(buildKmlDir, { recursive: true });
    fs.copyFileSync(targetPath, path.join(buildKmlDir, fileName));
  }

  try {
    refreshManifest();
    const metadataPath = path.join(publicKmlDir, 'routes-metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const contributorName = String(request.body.contributorName || '').trim();
    const contributorEmail = String(request.body.email || '').trim();
    const contributorUid = String(request.body.contributorUid || '').trim();

    if (metadata[fileName]) {
      metadata[fileName].name = submittedName;
      metadata[fileName].uploadedAt = new Date().toISOString();
      metadata[fileName].contributorName = contributorName || metadata[fileName].contributorName || '';
      metadata[fileName].contributorEmail = contributorEmail || metadata[fileName].contributorEmail || '';
      metadata[fileName].contributorUid = contributorUid || metadata[fileName].contributorUid || '';
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      if (fs.existsSync(buildKmlDir)) {
        fs.copyFileSync(metadataPath, path.join(buildKmlDir, 'routes-metadata.json'));
      }
    } else {
      metadata[fileName] = {
        name: submittedName,
        uploadedAt: new Date().toISOString(),
        contributorName,
        contributorEmail,
        contributorUid,
      };
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      if (fs.existsSync(buildKmlDir)) {
        fs.copyFileSync(metadataPath, path.join(buildKmlDir, 'routes-metadata.json'));
      }
    }
  } catch (error) {
    fs.rmSync(targetPath, { force: true });
    if (fs.existsSync(buildKmlDir)) fs.rmSync(path.join(buildKmlDir, fileName), { force: true });
    return response.status(422).json({ error: 'The uploaded KML does not contain a valid route.' });
  }

  return response.status(201).json({ fileName, name: submittedName });
});

app.use(express.static(buildDir));
app.use((_request, response) => {
  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return response.status(503).send('Build not found. Run npm run build first.');
  }
  return response.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`KTM Hike Trail is running at http://localhost:${port}`);
});
