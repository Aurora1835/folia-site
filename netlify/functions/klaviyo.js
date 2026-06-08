const rateLimits = new Map();

function checkRateLimit(ip, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimits.get(ip) || [];
  const recentRequests = userLimits.filter(time => now - time < windowMs);
  if (recentRequests.length >= limit) return false;
  recentRequests.push(now);
  rateLimits.set(ip, recentRequests);
  return true;
}

exports.handler = async function(event) {
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRateLimit(ip, 5, 60000)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please try again later.' }) };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  if (!KLAVIYO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Klaviyo not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, name, source } = body;
  const resolvedListId = process.env.KLAVIYO_LIST_ID;

  console.log('Klaviyo function called for:', email, '| source:', source);

  if (!resolvedListId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No list ID configured' }) };
  }

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No email provided' }) };
  }

  try {
    // Step 1: Create or update profile in Klaviyo
    const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email: email,
            first_name: name || ''
          }
        }
      })
    });

    const profileData = JSON.parse(await profileRes.text());
    const profileId = profileData?.data?.id || profileData?.errors?.[0]?.meta?.duplicate_profile_id;
    console.log('Profile ID:', profileId);

    if (!profileId) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not create or find Klaviyo profile' }) };
    }

    // Step 2: Add profile to list
    await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [{
                type: 'profile',
                attributes: { email: email }
              }]
            }
          },
          relationships: {
            list: {
              data: { type: 'list', id: resolvedListId }
            }
          }
        }
      })
    });

    // Step 3: Fire the right event based on source
    const eventName = source === 'post_payment' ? 'Folia Payment Complete' : 'Sitter Brief Generated';

    const eventRes = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: { email: email }
              }
            },
            metric: {
              data: {
                type: 'metric',
                attributes: { name: eventName }
              }
            },
            properties: {
              family_name: name,
              source: source
            }
          }
        }
      })
    });

    console.log('Event fired:', eventName, '| status:', eventRes.status);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };

  } catch(e) {
    console.error('Klaviyo error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
