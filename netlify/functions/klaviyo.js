exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;

  console.log('Klaviyo function called');
  console.log('API key present:', !!KLAVIYO_API_KEY);
  console.log('List ID present:', !!KLAVIYO_LIST_ID);

  if (!KLAVIYO_API_KEY || !KLAVIYO_LIST_ID) {
    console.log('Missing env vars');
    return { statusCode: 500, body: JSON.stringify({ error: 'Klaviyo not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email, name, brief } = body;
  console.log('Sending to Klaviyo for:', email);

  try {
    const res = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
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
                attributes: {
                  email,
                  properties: {
                    first_name: name,
                    sitter_brief: brief
                  }
                }
              }]
            },
            historical_import: false
          },
          relationships: {
            list: {
              data: { type: 'list', id: KLAVIYO_LIST_ID }
            }
          }
        }
      })
    const responseText = await res.text();
    console.log('Klaviyo response status:', res.status);
    console.log('Klaviyo response body:', responseText);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };
  } catch(e) {
    console.log('Klaviyo fetch error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
