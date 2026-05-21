// /.netlify/functions/stripe-webhook.js
// Handles Stripe payment completion webhooks
// Flow: Stripe fires webhook → verify signature → save payment → generate brief → send email → delete form data → redirect user

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key (backend only, secret)
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Claude for brief generation
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  const body = event.body;
  
  // ════════════════════════════════════════
  // STEP 1: VERIFY WEBHOOK SIGNATURE
  // Ensures this came from Stripe, not a forged request
  // ════════════════════════════════════════
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Webhook signature verification failed' })
    };
  }
  
  console.log('✅ Webhook signature verified, event type:', stripeEvent.type);
  
  // ════════════════════════════════════════
  // STEP 2: FILTER FOR PAYMENT SUCCESS EVENTS
  // We only care about checkout.session.completed
  // ════════════════════════════════════════
  if (stripeEvent.type !== 'checkout.session.completed') {
    console.log('ℹ️ Ignoring event type:', stripeEvent.type);
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  }
  
  const session = stripeEvent.data.object;
  
  console.log('🔔 Payment completed for session:', session.id);
  console.log('💰 Amount:', session.amount_total, session.currency);
  console.log('📧 Customer email:', session.customer_details?.email);
  console.log('🏷️ Client reference (family_id):', session.client_reference_id);
  
  const familyId = session.client_reference_id;
  const customerEmail = session.customer_details?.email;
  const stripeSessionId = session.id;
  
  // Determine tier from amount (5$ = 500 cents, 9$ = 900 cents per month)
  const amountCents = session.amount_total;
  let tier = 5;
  if (amountCents >= 900) {
    tier = 9;
  }
  
  if (!familyId) {
    console.error('❌ No family_id in client_reference_id');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing family_id' })
    };
  }
  
  try {
    
    // ════════════════════════════════════════
    // STEP 3: RETRIEVE FAMILY DRAFT DATA
    // Get the form data that was saved in Step 1 of generateBrief()
    // ════════════════════════════════════════
    const { data: familyData, error: familyError } = await sb
      .from('family_drafts')
      .select('*')
      .eq('id', familyId)
      .single();
    
    if (familyError || !familyData) {
      console.error('❌ Family data not found:', familyError);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Family data not found' })
      };
    }
    
    console.log('✅ Family data retrieved:', {
      family_name: familyData.family_name,
      email: familyData.parent_email,
      has_children: !!familyData.children
    });
    
    // ════════════════════════════════════════
    // STEP 4: SAVE PAYMENT RECORD
    // Track that this user paid, for $5 limiting later
    // ════════════════════════════════════════
    const { data: paymentRecord, error: paymentError } = await sb
      .from('payments')
      .insert([{
        family_id: familyId,
        brief_type: 'sitter',
        tier: tier,
        stripe_session_id: stripeSessionId,
        stripe_customer_id: session.customer,
        status: 'paid'
      }])
      .select();
    
    if (paymentError) {
      console.error('❌ Error saving payment record:', paymentError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Payment record save failed' })
      };
    }
    
    const paymentId = paymentRecord[0].id;
    console.log('✅ Payment record saved:', paymentId);
    
    // ════════════════════════════════════════
    // STEP 5: GENERATE BRIEF USING CLAUDE
    // ════════════════════════════════════════
    const prompt = `Create a warm, practical sitter brief for ${familyData.family_name}. Remember: no markdown formatting whatsoever. No #, **, *, or bullet points. Plain text only with ALL CAPS headers and dash lines.

Details provided:
- Children: ${familyData.children || 'not specified'}
- Parents/Caregivers: ${familyData.parents || 'not specified'}
- Emergency contact: ${familyData.emergency || 'not provided'}
- Additional notes: ${familyData.notes || 'none'}

CRITICAL RULES:
- ONLY use information explicitly provided — never invent any details
- Keep each child's information separate
- Do NOT include meals, snacks, bedtime, or schedule sections unless mentioned in notes
- For children, only use names and ages actually provided
- If a section has no real data, skip it completely

Always include these sections:
1. WELCOME & OVERVIEW — warm intro paragraph
2. THE CHILDREN — names and ages provided, nothing invented
3. EMERGENCY CONTACTS — formatted clearly
4. A NOTE FROM US — warm closing

Only include if explicitly mentioned in notes:
- THE HOUSE (wifi, pets, house rules)
- SCHEDULES & ROUTINES (if provided in notes)

Format each section with section name in ALL CAPS followed by a line of dashes.
Write as if the family wrote it themselves.`;
    
    let briefText;
    try {
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-20250805',
        max_tokens: 1024,
        system: 'You are helping someone create a sitter brief. NEVER give medical advice. ONLY state conditions as provided and direct sitter to call parents. Never use markdown. Use ALL CAPS headers with dash lines. Write warmly using only provided details.',
        messages: [
          { role: 'user', content: prompt }
        ]
      });
      
      briefText = message.content[0].text;
      console.log('✅ Brief generated by Claude');
      
    } catch (claudeError) {
      console.error('⚠️ Claude API error:', claudeError.message);
      // Fallback brief
      const dash = '─'.repeat(42);
      briefText = `WELCOME & OVERVIEW\n${dash}\nWelcome, and thank you for being here!\n\n`;
      if (familyData.children) briefText += `THE CHILDREN\n${dash}\n${familyData.children}\n\n`;
      if (familyData.emergency) briefText += `EMERGENCY CONTACTS\n${dash}\n${familyData.emergency}\n\n`;
      if (familyData.notes) briefText += `THE HOUSE\n${dash}\n${familyData.notes}\n\n`;
      briefText += `A NOTE FROM US\n${dash}\nThank you so much for being here. Please reach out anytime.\n\nWith warmest thanks,\n${familyData.family_name}`;
      console.log('✅ Using fallback brief');
    }
    
    // ════════════════════════════════════════
    // STEP 6: SAVE BRIEF RECORD TO DATABASE
    // Track that this brief was generated
    // ════════════════════════════════════════
    const { error: briefSaveError } = await sb
      .from('briefs_generated')
      .insert([{
        payment_id: paymentId,
        family_id: familyId,
        brief_type: 'sitter',
        brief_content: briefText
      }]);
    
    if (briefSaveError) {
      console.error('⚠️ Error saving brief record (non-blocking):', briefSaveError);
      // Don't fail — brief is in memory, user can still see it
    } else {
      console.log('✅ Brief record saved to database');
    }
    
    // ════════════════════════════════════════
    // STEP 7: SEND EMAIL BACKUP (fire and forget)
    // User gets email copy of brief for safety
    // ════════════════════════════════════════
    const emailAddress = familyData.parent_email || customerEmail;
    if (emailAddress) {
      try {
        const emailBody = `Hello ${familyData.family_name},

Here's your sitter brief from Folia. You can forward this to your sitter, or regenerate an updated version anytime at withfolia.com/sitter-brief.

---

${briefText}

---

Questions? Email us at hello@withfolia.com or visit withfolia.com.

Made with Folia.`;

        // Use SendGrid (you have SENDGRID_API_KEY in Netlify env)
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        await sgMail.send({
          to: emailAddress,
          from: 'hello@withfolia.com',
          subject: `Your ${familyData.family_name} Sitter Brief from Folia`,
          text: emailBody,
          replyTo: 'hello@withfolia.com'
        });
        
        console.log('✅ Email sent to:', emailAddress);
      } catch (emailError) {
        console.error('⚠️ Email send failed (non-blocking):', emailError.message);
        // Don't fail — user has brief on screen
      }
    }
    
    // ════════════════════════════════════════
    // STEP 8: DELETE FORM DATA (privacy: we promised "no data stored")
    // Schedule deletion after 5 seconds to give browser time to poll
    // ════════════════════════════════════════
    setTimeout(async () => {
      try {
        await sb
          .from('family_drafts')
          .delete()
          .eq('id', familyId);
        console.log('✅ Form data deleted from Supabase (privacy cleaned)');
      } catch (deleteError) {
        console.error('⚠️ Error deleting form data (non-blocking):', deleteError);
      }
    }, 5000);
    
    // ════════════════════════════════════════
    // STEP 9: RETURN SUCCESS TO STRIPE
    // Stripe won't retry if we return 200
    // ════════════════════════════════════════
    console.log('✅ Webhook processing complete, family_id:', familyId);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        family_id: familyId,
        payment_id: paymentId,
        tier: tier
      })
    };
    
  } catch (err) {
    console.error('❌ Unexpected webhook error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
