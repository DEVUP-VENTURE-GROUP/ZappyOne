// Every test file, before config loads: blank the senders and payment gateways from the developer's .env, so no test texts a real number or calls a real gateway. Tests that need a gateway set fake keys on config themselves.
for (const k of ['TWO_FACTOR_API_KEY', 'FAST2SMS_KEY', 'MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) process.env[k] = '';
