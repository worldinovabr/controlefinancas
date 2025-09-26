const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const keys = webpush.generateVAPIDKeys();
fs.writeFileSync(path.join(__dirname, 'vapid.json'), JSON.stringify(keys, null, 2));
console.log('VAPID keys generated and saved to vapid.json');
console.log('Public Key:', keys.publicKey);
console.log('Private Key:', keys.privateKey);
