const https = require('https');

exports.handler = async function(event, context) {
// Only allow POST
if (event.httpMethod !== 'POST') {
return { statusCode: 405, body: 'Method Not Allowed' };
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
}

let body;
try {
body = JSON.parse(event.body);
} catch(e) {
return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
}

const payload = JSON.stringify({
model: 'claude-opus-4-6',
max_tokens: 1024,
system: body.system || 'You are a helpful assistant.',
messages: body.messages || []
});

return new Promise((resolve) => {
const options = {
hostname: 'api.anthropic.com',
path: '/v1/messages',
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-api-key': ANTHROPIC_API_KEY,
'anthropic-version': '2023-06-01',
'Content-Length': Buffer.byteLength(payload)
}
};

const req = https.request(options, (res) => {
let data = '';
res.on('data', chunk => data += chunk);
res.on('end', () => {
try {
const parsed = JSON.parse(data);
resolve({
statusCode: 200,
headers: {
'Content-Type': 'application/json',
'Access-Control-Allow-Origin': '*'
},
body: JSON.stringify(parsed)
});
} catch(e) {
resolve({
statusCode: 500,
body: JSON.stringify({ error: 'Failed to parse API response' })
});
}
});
});

req.on('error', (e) => {
resolve({
statusCode: 500,
body: JSON.stringify({ error: e.message })
});
});

req.write(payload);
req.end();
});
};

