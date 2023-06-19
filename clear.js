const fs = require('fs');
const axios = require('axios');

fs.readFile('config.json', async (err, data) => {
  const config = JSON.parse(data);
  const wax_api_key = config.waxpeer_api_key;

  const options = {
    method: 'DELETE',
    url: 'https://api.shadowpay.com/api/v2/user/offers/all',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer '+wax_api_key
    }
  };
  
  try {
    const { data } = await axios.request(options);
    if (data.status === "suceess") {
      console.log(`Success (${data.cancelled_items.length || 0})`);
    }
  } catch (error) {
    console.error(error);
  }

});

