const axios = require("axios");
const fs = require('fs');

const PRICEMPIRE_BASE_URL = "https://pricempire.com/api";

var priceMPIREApiKey = "";
var waxPeerApiKey = "";
var priceUpperDelimiter = 1.5;
var priceLowerDelimiter = 1.08;
var secondsBetweenWaxListingsUpdates = 60;
var hoursBetweenPriceMPIREPriceUpdate = 6.0;
var hoursBetweenWaxNewListing = 6.0;
var detailedDelimiter = [];
var showResultDetail = false
var priceMPIREItemData = {};
var myListedItems = [];
var waxCache = {};
var lastWaxListingUpdate = Date.now();
var lastPriceMPIREUpdate = Date.now();
var lastWaxNewListing = Date.now();
var itemIdNamePair = {};
var packageNumber = 10;
var decreasingPrice = 0.01;

function error() {
  console.log(
    "  Wax sent an uncomprerrensible response or closed the connection unexpectedly!"
  );
}

async function loadConfig() {

  var file = await fs.readFileSync('config.json', 'utf8');
  var config = await JSON.parse(file);

  timeToCancelAction = config.time_to_cancel_action;
  priceMPIREApiKey = config.pricempire_api_key;
  waxPeerApiKey = config.waxpeer_api_key;
  priceLowerDelimiter = config.default_delimiter[0];
  priceUpperDelimiter = config.default_delimiter[1];
  maxItemsPerListing = config.max_items_per_listing;
  secondsBetweenWaxRequest = config.seconds_between_wax_request;
  detailedDelimiter = config.detailed_delimiter;
  waxUpdateLimit = config.wax_update_limit;
  secondsBetweenWaxListingsUpdates = config.seconds_between_wax_listings_updates;
  hoursBetweenPriceMPIREPriceUpdate = config.hours_between_pricempire_price_update;
  hoursBetweenWaxNewListing = config.hours_between_wax_new_listing;
  showResultDetail = config.show_result_detail;
  lastWaxNewListing = Date.now() - (hoursBetweenWaxNewListing * 60 * 60 * 1000 + 1);
  lastPriceMPIREUpdate = Date.now() - (hoursBetweenPriceMPIREPriceUpdate * 60 * 60 * 1000 + 1);
  lastWaxListingUpdate = Date.now() - (secondsBetweenWaxListingsUpdates * 1000 + 1);
  packageNumber = config.package_number;
  decreasingPrice = config.decreasing_price;

  console.log("Your config:", config);
}

async function loadPriceMPIREInfo() {

  if ((Date.now() - lastPriceMPIREUpdate) <= (hoursBetweenPriceMPIREPriceUpdate * 60 * 60 * 1000)) {
    if (fs.existsSync('pricempire.txt')) {
      return;
    }
  }

  console.log("===> FETCHING PRICEMPIRE PRICES");

  lastPriceMPIREUpdate = Date.now();
  var res = await axios.get(
    PRICEMPIRE_BASE_URL + "/v3/getAllItems",
    {
      params: {
        api_key: priceMPIREApiKey,
        currency: "USD",
        appId: "730",
        sources: "buff",
      },
    }
  );

  if (res.status !== 200) { error(); return; }

  priceMPIREItemData = res.data;
  await fs.writeFileSync('pricempire.txt', JSON.stringify(priceMPIREItemData, null, 2));

  console.log("  Caching pricempire prices...");
  console.log("  Success!");
  console.log("");
}


function getLowerDelimiter(name) {
  var delimiter = priceLowerDelimiter;
  var price = priceMPIREItemData[name].buff.price * 10;
  for (eachDelimiter of detailedDelimiter) {
    if (eachDelimiter.range[0] * 1000 < price && eachDelimiter.range[1] * 1000 > price) {
      //console.log(name,"low",price,eachDelimiter.range[0] * 1000,eachDelimiter.range[1] * 1000,eachDelimiter.delimiter[0])
      delimiter = eachDelimiter.delimiter[0];
    }
  }
  return price * delimiter;
}

