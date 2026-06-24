const axios = require('axios');

const TRIPAY_API_KEY = 'ISI_API_KEY_KAMU'; // Ganti dengan API key kamu

async function createTripayTransaction({ method = 'QRIS', ref_id, amount, username, note }) {
  const payload = {
    method,
    merchant_ref: ref_id,
    amount,
    customer_name: username,
    order_items: [
      {
        name: note,
        price: amount,
        quantity: 1
      }
    ],
    callback_url: 'https://DOMAIN-KAMU.com/tripay-callback',
    return_url: 'https://t.me/BOTKAMU',
    expired_time: 3600
  };

  const headers = {
    Authorization: `Bearer ${TRIPAY_API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const { data } = await axios.post(
      'https://tripay.co.id/api/transaction/create',
      payload,
      { headers }
    );
    return data;
  } catch (e) {
    return { success: false, message: e.message, error: e?.response?.data };
  }
}

module.exports = createTripayTransaction;