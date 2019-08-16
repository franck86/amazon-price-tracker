var request = require('request');
var prompt = require('prompt');
var pb = require('pushbullet');
var cheerio = require('cheerio');

// Variables
var asin, price, pb_token;
var amzn_url = 'http://www.amazon.it/dp/';
var span_id = '#priceblock_ourprice';
var check_interval = 60000;

var schema = {
	properties: {
		asin: {
			description: 'Enter the product ASIN',
			type: 'string',
			required: true
		},
		price: {
			description: 'Enter the desired price (USD)',
			type: 'number',
			required: true
		}
		/*,
		pb_token: {
			description: 'Enter your PushBullet token',
			type: 'string',
			required: true,
			hidden: true
		}*/
	}
};

amzn_url = amzn_url + 'B079N9LNQG';
price = 30;

/*prompt.start();

prompt.get(schema, function (error, result) {
	if (!error) {
		asin = result.asin;
		price = result.price;
		//pb_token = result.pb_token;

		amzn_url += asin;

		checkPrice();
	}
});
*/
function checkPrice() {
	request(amzn_url, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			var $ = cheerio.load(body);

			var list_price = $(span_id).text();
			var stripped_price = parseFloat(list_price.replace('€', ''));

			if (stripped_price <= price) {
				sendPush();
			}
		}
		else {
			console.log("Uh oh. There was an error.");
		}
	});

	setTimeout(checkPrice, check_interval);
}

function sendPush() {
	
	console.log("Amazon Price Watc => A product you are watching has dropped in price: " + amzn_url);
	
	/*var pusher = new pb(pb_token);

	pusher.note(null, "Amazon Price Watch", "A product you are watching has dropped in price: " + amzn_url, function(error, response) {
		if (!error) {
			process.exit();
		}
	});*/
}

checkPrice();