function getUpperDelimiter(name) {
  var delimiter = priceUpperDelimiter;
  var price = priceMPIREItemData[name].buff.price * 10;

  for (eachDelimiter of detailedDelimiter) {
    if (eachDelimiter.range[0] * 1000 < price && eachDelimiter.range[1] * 1000 > price) {
      //console.log(name,"high",price,eachDelimiter.range[0] * 1000,eachDelimiter.range[1] * 1000,eachDelimiter.delimiter[1])
      delimiter = eachDelimiter.delimiter[1];
    }
  }
  return price * delimiter;
}

function findLeastWaxPrice(returnedItems) {
  // find the least price listed in waxpeer
  var leastPrice = Number.MAX_VALUE;
  returnedItems.forEach(item => {
    var price = item.price;
    leastPrice = Math.min(price, leastPrice);
    // console.log(leastPrice,price);
  })
  return leastPrice;
}

async function getWaxPriceFor(item) {
  var name = item.steam_market_hash_name;
  var buffUpperDelimiter = await getUpperDelimiter(name) / 1000;
  var buffLowerDelimiter = await getLowerDelimiter(name) / 1000;
  var resultPrice = buffUpperDelimiter;
  if (name && waxCache.hasOwnProperty(name)) {
    returnedItems = waxCache[name];
  } else {
    const options = {
      method: 'GET',
      url: 'https://api.shadowpay.com/api/v2/user/items',
      params: {
        project: 'csgo',
        steam_market_hash_name: name
      },
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + waxPeerApiKey
      }
    };

    try {
      res = await axios.request(options);
    } catch (error) { }

    if (res.status !== 200) {
      error();
      result = buffLowerDelimiter;
    }
    returnedItems = res.data.data
    waxCache[name] = res.data.data;
  }

  if (!returnedItems) {
    resultPrice = buffUpperDelimiter;
  }
  var leastWaxPrice = await findLeastWaxPrice(returnedItems);

  if (leastWaxPrice < buffLowerDelimiter) {
    resultPrice = buffLowerDelimiter;
  } else if (leastWaxPrice <= buffUpperDelimiter) {
    resultPrice = leastWaxPrice - decreasingPrice;
  } else {
    resultPrice = buffUpperDelimiter;
  }

  resultPrice = Math.round(resultPrice * 1000) / 1000
  if (showResultDetail) {
    console.log("------------");
    console.log(name);
    console.log("Least price : ", leastWaxPrice);
    console.log("Low limit : ", buffLowerDelimiter);
    console.log("High limit : ", buffUpperDelimiter);
    console.log("uploaded price : ", resultPrice)
  }

  return resultPrice
}

async function listMyItems() {
  if ((Date.now() - lastWaxNewListing) < hoursBetweenWaxNewListing * 60 * 60 * 1000) {
    return;
  }
  console.log("===> FETCHING YOUR LISTABLE ITEMS");

  lastWaxNewListing = Date.now();

  res = await axios.request(
    {
      method: 'GET',
      url: 'https://api.shadowpay.com/api/v2/user/inventory',
      params: { project: 'csgo' },
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + waxPeerApiKey
      }
    }
  );

  if (res.status !== 200) {
    error();
    return;
  }

  var data = res.data.data;
  console.log(`Found ${data.length} listable items`);

  if (!data || data.length == 0) {
    return;
  }

  var addedNumber = 0;
  var sendData = [];
  var count = 0;

  for (const item of data) {
    count++;
    var price = await getWaxPriceFor(item);
    sendData.push({
      id: item.asset_id,
      price: price,
      project: 'csgo',
      currency: 'USD'
    })
    if (sendData.length == packageNumber || count == data.length) {
      const options = {
        method: 'POST',
        url: 'https://api.shadowpay.com/api/v2/user/offers',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer ' + waxPeerApiKey
        },
        data: { offers: sendData }
      };

      try {
        var { data } = await axios.request(options);
        console.log(data);
        if (data.status == "success") { addedNumber += data.data.length; }
      } catch (error) {
        console.error(error);
      }
      sendData = [];
    }
  }

  console.log(`added  :  ${addedNumber}`);
  console.log(`failed :  ${data.length - addedNumber}`);
}




