exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;

  console.log('Klaviyo function called');

  if (!KLAVIYO_API_KEY || !KLAVIYO_LIST_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Klaviyo not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, name, brief } = body;
  console.log('Sending to Klaviyo for:', email);

  try {
    // Step 1: Create or update the profile
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
            first_name: name,
            properties: {
              sitter_brief: brief
            }
          }
        }
      })
    });

   const profileText = await profileRes.text();
    const profileData = JSON.parse(profileText);
    // Handle both new profile (201) and duplicate (409)
    const profileId = profileData?.data?.id || profileData?.errors?.[0]?.meta?.duplicate_profile_id;

    if (!profileId) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No profile ID returned' }) };
    }

   // Step 2: Subscribe profile to list
    const listRes = await fetch(`https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/`, {
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
                  email: email
                },
                meta: {
                  patch_properties: {
                    append: {}
                  }
                }
              }]
            }
          },
          relationships: {
            list: {
              data: { type: 'list', id: KLAVIYO_LIST_ID }
            }
          }
        }
      })
    });

    const listText = await listRes.text();
    console.log('List subscribe response status:', listRes.status);
    console.log('List subscribe response body:', listText);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };

  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
