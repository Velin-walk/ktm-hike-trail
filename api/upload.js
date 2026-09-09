// api/upload.js
export const config = {
  api: {
    bodyParser: false, // Disabling default parser to handle file stream
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw body chunks from upload
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const contentBase64 = buffer.toString('base64');

    // Get metadata from query or custom headers
    const fileName = req.headers['x-file-name'] || `trail_${Date.now()}.kml`;
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const commitMessage = `Add community route: ${cleanFileName}`;

    const GITHUB_TOKEN = process.env.REPO_GITHUB_TOKEN;
    const REPO_OWNER = 'Velin-walk';
    const REPO_NAME = 'ktm-hike-trail';

    // Commit file directly to GitHub repo via GitHub REST API
    const githubResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/public/kml/${cleanFileName}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage,
          content: contentBase64,
          branch: 'main',
        }),
      }
    );

    const result = await githubResponse.json();

    if (!githubResponse.ok) {
      return res.status(githubResponse.status).json({ error: result.message || 'GitHub upload failed' });
    }

    return res.status(200).json({ success: true, file: cleanFileName });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