async function updateMyItems() {
  
  async function updateReques(){
    const options = {
      method: 'PATCH',
      url: 'https://api.shadowpay.com/api/v2/user/offers',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + waxPeerApiKey
      },
      data: { offers: sendData }
    };
  
    try {
      const { data } = await axios.request(options);
      if (data.status == "success") {
        updated += data.metadata.total_updated_items;
        for (const updatedItem of data.updated_items) {
          if (showResultDetail) {
            console.log(`      name : ${itemIdNamePair[updatedItem.id].name} old price : ${itemIdNamePair[updatedItem.id].price} new price :  ${updatedItem.price}`)
          }
        }
      }
    } catch (error) {
      console.error("There is an error while updating");
    }
    sendData = [];
  }


  if ((Date.now() - lastWaxListingUpdate) < secondsBetweenWaxListingsUpdates * 1000) {
    return;
  }
  const options = {
    method: 'GET',
    url: 'https://api.shadowpay.com/api/v2/user/offers',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + waxPeerApiKey
    }
  };

  try {
    res = await axios.request(options);
  } catch (error) {
    console.error(error);
  }

  lastWaxListingUpdate = Date.now();

  if (res.status !== 200) {
    error();
    return;
  }

  myListedItems = res.data.data;
  console.log(``);
  console.log(`There are ${myListedItems.length} items for sale`);
  var updated = 0;

  var totalNumber = 0;
  var sendData = [];

  for (const item of myListedItems) {
    var itemName = item.steam_item.steam_market_hash_name
    // console.log(itemName);
    const options = {
      method: 'GET',
      url: 'https://api.shadowpay.com/api/v2/user/items',
      params: {
        project: 'csgo',
        steam_market_hash_name: itemName
      },
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + waxPeerApiKey
      }
    };

    try {
      res = await axios.request(options);
    } catch (error) { }

    if (res.status === 200) {
      var returnedItems = res.data.data;
      //console.log(returnedItems);
      var listedItemPriceInDollars = item.price;
      var leastWaxPrice = await findLeastWaxPrice(returnedItems);
      //console.log(leastWaxPrice,listedItemPriceInDollars);

      if (leastWaxPrice < listedItemPriceInDollars) {
        var buffLowerDelimiter = await Math.round(getLowerDelimiter(itemName) / 10) / 100;
        var buffUpperDelimiter = await Math.round(getUpperDelimiter(itemName) / 10) / 100;

        if (leastWaxPrice < buffLowerDelimiter) {
          newItemPrice = buffLowerDelimiter;
        } else if (leastWaxPrice <= buffUpperDelimiter) {
          newItemPrice = leastWaxPrice - decreasingPrice;
        } else {
          newItemPrice = buffUpperDelimiter;
        }
        // console.log(leastWaxPrice,listedItemPriceInDollars,buffLowerDelimiter,buffUpperDelimiter,newItemPrice);

        if (newItemPrice != listedItemPriceInDollars) {
          totalNumber++;
          itemIdNamePair[item.id] = { name: itemName, price: listedItemPriceInDollars };
          sendData.push({ id: item.id, price: newItemPrice, currency: 'USD' });
          
          if (sendData.length == packageNumber) {
            await updateReques()
          }

        }
      }
    }
  }

  if(sendData.length>0){
    await updateReques();
  }

  if (totalNumber > 0) {
    console.log(`New updates (${totalNumber} detected)`);

    if (updated > 0) {
      console.log(`   Success: ${updated}`);

    } else {
      console.log("   No success")
    }

    if (totalNumber - updated > 0) {
      console.log(`   Failed: ${totalNumber - updated}`);
    }
    else {
      console.log("   No failed");
    }
  }
  else {
    console.log("   ***No updates***");
  }
}

async function main() {
  await loadConfig();
  while (true) {
    try {
      await loadPriceMPIREInfo();
      await listMyItems();
      await updateMyItems();
    } catch {
      continue;
    }
  }
}

main();