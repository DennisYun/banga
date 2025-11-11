const express = require('express');
const app = express();
const port = 3000;
const os = require('os');
const https = require('https');
const selfsigned = require('selfsigned');

app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/test', (req, res) => {
  res.sendFile(__dirname + '/public/test.html');
});

const ip = (() => {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
})();

const attrs = [{ name: 'commonName', value: ip }];
const pems = selfsigned.generate(attrs, { days: 365 });
const server = https.createServer(
  {
    key: pems.private,
    cert: pems.cert,
  },
  app
);
server.listen(port, '0.0.0.0', () => {
  console.log(`URL to connect : https://${ip}:${port}\n`);
});
