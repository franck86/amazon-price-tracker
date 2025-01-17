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
//const mongoUrl    		= 'mongodb://admin:qwebnm198256@127.0.0.1';
const mongoUrl    		= 'mongodb://admin:qwebnm198256@185.242.180.199';
const dbName = 'ecommerce';

// Create a new MongoClient
const client = new MongoClient(mongoUrl);

const CHANNEL_ID  = -1001240502570;
const MASTER_ID   = 973946580;
const BOT         = new TELEGRAF(TOKEN_BOT);
const TELEGRAM	  = BOT.telegram;

APP.use(BODY_PARSER.json());
BOT.use(TELEGRAF.log());

client.connect(function(err, client) {
	if (err) {
		return console.log(JSON.stringify(err));
	}

	console.log('... Connessione al DB Mongo OK ...');
	const db = client.db(dbName);
	db.collection('products').createIndex({"asin":1},{unique:true});

	try {
		var getMyAffiliationByURL = async (requestUrl) => {
			var amzn_url = 'http://www.amazon.it/dp/';
			var promise = new Promise((resolve, reject) => {
				request(requestUrl, function(error, response, body) {
					if (!error && response.statusCode == 200) {
						var $ = cheerio.load(body);
						var title 			= $('#titleSection #productTitle').text().trim();
						var previewImage 	= $('#landingImage')[0].attribs['data-old-hires'];
						var asin 			= $('input#ASIN').length ? $('input#ASIN').attr('value') : false;
						
						if(!asin){
							reject({message: 'ASIN NON RECUPERATO!!'});
						}

						var stars			= $('#averageCustomerReviews .a-icon-star').text();
						stars = parseInt(stars.split(' ')[0]);
						
						var category 		= $('#wayfinding-breadcrumbs_feature_div ul').text();
						var catSplit = category.replace(/\r?\n|\r/g, '').split('›');
						category = normalize.normalizeWhitespaces(catSplit[0]);
						
						var affUrl = amzn_url + asin + '?tag=scontishock0a-21';
		
						shortUrl.short(affUrl, function(err, shortUrl){
							if(err){
								reject();
							}
							else{
								var currentDate = MOMENT().tz('Europe/Rome').format('DD-MM-YYYY HH:mm');
								resolve({
									title		: title,
									stars		: stars,
									asin		: asin,
									url 		: shortUrl ? shortUrl : affUrl,
									img_url		: previewImage,	
									category 	: category ? category : 'Varie',
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
	  
		var pushNewProductInDB = (product) => {
			var promise = new Promise((resolve, reject) => {
				db.collection('products').insertOne(product).then(() => {
					console.log('INSERITO NEL DB!!')
					resolve();
				})
				.catch((e) => {
					console.log(`NON INSERITO NEL DB : ${e.errmsg}`)
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
									console.log("STO PER INVIARE IL POST!!");
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
								TELEGRAM.sendMessage(MASTER_ID, `NON PUBBLICATO : MIO URL DI AFFILIAZIONE NON PRESENTE NEL Post ${path} !!`, { parse_mode : 'html' });
								removeFile(path);
							}
						}
						else{
							TELEGRAM.sendMessage(MASTER_ID, `NON PUBBLICATO : POST ORIGINALE NON CONTIENE UN AMAZON URL ${path}!!`, { parse_mode : 'html' });
							removeFile(path);
						}
					} else {
						TELEGRAM.sendMessage(MASTER_ID, `ERRORE LETTURA FILE DEL POST ${path}!!\n${JSON.stringify(err)}`, { parse_mode : 'html' });
						removeFile(path);
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
});
