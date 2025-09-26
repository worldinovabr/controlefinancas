const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// Simple in-memory storage (for demo). In production use DB.
let subscriptions = [];

// Load VAPID keys from file if present, otherwise instruct user to generate
const keysFile = path.join(__dirname, 'vapid.json');
let vapidKeys = null;
if (fs.existsSync(keysFile)) {
  vapidKeys = JSON.parse(fs.readFileSync(keysFile));
  webpush.setVapidDetails('mailto:example@example.com', vapidKeys.publicKey, vapidKeys.privateKey);
} else {
  console.warn('No vapid.json found. Generate keys with `node gen-keys.js`');
}

app.get('/vapidPublicKey', (req, res) => {
  if (!vapidKeys) return res.status(404).send('No VAPID keys configured');
  res.send(vapidKeys.publicKey);
});

app.post('/subscribe', (req, res) => {
  const sub = req.body.subscription;
  if (!sub) return res.status(400).send('subscription required');
  subscriptions.push(sub);
  console.log('New subscription saved (total:', subscriptions.length, ')');
  res.status(201).send('ok');
});

app.post('/send-test', async (req, res) => {
  const payload = req.body.payload || { title: 'Controle Finanças', body: 'Teste de notificação' };
  try {
    const results = [];
    for (const s of subscriptions) {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload));
        results.push({ status: 'ok' });
      } catch (e) {
        console.error('push failed', e);
        results.push({ status: 'error', error: String(e) });
      }
    }
    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(500).send(String(e));
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Push server listening on', port));
