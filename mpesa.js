const axios = require('axios');

// M-Pesa API endpoints
const DARAJA_AUTH_URL = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const DARAJA_STK_PUSH_URL = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
const DARAJA_QUERY_URL = 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query';

// Production URLs (uncomment when going live)
// const DARAJA_AUTH_URL = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
// const DARAJA_STK_PUSH_URL = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
// const DARAJA_QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

let cachedToken = null;
let tokenExpiry = null;

/**
 * Get M-Pesa access token from Daraja API
 */
const getAccessToken = async () => {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const response = await axios.get(DARAJA_AUTH_URL, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    cachedToken = response.data.access_token;
    // Token expires in 3600 seconds, cache for 3500 to be safe
    tokenExpiry = Date.now() + (3500 * 1000);

    console.log('✓ M-Pesa access token obtained');
    return cachedToken;
  } catch (error) {
    console.error('Error getting M-Pesa token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with M-Pesa API');
  }
};

/**
 * Generate timestamp in format YYYYMMDDHHmmss
 */
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[-T:Z]/g, '').slice(0, 14);
};

/**
 * Generate password: Base64(Shortcode + Passkey + Timestamp)
 */
const generatePassword = (timestamp) => {
  const data = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(data).toString('base64');
};

/**
 * Initiate STK Push (prompt payment on customer's phone)
 */
const initiateSTKPush = async (phoneNumber, amount, orderRef, baseUrl) => {
  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    // Format phone: 254XXXXXXXXX (Kenyan format)
    const formattedPhone = phoneNumber.startsWith('254')
      ? phoneNumber
      : phoneNumber.replace(/^0/, '254');

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount), // M-Pesa requires whole numbers
      PartyA: formattedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: `${baseUrl}/api/mpesa/callback`,
      AccountReference: process.env.MPESA_ACCOUNT_PREFIX,
      TransactionDesc: `Order ${orderRef}`,
      Remark: `Payment for order ${orderRef}`
    };

    console.log(`📱 Initiating STK Push for ${formattedPhone}, Amount: KES ${amount}`);

    const response = await axios.post(DARAJA_STK_PUSH_URL, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.ResponseCode === '0') {
      console.log(`✓ STK Push successful: ${response.data.CheckoutRequestID}`);
      return {
        success: true,
        checkoutRequestId: response.data.CheckoutRequestID,
        message: response.data.ResponseDescription
      };
    } else {
      console.error(`✗ STK Push failed: ${response.data.ResponseDescription}`);
      return {
        success: false,
        message: response.data.ResponseDescription
      };
    }
  } catch (error) {
    console.error('Error initiating STK Push:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Query payment status
 */
const queryPaymentStatus = async (checkoutRequestId) => {
  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const response = await axios.post(DARAJA_QUERY_URL, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      responseCode: response.data.ResponseCode,
      resultCode: response.data.ResultCode,
      resultDesc: response.data.ResultDesc,
      merchantRequestId: response.data.MerchantRequestID,
      checkoutRequestId: response.data.CheckoutRequestID
    };
  } catch (error) {
    console.error('Error querying payment status:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  getAccessToken,
  initiateSTKPush,
  queryPaymentStatus,
  getTimestamp,
  generatePassword
};
