const APP    		= require('express')();
const BODY_PARSER 	= require('body-parser');
const chokidar 		= require('chokidar');
const fs 			= require('fs');
const request 		= require('request');
const cheerio 		= require('cheerio');
const shortUrl 		= require('node-url-shortener');

const TELEGRAF		= require('telegraf');
let TOKEN_BOT		= '902859650:AAHL6K4MlPAh9iAWVOH2DZlRvjKgZ5XZDu4';

const CHANNEL_ID  = -1001240502570;
const MASTER_ID   = 973946580;
const BOT         = new TELEGRAF(TOKEN_BOT);
const TELEGRAM	  = BOT.telegram;

APP.use(BODY_PARSER.json());
BOT.use(TELEGRAF.log());

try {
	var getMyAffiliationByURL = async (requestUrl) => {
		var amzn_url = 'http://www.amazon.it/dp/';
		var promise = new Promise((resolve, reject) => {
			request(requestUrl, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					var $ = cheerio.load(body);
					var previewImage = $('#landingImage')[0].attribs['data-old-hires'];
					var asin = $('#cerberus-data-metrics')[0]['attribs']['data-asin'];
					var affUrl = amzn_url + asin + '?tag=shockprice05-21';
	
					shortUrl.short(affUrl, function(err, shortUrl){
						if(err){
							reject();
						}
						else{
							resolve({
								affUrl : shortUrl ? shortUrl : affUrl,
								image  : previewImage
							});
						}
					});
				}
				else {
					TELEGRAM.sendMessage(MASTER_ID, `ERRORE nella richiesta pagina AMAZON !!\n${JSON.stringify(error)}`, { parse_mode : 'html' });
					reject();
				}
			});
		});
		return promise;
	};

	var urlify = (text) => {
		var urlRegex = /(https?:\/\/[^\s]+)/g;
		var urlExtract = '';
		text.replace(urlRegex, function(url,b,c) {
			urlExtract = url;
		});
		return urlExtract;
	};

	var removeFile = (path) => {
		fs.unlink(path, (err) => {
			if (err) {
				console.error(err);
			}
		})
	};

	var normalizeString = (string) => {
		return string.replace(/<\/?[^>]+(>|$)/g, "");
	};

	var watcher = chokidar.watch('posts/', {ignored: /^\./, persistent: true});

	watcher
		.on('add', function(path) {
			console.log('File', path, 'has been added');
			
			fs.readFile(path, {encoding: 'utf-8'}, async(err,data) => {
				if (!err) {
					var amzUrl = urlify(data);
					if(amzUrl.indexOf('https://amzn.to/') !== -1){
						var affiliation = await getMyAffiliationByURL(amzUrl);
						var newTMPL = normalizeString(data.replace(amzUrl, affiliation.affUrl));
						newTMPL = `[​​​​​​​​​​​](${affiliation.image})${newTMPL}`;
						TELEGRAM.sendMessage(CHANNEL_ID, newTMPL, { parse_mode : 'markdown' }).then(() => {
							TELEGRAM.sendMessage(MASTER_ID, `Post ${path} pubblicato!!`, { parse_mode : 'html' });
							removeFile(path);
						}).catch((error) => {
							TELEGRAM.sendMessage(MASTER_ID, `ERRORE Post ${path} NON pubblicato!!\n${JSON.stringify(error)}`, { parse_mode : 'html' });
						});
					}
					else{
						TELEGRAM.sendMessage(MASTER_ID, `Post ${path} contains NO AMAZON URL!!`, { parse_mode : 'html' });
					}
				} else {
					TELEGRAM.sendMessage(MASTER_ID, `ERRORE lettura file del Post ${path}!!\n${JSON.stringify(err)}`, { parse_mode : 'html' });
				}
			});
		});
	
	APP.get('/', function (req, res) {
		res.json({ 
			version: '1.0',
			name: 'affiliation bot'
		});
	});

	var server = APP.listen(process.env.PORT || 4000, "0.0.0.0", () => {
		const host = server.address().address;
		const port = server.address().port;
		console.log(`Web server started at http://${host}:${port}`);
	});
} catch (error) {
	TELEGRAM.sendMessage(MASTER_ID, `Error ${JSON.stringify(error.message)}`, { parse_mode : 'html' });
}
