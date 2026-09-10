const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    callback(null, extension === 'kml' || extension === 'gpx');
  },
});

function runUploadParser(request, response) {
  return new Promise((resolve, reject) => {
    upload.single('file')(request, response, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function safeFileName(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'uploaded-route';
}

function getConfig() {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GITHUB_PAT ||
    process.env.REPO_GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || process.env.REPO_OWNER;
  const repo = process.env.GITHUB_REPO || process.env.REPO_NAME;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const firebaseApiKey = process.env.FIREBASE_API_KEY;

  if (!token || !owner || !repo || !firebaseApiKey) {
    throw new Error('Upload storage is not configured. Set GitHub and Firebase variables in Vercel.');
  }

  return { token, owner, repo, branch, firebaseApiKey };
}

async function verifyFirebaseToken(idToken, config) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.firebaseApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error('Your sign-in session is invalid or expired.');
  const result = await response.json();
  const account = result.users?.[0];
  if (!account) throw new Error('Your sign-in session is invalid or expired.');
  return account;
}

async function githubRequest(path, options, config) {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`GitHub API returned ${response.status}.`);
    error.details = body;
    throw error;
  }
  return response.json();
}

async function getMetadata(config) {
  try {
    const result = await githubRequest('public/kml/routes-metadata.json', {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
    }, config);
    return { metadata: JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')), sha: result.sha };
  } catch (error) {
    if (error.message.includes('404')) return { metadata: {}, sha: undefined };
    throw error;
  }
}

async function commitFile(path, content, message, config, sha) {
  const body = {
    message,
    content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64'),
    branch: config.branch,
  };
  if (sha) body.sha = sha;
  return githubRequest(path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, config);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Only POST is supported.' });
  }

  try {
    await runUploadParser(request, response);
    if (!request.file) return response.status(400).json({ error: 'Choose a KML or GPX file to upload.' });

    const name = String(request.body.name || '').trim();
    if (!name) return response.status(400).json({ error: 'Add a trail name.' });

    const config = getConfig();
    const authorization = String(request.headers.authorization || '');
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken) return response.status(401).json({ error: 'Sign in before uploading a route.' });
    const account = await verifyFirebaseToken(idToken, config);
    const extension = request.file.originalname.toLowerCase().endsWith('.gpx') ? '.gpx' : '.kml';
    const originalBase = request.file.originalname.slice(0, -extension.length);
    const fileName = `${Date.now()}_${safeFileName(originalBase)}${extension}`;
    const routeMetadata = JSON.parse(String(request.body.routeMetadata || '{}'));
    const uploadedAt = new Date().toISOString();

    const { metadata, sha } = await getMetadata(config);
    metadata[fileName] = {
      ...routeMetadata,
      name,
      uploadedAt,
      contributorName: account.displayName || String(request.body.contributorName || ''),
      contributorEmail: account.email || '',
      contributorUid: account.localId,
    };

    await commitFile(`public/kml/${fileName}`, request.file.buffer, `Add contributed route: ${name}`, config);
    await commitFile(
      'public/kml/routes-metadata.json',
      `${JSON.stringify(metadata, null, 2)}\n`,
      `Update route metadata for: ${name}`,
      config,
      sha
    );

    return response.status(201).json({ fileName, name, uploadedAt, routeMetadata: metadata[fileName] });
  } catch (error) {
    console.error('Upload failed:', error);
    return response.status(500).json({ error: error.message || 'Could not save this route.' });
  }
};

module.exports.config = {
  api: { bodyParser: false },
};
