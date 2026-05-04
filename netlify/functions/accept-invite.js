const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const { token, userEmail } = body;

  if (!token || !userEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token and email required' }) };
  }

  // Look up the invite token
  const { data: invite, error } = await supabase
    .from('invite_tokens')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .single();

  if (error || !invite) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'Invalid or expired invite link' }) 
    };
  }

  // Check if expired
  if (new Date(invite.expires_at) < new Date()) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'This invite has expired' }) 
    };
  }

  // Verify email matches the invite
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ error: 'This invite was sent to a different email address' }) 
    };
  }

  // Mark token as used
  await supabase
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  // Return the household_id so the front-end can load it
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      success: true,
      householdId: invite.household_id
    })
  };
};
