const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

exports.handler = async (event) => {
  // Rate limiting
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRateLimit(ip, 5, 60000)) { // 5 requests per minute
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { to, familyName, inviterName, inviteLink } = JSON.parse(event.body);

  const msg = {
    to,
    from: 'hello@withfolia.com', // Use YOUR verified email
    subject: `${inviterName} invited you to view ${familyName}'s Folia`,
    text: `${inviterName} has invited you to view ${familyName}'s family information on Folia.

Click here to get instant access:
${inviteLink}

You'll be able to see:
- Family member profiles
- Emergency contact info  
- House details (wifi, address, etc.)

No signup required - just tap the link and you're in.

— Folia
withfolia.com`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:40px 20px;">
        <h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#3A2E1E;margin-bottom:10px;">${inviterName} invited you to view ${familyName}'s Folia</h2>
        <p style="color:#5C4A30;line-height:1.7;margin-bottom:24px;">You now have access to ${familyName}'s family information - everything you need in one place.</p>
        <a href="${inviteLink}" style="display:inline-block;background:#6A7C60;color:white;padding:14px 32px;text-decoration:none;border-radius:4px;font-weight:500;">View Their Folia →</a>
        <p style="color:#8B7355;font-size:14px;line-height:1.6;margin-top:32px;">You'll be able to see:<br>
        • Family member profiles<br>
        • Emergency contact info<br>  
        • House details (wifi, address, etc.)</p>
        <p style="color:#A89070;font-size:12px;margin-top:32px;border-top:1px solid #EAD9BC;padding-top:20px;">No signup required - just tap the link and you're in.<br><br>— Folia<br>withfolia.com</p>
      </div>
    `
  };

 try {
    console.log('Attempting to send email to:', to);
    console.log('From:', msg.from);
    await sgMail.send(msg);
    console.log('Email sent successfully!');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('SendGrid error:', error.response ? error.response.body : error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
