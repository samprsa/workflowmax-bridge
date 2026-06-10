const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'https://workflowmax-bridge.onrender.com/callback';

let storedTokens = null;
let orgId = null;

app.get('/', (req, res) => {
  if (storedTokens) {
    res.send('<h2>✅ WorkflowMax Bridge is connected!</h2><p><a href="/jobs">View current jobs</a></p><p><a href="/login">Re-authenticate</a></p>');
  } else {
    res.send('<h2>WorkflowMax Bridge</h2><p><a href="/login"><strong>Click here to connect WorkflowMax</strong></a></p>');
  }
});

app.get('/login', (req, res) => {
  const authUrl = `https://oauth.workflowmax.com/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid profile email workflowmax offline_access&state=random123&prompt=consent`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const response = await axios.post('https://oauth.workflowmax.com/oauth/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    storedTokens = response.data;
    storedTokens.expires_at = Date.now() + (storedTokens.expires_in * 1000);
    // Decode org ID from JWT
    try {
      const payload = JSON.parse(Buffer.from(storedTokens.access_token.split('.')[1], 'base64').toString());
      orgId = payload.org_id || payload.organisation_id || payload.account_id;
      console.log('JWT payload keys:', Object.keys(payload));
      console.log('Org ID:', orgId);
    } catch(e) { console.log('JWT decode error:', e.message); }
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Authentication failed: ' + JSON.stringify(err.response?.data));
  }
});

async function getValidToken() {
  if (!storedTokens) throw new Error('Not authenticated');
  if (Date.now() > storedTokens.expires_at - 60000) {
    const response = await axios.post('https://oauth.workflowmax.com/oauth/token',
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: storedTokens.refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    storedTokens = response.data;
    storedTokens.expires_at = Date.now() + (storedTokens.expires_in * 1000);
  }
  return storedTokens.access_token;
}

app.get('/jobs', async (req, res) => {
  try {
    const token = await getValidToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (orgId) headers.account_id = orgId;
    const response = await axios.get('https://api.workflowmax2.com/job.api/current', { headers });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data, orgId });
  }
});

app.get('/debug', async (req, res) => {
  try {
    const token = await getValidToken();
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    res.json({ orgId, jwtPayload: payload });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
