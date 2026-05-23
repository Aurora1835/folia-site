const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  // Only POST allowed
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { sessionId, onboardingData } = JSON.parse(event.body);

    // Validate inputs
    if (!sessionId || !onboardingData || !onboardingData.parentEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // STEP 1: Verify payment with Stripe
    console.log('Verifying payment for session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== 'paid') {
      console.log('Payment not confirmed. Status:', session.payment_status);
      return { statusCode: 400, body: JSON.stringify({ error: 'Payment not confirmed' }) };
    }

    console.log('✅ Payment verified');

    // STEP 2: Create account or get existing user
    const email = onboardingData.parentEmail.toLowerCase().trim();
    const tempPassword = 'Folia_' + Math.random().toString(36).slice(2, 10) + '!';
    
    let userId;
    let isNewUser = false;

    console.log('Creating/fetching user account for:', email);

    // Try to create new user
    const { data: signupData, error: signupError } = await sb.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true
    });

    if (signupError) {
      // User already exists — get their ID
      if (signupError.message.includes('already exists')) {
        console.log('User already exists, fetching ID');
        
        const { data: users, error: fetchError } = await sb.auth.admin.listUsers();
        if (fetchError) throw new Error('Cannot fetch existing user: ' + fetchError.message);
        
        const existingUser = users.find(u => u.email === email);
        if (!existingUser) throw new Error('User exists but cannot be found');
        
        userId = existingUser.id;
        console.log('✅ Found existing user:', userId);
      } else {
        throw new Error('Auth error: ' + signupError.message);
      }
    } else {
      userId = signupData.user.id;
      isNewUser = true;
      console.log('✅ Created new user:', userId);
    }

    // STEP 3: Save or update profile
    console.log('Saving profile to family_profiles table');

    const profileData = {
      user_id: userId,
      family_name: onboardingData.familyName || '',
      parent_name: onboardingData.parentName || '',
      members: onboardingData.members || [],
      emergency_name: onboardingData.emergencyName || '',
      emergency_phone: onboardingData.emergencyPhone || '',
      updated_at: new Date().toISOString()
    };

    const { error: profileError } = await sb
      .from('family_profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (profileError) {
      throw new Error('Profile save error: ' + profileError.message);
    }

    console.log('✅ Profile saved');

    // STEP 4: Create session so user is logged in
    console.log('Creating session');

    const { data: sessionData, error: sessionError } = await sb.auth.admin.createSession({
      user_id: userId
    });

    if (sessionError || !sessionData?.session) {
      throw new Error('Session creation failed: ' + (sessionError?.message || 'No session data'));
    }

    console.log('✅ Session created');

    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
        userId: userId,
        isNewUser: isNewUser
      })
    };

  } catch (error) {
    console.error('❌ Post-payment error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' })
    };
  }
};
