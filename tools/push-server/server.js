const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
// enable CORS so the client hosted elsewhere can talk to this server
try { const cors = require('cors'); app.use(cors()); } catch(e) { console.warn('cors not installed; run npm install cors to enable cross-origin requests'); }

// Simple storage persisted to subs.json (for demo). In production use DB.
const subsFile = path.join(__dirname, 'subs.json');
let subscriptions = [];
try {
  if (fs.existsSync(subsFile)) subscriptions = JSON.parse(fs.readFileSync(subsFile));
} catch (e) { console.warn('failed to load existing subs.json', e); }

// Load VAPID keys from env vars (preferred) or fallback to vapid.json file
const vapidPublicFromEnv = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateFromEnv = process.env.VAPID_PRIVATE_KEY;
const vapidContact = process.env.VAPID_CONTACT || 'mailto:example@example.com';
if (vapidPublicFromEnv && vapidPrivateFromEnv) {
  webpush.setVapidDetails(vapidContact, vapidPublicFromEnv, vapidPrivateFromEnv);
} else {
  const keysFile = path.join(__dirname, 'vapid.json');
  if (fs.existsSync(keysFile)) {
    const vapidKeys = JSON.parse(fs.readFileSync(keysFile));
    webpush.setVapidDetails(vapidContact, vapidKeys.publicKey, vapidKeys.privateKey);
  } else {
    console.warn('No VAPID keys found. Generate with `node gen-keys.js` or set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars');
  }
}

app.get('/vapidPublicKey', (req, res) => {
  // return the public key from env or from vapid.json fallback
  const pub = process.env.VAPID_PUBLIC_KEY || (() => { try { const p = JSON.parse(fs.readFileSync(path.join(__dirname,'vapid.json'))); return p && p.publicKey; } catch(e){return null;} })();
  if (!pub) return res.status(404).send('No VAPID keys configured');
  res.send(pub);
});

app.post('/subscribe', (req, res) => {
  const sub = req.body.subscription;
  if (!sub) return res.status(400).send('subscription required');
  subscriptions.push(sub);
  try { fs.writeFileSync(subsFile, JSON.stringify(subscriptions, null, 2)); } catch(e){ console.warn('failed to persist subscription', e); }
  console.log('New subscription saved (total:', subscriptions.length, ')');
  res.status(201).send('ok');
});

app.post('/send-test', async (req, res) => {
  // optional simple protection: require PUSH_SECRET in header or body to avoid public abuse
  const secret = process.env.PUSH_SECRET;
  if (secret) {
    const provided = req.get('x-push-secret') || (req.body && req.body._secret);
    if (!provided || provided !== secret) return res.status(401).send('unauthorized');
  }
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
        // remove invalid subscriptions (410/404)
        try {
          if (e && e.statusCode && (e.statusCode === 410 || e.statusCode === 404)) {
            subscriptions = subscriptions.filter(x => x.endpoint !== s.endpoint);
            try { fs.writeFileSync(subsFile, JSON.stringify(subscriptions, null, 2)); } catch(e2){}
          }
        } catch(_){}
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
