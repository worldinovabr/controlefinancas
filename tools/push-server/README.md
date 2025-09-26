Push Server Example (Controle Finanças)

This is a small example server that accepts push subscription objects and can send Web Push notifications using VAPID keys.

Setup
1. cd tools/push-server
2. npm install
3. node gen-keys.js    # generates vapid.json (do not commit private key)
4. Start the server: npm start

Endpoints
- GET /vapidPublicKey -> returns the VAPID public key (text)
- POST /subscribe { subscription } -> saves subscription (in-memory)
- POST /send-test { payload } -> sends payload to all stored subscriptions

Notes
- This is a demo server. For production, store subscriptions in a DB and protect endpoints.
- Serve your main app over HTTPS so service workers and push work in production.
