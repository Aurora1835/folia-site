const sgMail = require('@sendgrid/mail');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Create Supabase client with service role for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Rate limiting
const rateLimits = new Map();
function checkRateLimit(ip, limit = 3, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimits.get(ip) || [];
  const recentRequests = userLimits.filter(time => now - time < windowMs);
  if (recentRequests.length >= limit) return false;
  recentRequests.push(now);
  rateLimits.set(ip, recentRequests);
  return true;
}

exports.handler = async (event) => {
  // Rate limiting - 3 invites per minute
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRateLimit(ip, 3, 60000)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many invites. Please wait a minute.' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const { to, familyName, inviterName } = body;

  if (!to || !to.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Get the inviter's household_id and user_id from their session
  // Note: We'll pass this from the front-end since we have their auth context there
  const householdId = body.householdId;
  const inviterUserId = body.inviterUserId;

  if (!householdId || !inviterUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing household info' }) };
  }

  // Store invite token in database
  const { error: dbError } = await supabase
    .from('invite_tokens')
    .insert({
      token,
      email: to.toLowerCase().trim(),
      household_id: householdId,
      inviter_user_id: inviterUserId,
      expires_at: expiresAt.toISOString()
    });

  if (dbError) {
    console.error('Database error:', dbError);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create invite' }) };
  }

  // Create secure invite link with token
  const inviteLink = `https://withfolia.com/invite?token=${token}`;

  const msg = {
    to: to.trim(),
    from: 'jessrosesilberman@gmail.com',
    subject: `${inviterName} invited you to view ${familyName}'s Folia`,
    html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-family: Georgia, serif; font-size: 32px; font-style: italic; color: #3A2E1E; margin: 0;">Folia</h1>
          <p style="color: #8B7355; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 5px;">Your family. A living record.</p>
        </div>
        
        <div style="background: #F5EDD8; border: 1px solid #D4C4A0; border-radius: 8px; padding: 30px; margin-bottom: 25px;">
          <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #3A2E1E;">${inviterName} invited you to view ${familyName}'s Folia</h2>
          <p style="color: #5C4A30; line-height: 1.6; margin: 0 0 20px 0;">You've been given access to view and help manage ${familyName}'s family information, schedules, and important details.</p>
          <div style="text-align: center;">
            <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background: #6A7C60; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; letter-spacing: 0.5px;">Accept Invite →</a>
          </div>
        </div>
        
        <p style="color: #8B7355; font-size: 13px; line-height: 1.6; text-align: center; margin: 0;">This invitation expires in 7 days. If you didn't expect this invite, you can safely ignore this email.</p>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #D4C4A0;">
          <p style="color: #A89070; font-size: 11px; margin: 0;">© 2026 Folia · withfolia.com</p>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log('Invite email sent to:', to);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('SendGrid error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' })
    };
  }
};
