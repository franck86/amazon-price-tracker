const APP    		= require('express')();
const BODY_PARSER 	= require('body-parser');
const chokidar 		= require('chokidar');
const fs 			= require('fs');
const request 		= require('request');
const cheerio 		= require('cheerio');
const shortUrl 		= require('node-url-shortener');
const normalize		= require('normalize-text');
const MOMENT      	= require('moment-timezone');
const MongoClient 	= require('mongodb').MongoClient;

const TELEGRAF		= require('telegraf');
const TOKEN_BOT		= '902859650:AAHL6K4MlPAh9iAWVOH2DZlRvjKgZ5XZDu4';
const dbURI    		= 'mongodb://localhost:27017/ecommerce';

const CHANNEL_ID  = -1001240502570;
const MASTER_ID   = 973946580;
const BOT         = new TELEGRAF(TOKEN_BOT);
const TELEGRAM	  = BOT.telegram;

APP.use(BODY_PARSER.json());
BOT.use(TELEGRAF.log());

try {
	const connectToDatabase = () => {
		return new Promise((resolve, reject) => {
			MongoClient.connect(dbURI, (err, db) => {
				if (err) {
					reject(err);
				}
			
				resolve(db);
			});
		});
	};

	var getMyAffiliationByURL = async (requestUrl) => {
		var amzn_url = 'http://www.amazon.it/dp/';
		var promise = new Promise((resolve, reject) => {
			request(requestUrl, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					var $ = cheerio.load(body);
					var title 			= $('#titleSection #productTitle').text().trim();
					var previewImage 	= $('#landingImage')[0].attribs['data-old-hires'];
					var asin 			= $('#cerberus-data-metrics')[0]['attribs']['data-asin'];
					var stars			= $('#averageCustomerReviews .a-icon-star').text();
					stars = parseInt(stars.split(' ')[0]);
					
					var category 		= $('#wayfinding-breadcrumbs_feature_div ul').text();
					var catSplit = category.replace(/\r?\n|\r/g, '').split('›');
					category = normalize.normalizeWhitespaces(catSplit[0]);
					
					var affUrl = amzn_url + asin + '?tag=shockprice05-21';
	
					shortUrl.short(affUrl, function(err, shortUrl){
						if(err){
							reject();
						}
						else{
							var currentDate = MOMENT().tz('Europe/Rome').format('DD-MM-YYYY');
							resolve({
								_id			: asin + '_' + currentDate,
								title		: title,
								stars		: stars,
								asin		: asin,
								url 		: shortUrl ? shortUrl : affUrl,
								img_url		: previewImage,	
								category 	: category,
								date	    : currentDate
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

	var makeid = (length) => {
		var result           = '';
		var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for ( var i = 0; i < length; i++ ) {
		  result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	};
  
	var generateAccountId = () => {
	  return makeid(8).toLowerCase();
	};

	var pushNewProductInDB = (product) => {
		var promise = new Promise((resolve, reject) => {
			connectToDatabase().then((db) => {
				db.collection('item').insertOne(product).then(() => {
					resolve();
				})
				.catch(() => {
					reject();
				});
			})
			.catch((err) => {
				reject();
			});
		});

		return promise;
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
						if(affiliation && affiliation.url){
							var newTMPL = normalizeString(data.replace(amzUrl, affiliation.url));
							affiliation.tmpl = newTMPL;
							affiliation.tmpl = affiliation.tmpl.replace(/\n/g, '<br/>').replace(/\t/g, '&ensp');
							pushNewProductInDB(affiliation).then(() => {
								newTMPL = `[​​​​​​​​​​​](${affiliation.img_url})${newTMPL}\n\n[#${affiliation.category.trim().replace(/ /g, '')}]\n_ Publicato il ${affiliation.date} _`;
								TELEGRAM.sendMessage(CHANNEL_ID, newTMPL, { parse_mode : 'markdown' }).then(() => {
									TELEGRAM.sendMessage(MASTER_ID, `Post ${path} pubblicato!!`, { parse_mode : 'html' });
								}).catch((error) => {
									TELEGRAM.sendMessage(MASTER_ID, `ERRORE Post ${path} NON pubblicato!!\n${JSON.stringify(error)}`, { parse_mode : 'html' });
								});
								removeFile(path);
							})
							.catch(() => {
								removeFile(path);
							});
						}
						else{
							TELEGRAM.sendMessage(MASTER_ID, `URL AFFILIAZIONE NON RECUPERATO Post ${path} !!`, { parse_mode : 'html' });
						}
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
