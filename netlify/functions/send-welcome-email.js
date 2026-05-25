exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { email, familyName, tempPassword } = JSON.parse(event.body);

    if (!email || !tempPassword) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing email or password' }) };
    }

    const apiKey = process.env.KLAVIYO_API_KEY;
    if (!apiKey) {
      console.error('Missing KLAVIYO_API_KEY environment variable');
      return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
    }

    // Klaviyo API v3 endpoint for sending email
    const res = await fetch('https://a.klaviyo.com/api/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-Revision-Date:2024-02-15`
      },
      body: JSON.stringify({
        data: {
          type: 'email',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email: email
                }
              }
            },
            template: {
              data: {
                type: 'template',
                id: 'welcome'  // We'll use a simple inline template instead
              }
            }
          }
        }
      })
    });

    // Actually, let's use their simpler endpoint for transactional email
    // This is the direct API call without templates

    const emailRes = await fetch('https://a.klaviyo.com/api/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        email: email,
        subject: '✨ Welcome to Folia! Your temp password',
        html: `
<div style="font-family: 'Work Sans', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #6B5D52;">
  <div style="background: #2C2520; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <div style="font-family: 'Crimson Pro', serif; font-size: 32px; font-weight: 600; font-style: italic; color: #FFFFFF; margin-bottom: 8px;">Folia</div>
    <div style="font-size: 14px; color: #B8A490; letter-spacing: 1px; text-transform: uppercase;">Your family. Saved.</div>
  </div>
  
  <div style="background: #FAF8F3; padding: 40px 20px; text-align: center;">
    <h1 style="font-family: 'Crimson Pro', serif; font-size: 28px; color: #2C2520; margin: 0 0 16px 0; font-weight: 400;">Welcome to Folia!</h1>
    <p style="font-size: 15px; color: #6B5D52; margin: 0 0 24px 0; line-height: 1.6;">Your family's information is saved and ready to go. Here's your temporary password — you can change it anytime.</p>
    
    <div style="background: #FFFFFF; border: 2px solid #C17F5D; border-radius: 8px; padding: 24px; margin: 32px 0;">
      <div style="font-size: 12px; color: #B8A490; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">Your Temp Password</div>
      <div style="font-size: 20px; font-weight: 600; color: #2C2520; font-family: 'Courier New', monospace; letter-spacing: 1px; word-break: break-all;">${tempPassword}</div>
    </div>
    
    <div style="margin: 32px 0;">
      <a href="https://withfolia.com/folia" style="display: inline-block; background: #C17F5D; color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign In to Folia</a>
    </div>
    
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #EDE8DC;">
      <p style="font-size: 13px; color: #B8A490; margin: 0; line-height: 1.5;">
        <strong>What's next:</strong> Sign in with your email and this temporary password, then change it to something only you know.
      </p>
    </div>
  </div>
  
  <div style="background: #EDE8DC; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
    <p style="font-size: 12px; color: #B8A490; margin: 0;">Made with Folia — Save your family once. Share forever.</p>
  </div>
</div>
        `,
        text: `Welcome to Folia!\n\nYour family's information is saved. Here's your temporary password:\n\n${tempPassword}\n\nSign in at: https://withfolia.com/folia\n\nChange your password after signing in.`
      })
    });

    const data = await emailRes.json();

    if (!emailRes.ok) {
      console.error('Klaviyo email error:', data);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', details: data }) };
    }

    console.log('✅ Welcome email sent to:', email);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Email sent' })
    };

  } catch (error) {
    console.error('❌ Send email error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' })
    };
  }
};
