// ════════════════════════════════════════
// NETLIFY FUNCTION: Send Brief Email
// ════════════════════════════════════════
// Path: /.netlify/functions/send-brief.js
//
// This function sends the sitter brief via SendGrid email.
// Triggered from sitter-brief.html after brief is generated.
//
// Environment variable required: SENDGRID_API_KEY
// (Already in your Netlify env vars)
//
// ════════════════════════════════════════

const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key from environment
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  console.log('📧 send-brief function called');

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { to, subject, text, family_name } = JSON.parse(event.body);

    // Validate required fields
    if (!to || !subject || !text) {
      console.error('❌ Missing required fields:', { to, subject, text: text ? '...' : null });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: to, subject, text' })
      };
    }

    // Validate email format (basic check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.error('❌ Invalid email format:', to);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Build email body with brief text + regenerate note
    const emailBody = `${text}

────────────────────────────────────────

You can always generate another brief at withfolia.com/sitter-brief

Made with ❤️ by Folia
withfolia.com`;

    // Create email message
    const msg = {
      to: to,
      from: 'hello@withfolia.com',
      subject: subject,
      text: emailBody,
      // Plain text only (no HTML)
      html: null,
      replyTo: 'hello@withfolia.com'
    };

    console.log('📤 Sending email to:', to);
    console.log('📧 Subject:', subject);

    // Send email via SendGrid
    const response = await sgMail.send(msg);

    console.log('✅ Email sent successfully');
    console.log('📊 SendGrid response:', response[0].statusCode);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        recipient: to
      })
    };

  } catch (error) {
    console.error('❌ Error sending email:', error);

    // Return error but don't block the brief
    // This matches the "fire-and-forget" pattern
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to send email'
      })
    };
  }
};

// ════════════════════════════════════════
// SETUP INSTRUCTIONS
// ════════════════════════════════════════
//
// 1. Install SendGrid package in your project:
//    npm install @sendgrid/mail
//
// 2. Add SENDGRID_API_KEY to Netlify environment:
//    - Go to Netlify Site Settings → Build & Deploy → Environment
//    - Add variable: SENDGRID_API_KEY = <your key from SendGrid>
//
// 3. Update package.json dependencies if needed
//
// 4. Deploy to Netlify (Netlify auto-deploys functions)
//
// ════════════════════════════════════════
