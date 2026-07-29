const crypto = require('crypto');

const base64Key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4en/yetF4eKuJf/8VzFXc5FXzWyEgzQD3Q9TPuVHqARKMkfDzuXYzS+BIj11qdFBYGCrsMVfmzwPYy5Y+Wwq2WCl2KB1HN6pJ61galCZa7Qzg7T18f/yLMJz8B5CMDUEGjHdywv53RQ7eF6qO3iBdjRwYugSAxOJ5r7QWMwiPqFLi4Ne7O3BQLS0JcZZMElU/H+RA15/xvGRxl50mvmHntO0GNd1eGP1vqfunwtAX3Nw4z7PP85mc18naT4X4xBcSzvmS8rjaf7kHhOZGA1lZY8F1ZrcogML7sTY+r3yAADibOppTNhxsyom4/F2qOgG3pqxyQG38axxFBdwSuJCSwIDAQAB";
const keyBuf = Buffer.from(base64Key, 'base64');
const sha256 = crypto.createHash('sha256').update(keyBuf).digest('hex');

// Map hex characters to alphabet a-p
const extId = sha256.substring(0, 32).split('').map(char => {
  const code = parseInt(char, 16);
  return String.fromCharCode(97 + code);
}).join('');

console.log("Calculated Extension ID:", extId);
