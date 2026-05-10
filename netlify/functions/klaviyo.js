// Simple in-memory rate limiting (upgrade to Redis for production)
const rateLimits = new Map();

function checkRateLimit(ip, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimits.get(ip) || [];
  const recentRequests = userLimits.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= limit) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimits.set(ip, recentRequests);
  return true;
}

exports.handler = async function(event) {
  // Rate limiting - 5 requests per minute per IP
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRateLimit(ip, 5, 60000)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
    };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;
  console
