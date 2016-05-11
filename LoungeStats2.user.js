// ==UserScript==
// @name        LoungeStats2
// @namespace   LoungeStats2
// @author      Kinsi http://reddit.com/u/kinsi55
// @include     http://csgolounge.com/myprofile
// @include     http://dota2lounge.com/myprofile
// @include     https://csgolounge.com/myprofile
// @include     https://dota2lounge.com/myprofile
// @version     2.0.0
// @require     https://cdnjs.cloudflare.com/ajax/libs/jquery/2.2.0/jquery.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/jqPlot/1.0.8/jquery.jqplot.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/jqPlot/1.0.8/plugins/jqplot.cursor.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/jqPlot/1.0.8/plugins/jqplot.dateAxisRenderer.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/jqPlot/1.0.8/plugins/jqplot.highlighter.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/async/1.5.2/async.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.12.0/lodash.min.js
// @require     http://loungestats.kinsi.me/dl/datepickr_mod.min.js
// @downloadURL http://loungestats.kinsi.me/dl/LoungeStats.user.js
// @updateURL   http://loungestats.kinsi.me/dl/LoungeStats.user.js
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_listValues
// ==/UserScript==

// You are not allowed to share modified versions of this script, or use parts of it without the authors permission
// You are not allowed to sell the whole, or parts of this script
// Copyright belongs to "Kinsi" (user Kinsi55 on reddit, /id/kinsi on steam)

'use strict';

var version = GM_info.script.version;
var newVersion = (GM_getValue('lastversion') != version);

var APP_CSGO = '730';
var APP_DOTA = '570';

/**
 * Helperfunction to zoom the jqPlot
 */
function plot_zomx(plot, minx, maxx) {
	if(!minx){
		plot.replot({ axes: {
			xaxis: {
				min: plot.axes.xaxis.min,
				max: plot.axes.xaxis.max
			},
			yaxis: {
				min: plot.axes.yaxis.min,
				max: plot.axes.yaxis.max
			},
		}});
	}else{
		plot.replot({ axes: {
			xaxis: {
				min: minx,
				max: maxx
			},
			yaxis: {
				min: null,
				max: null
			}
		}});
	}
}

//http://stackoverflow.com/a/6562764/3526458
function clearSelection() {
	if(document.selection) {
		document.selection.empty();
	} else if (window.getSelection) {
		window.getSelection().removeAllRanges();
	}
}

function toggleFullscreen(jqplot) {
	if($('#loungestats_profitgraph').hasClass('fullsc')) {
		$('#loungestats_profitgraph').removeClass('fullsc');
		$('#loungestats_fullscreenbutton').removeClass('fullsc');
	} else {
		$('#loungestats_profitgraph').addClass('fullsc');
		$('#loungestats_fullscreenbutton').addClass('fullsc');
	}
	jqplot.replot();
}

//http://stackoverflow.com/a/5812341/3526458
/**
 * Check if the passed date is formatted validly
 * @param  {String}  s date to check
 * @return {Boolean}   result of the format check
 */
function isValidDate(s) {
	var bits = s.split('.');
	var d = new Date(bits[2], bits[1] - 1, bits[0]);
	return d && (d.getMonth() + 1) == bits[1] && d.getDate() == Number(bits[0]);
}

/**
 * Broken out object for handling currency conversion
 * @type {Object}
 */
var ConversionRateProvider = {
	/**
	 * Convert some price from one currency to another
	 * @param  {Float} amount        amount to convert
	 * @param  {String} to_currency   destination currency requested
	 * @param  {String} from_currency Source currency given, USD if not defined
	 * @return {Float}               converted amount
	 */
	convert: function(amount, to_currency, from_currency){
		if(!this.cache) throw "No prices cached...";
		if(!from_currency) from_currency = "USD";
		if(!this.cache.rates[to_currency]) throw "Unknown destination currency";
		//console.log(amount, to_currency, from_currency, this.cache.rates)
		if(!this.cache.rates[from_currency]) throw "Unknown source currency";

		return amount / this.cache.rates[from_currency] * this.cache.rates[to_currency];
	},
	/**
	 * Get available currencies
	 * @return {Array} Available currencies
	 */
	getAvailableCurrencies: function(){
		if(!this.cache) throw "No prices cached...";

		return Object.keys(this.cache.rates);
	},
	/**
	 * Load the locally cached, or externally refreshed rate DB in and load it into RAM
	 * @param  {Function} callback callback when done
	 */
	init: function(callback){
		this.cache = GM_getValue("convert_fixer");
		if(this.cache) try{
			this.cache = JSON.parse(this.cache);
		}catch(e){ this.cache = null; }

		if(!this.cache || (new Date().getTime() - Number(GM_getValue("fixer_lastload") || 0)) > 259200000){
			$.ajax({
				url: "https://api.fixer.io/latest?base=USD",
				dataType: "json"
			}).done(function(parsed) {
				if(parsed.base === "USD"){
					parsed.rates["USD"] = 1.0;
					GM_setValue("convert_fixer", JSON.stringify(parsed));
					this.cache = parsed;
				}

				if(!this.cache) return callback("Couldnt load exchange rates from fixer..");

				GM_setValue('fixer_lastload', new Date().getTime());

				if(callback) callback();
			}).error(function(){
				if(callback) callback("Couldnt load pricedb from repo..");
			});
		}else{
			this.cache = JSON.parse(GM_getValue("convert_fixer"));
			if(callback) callback();
		}
	}
};

/**
 * Broken out object for handling loading of item prices incase i should add / switch providers in the future
 * @type {Object}
 */
var _PriceProvider = {
	/**
	 * Returns the price out of the cached price database if available
	 * @param  {integer}   appId    app id which this item belongs to
	 * @param  {DateTime}  dateTime time for which the price is requested for
	 * @param  {String}   itemName name of the item wanted
	 * @param  {Function} callback callback function to pipe the price to
	 */
	getPriceFor: function(itemName, dateTime, appId, callback){},
	/**
	 * Returns the prices for the requested items
	 * @param  {Array}   items     Array of Items [itemName, dateTime, appId]
	 * @param  {Function} callback callback function to pipe the price to
	 */
	getPricesFor: function(items, appId, callback, precaching){
		async.map(items, function(itm, cb){
			this.getPriceFor(itm, null, appId, cb);
		}.bind(this), callback);
	},
	/**
	 * Load the items in batches and cache them locally so taht getting the price for them doesnt require a seperate request
	 * @param  {Array}   items     Array of Items [itemName, dateTime(typeof Date)]
	 * @param  {Function} callback callback function to call when the precaching is done
	 */
	precachePricesFor: function(items, callback){callback("This Priceprovider does not support precaching");},
	/**
	 * Load the locally cached, or externally refreshed price DB in and load it into RAM
	 * @param  {Function} callback callback when done
	 */
	init: function(callback){callback()},
	/**
	 * Called upon Application exit. Useful to cache dynamically loaded stuff etc.
	 * @param  {Function} callback Call this when done doing stuff.
	 */
	destroy: function(callback){callback();},
	/**
	 * How many querys per second can you send to this priceprovider?
	 * @type {Number}
	 */
	maxRate: Number.MAX_SAFE_INTEGER,
	/**
	 * What currency does this provider return?
	 * @type {String}
	 */
	returnedCurrency: "USD",
	/**
	 * Does this Priceprovider Support Precaching prices in batches? If so, how many can be precached per request? (0 = Disabled)
	 * @type {Number}
	 */
	supportsPrecaching: 0
};

/**
 * Broken out object for handling loading of item prices incase i should add / switch providers in the future
 * @type {Object}
 */
var PriceProviderFast = _.defaults({
	getPriceFor: function(itemName, dateTime, appId, callback){
		if(!this.cache) return callback("No prices cached...");
		if(!this.cache[appId][itemName]) return callback("Requested item not found");

		var p = parseFloat(this.cache[appId][itemName]) / 100;

		//p = ConversionRateProvider.convert(p, this.destinationCurrency);
		if(callback) callback(null, p);
	},
	init: function(callback){
		this.cache = GM_getValue('pricedb');
		if(this.cache) try{
			this.cache = JSON.parse(this.cache);
		}catch(e){ this.cache = null; }
		//if the cache is older than 48 hours re-load it
		if(!this.cache || (new Date().getTime() - Number(GM_getValue('pricedb_lastload') || 0)) > 518400000){
			//Load latest price database from github and cache it
			$.ajax({
				url: "https://raw.githubusercontent.com/kinsi55/LoungeStats2/master/misc/pricedb.json",
				dataType: "json"
			}).done(function(parsed){
				if(parsed[APP_CSGO] && parsed[APP_DOTA]){
					GM_setValue("pricedb", JSON.stringify(parsed));
					this.cache = parsed;
				}

				if(!this.cache || this.cache.success !== 1) return callback("Couldnt load pricedb from repo..");

				GM_setValue('pricedb_lastload', new Date().getTime());

				if(callback) callback();
			}).error(function(){
				if(callback) callback("Couldnt load pricedb from repo..");
			});
		}else{
			if(callback) callback();
		}
	}
}, _PriceProvider);

/**
 * Broken out object for handling loading of item prices incase i should add / switch providers in the future
 * @type {Object}
 */
var PriceProviderExact = _.defaults({
	getPriceFor: function(itemName, dateTime, appId, callback){
		this.getPricesFor([[itemName, dateTime]], appId, callback);
	},
	getPricesFor: function(items, appId, callback, precaching){
		var price_provider = this,
				callbackValue = {};

		var toCache = _.reject(items, function itemNotCached(item){
			var dt_s = item[1].getFullYear()+"-"+("0"+(item[1].getMonth()+1)).slice(-2)+"-"+("0"+item[1].getDate()).slice(-2);

			var isCached = price_provider.cache && price_provider.cache[appId] && price_provider.cache[appId][item[0]] && price_provider.cache[appId][item[0]][dt_s];

			if(!precaching && !callbackValue[item[0]]) callbackValue[item[0]] = {};

			if(!precaching && isCached) callbackValue[item[0]][dt_s] = price_provider.cache[appId][item[0]][dt_s];

			return !precaching && isCached;
		});

		if(toCache.length) {
			var toCacheNew = {};

			_.each(toCache, function(item){
				var dt_s = item[1].getFullYear()+"-"+("0"+(item[1].getMonth()+1)).slice(-2)+"-"+("0"+item[1].getDate()).slice(-2);

				if(!toCacheNew[dt_s]) toCacheNew[dt_s] = [];

				if(toCacheNew[dt_s].indexOf(item[0]) === -1) toCacheNew[dt_s].push(item[0]);
			});

			var tstart = new Date().getTime();

			GM_xmlhttpRequest({
				method: "POST",
				url: "https://steam.expert/api/items/history/archive",
				data: JSON.stringify( {appid: appId, items: toCacheNew} ),
				headers: {
					"User-Agent": "LoungeStats2/"+version,
					"Content-Type": "application/json"
				},
				onload: function(response){

					if(!response.responseText || response.status != 200) return callback("Failed to load Price from API (API Error)");

					var parsed = JSON.parse(response.responseText);

					if(!parsed.items && !parsed.data) return callback("Failed to load Price from API (API Error)");

					tstart = new Date().getTime() - tstart;

					//response = {items: {"YYYY-MM-01": {"Item 1": 42.00, "Item 2": 12.00}, "YYYY-MM-02": {"Item 1": 42.00, "Item 2": 12.00}}}

					_.forIn(parsed.items || parsed.data, function(api_items_for_date, api_date){
						_.forIn(api_items_for_date, function(api_price, api_item){
							if(!price_provider.cache[appId][api_item]) price_provider.cache[appId][api_item] = {};
							if(!precaching && !callbackValue[api_item]) callbackValue[api_item] = {};

							api_price = parseFloat(api_price) || 0.06;

							price_provider.cache[appId][api_item][api_date] = api_price;

							if(!precaching) callbackValue[api_item][api_date] = api_price;
						});
					});

					if(tstart > 1000 / price_provider.maxRate){
						callback(null, callbackValue);
					}else{
						setTimeout(callback, (1000 / price_provider.maxRate) - tstart, null, callbackValue);
					}
				},
				onerror: function() {
					if(callback) callback("Failed to load Price from API (HTTP Error)");
				}
			});
		}else{
			callback(null, callbackValue);
		}
	},
	precachePricesFor: function(items, appId, callback){
		var price_provider = this;
		async.eachSeries(_.chunk(items, this.supportsPrecaching), function(itemsChunk, cb) {
			async.retry({times: 5, interval: 500}, function(cb2){
				price_provider.getPricesFor(itemsChunk, appId, cb2, true);
			}, cb);
		}, function(err){
			callback(err);
		});
	},
	init: function(callback){
		this.cache = GM_getValue("pricecache_exact");
		if(this.cache) try{
			this.cache = JSON.parse(this.cache);
		}catch(e){}

		if(!this.cache || !this.cache["730"]) this.cache = {'570': {}, '730': {}};

		callback();
	},
	destroy: function(callback){
		try{
			GM_setValue('pricecache_exact', JSON.stringify(this.cache));
		}catch(e){}
		if(callback) callback();
	},
	maxRate: 6,
	supportsPrecaching: 1000
}, _PriceProvider);

var availablePriceProviders = {"Fast": {interface: PriceProviderFast, description: "Uses recent prices for any bet, even those made in the past"},
															 "Exact": {interface: PriceProviderExact, description: "Gets historical prices for items from the time they were bet. Takes longer to load but is way more accurate."}};

var PriceProvider = availablePriceProviders.Exact.interface;

/**
 * Helperclass holding a Steam Item
 * @param {String} itemFullName full IEcon name
 * @param {integer} appid        app id this item is associated to
 */
var SteamItem = function(itemFullName, appid){
	this.name = itemFullName;
	this.appid = appid;
};

/**
 * Get the price of this item in USD
 * @param  {DateTime}   dateTime time for which the price is requested for
 * @param  {Function} callback function to return the price to
 */
SteamItem.prototype.getPrice = function(dateTime, callback){
	PriceProvider.getPriceFor(this.name, dateTime, this.appid, callback);
};

/**
 * Class containing most of the stuff related to CSGO/DOTA2 Lounge
 * @type {Object}
 */
var LoungeClass = function(){};

/**
 * App id used in the current site
 * @type {String}
 */
LoungeClass.prototype.currentAppid = window.location.hostname == 'dota2lounge.com' ? APP_DOTA : APP_CSGO;

/**
 * Account Steamid64 of the current logged in user
 * @type {String}
 */
LoungeClass.prototype.currentAccountId = $('#profile .full:last-child input').val().split('=').pop();

/**
 * Class to parse all informations from a bet in the bet history
 * @param  {jQuery element} betRowJq   information row from the history table
 * @param  {jQuery element} betItemsJq row with the bet items
 * @param  {jQuery element} wonItemsJq row with the won items
 */
LoungeClass.prototype.betHistoryEntry = function(betRowJq, betItemsJq, wonItemsJq, appId){
	//Map bet item Row to all contained Item names
	var filterForItems = function(toFilter){
		return toFilter
		.find('div > div.name > b:first-child').get()
		.map(function(e){
			return new SteamItem(e.textContent.trim(), appId);
		});
	};

	if(betItemsJq !== undefined){
		betItemsJq      = filterForItems(betItemsJq);
		wonItemsJq      = filterForItems(wonItemsJq);

		this.matchId    = parseInt(betRowJq.children()[2].children[0].href.split('=').pop());
		this.betDate    = new Date(Date.parse(betRowJq.children()[6].textContent.replace(/-/g,' ') + ' +0'));
		this.items      = {bet: betItemsJq, won: wonItemsJq, lost: []};

		this.teams      = [betRowJq.children()[2].children[0].textContent, betRowJq.children()[4].children[0].textContent];
		this.winner     = (betRowJq.children()[4].style.fontWeight == 'bold')+0;

		this.betoutcome = betRowJq.children()[1].children[0].classList[0] || 'draw';

		if(wonItemsJq.length > 0){
			this.betoutcome = 'won'; // http://redd.it/3edctm
		}else if(['won', 'draw'].indexOf(this.betoutcome) === -1){
			//Match neither won or drawn? Its gotta be a loss..
			this.items.lost = betItemsJq;
		}
	}
};

/**
 * Load the bet history from Lounge and process the returned html
 * @param  {Function} callback callback for the loaded data
 */
LoungeClass.prototype.getBetHistory = function(callback) {
	var betData, archivedBetData, parsedBetdata = {};
	//Load bet history, and archive asynchronously
	$.when(
		$.get('/ajax/betHistory.php',         function(data){betData = data;}),
		$.get('/ajax/betHistoryArchives.php', function(data){archivedBetData = data;})
	).then(function(){
		if(!betData || !archivedBetData || betData.indexOf('<tbody>') == -1 || archivedBetData.indexOf('<tbody>') == -1){
			callback('Failed to load either betHistory or archivedBetHistory (Itemdraft possibly in progress?)', null);
		}else{
			//"Concat" both html Tables, parse it w/ jQuery, get every tablerow
			var preParsedBetdata = $(betData.split('</tbody>')[0]+archivedBetData.split('<tbody>')[1]).find('tr');

			//Iterate bets from the end so oldest bets are first, step = 2 since theres always a row with bet info, then the won items, then the lost items, so 3 rows per bet
			for(var i = preParsedBetdata.length-3; i >= 0; i -= 3){
				var bhistoryentry = new this.betHistoryEntry($(preParsedBetdata[i]), $(preParsedBetdata[i + 1]), $(preParsedBetdata[i + 2]), this.currentAppid);
				parsedBetdata[bhistoryentry.matchId] = bhistoryentry;
			}

			callback(null, parsedBetdata);

			this.betHistory = parsedBetdata;
		}
	}.bind(this));
};

/**
 * Main class containing most of the features
 * @type {Object}
 */
var LoungeStatsClass = function(){
	this.Lounge = new LoungeClass();

	/**
	 * Wrapper / helper Class for handling LoungeStats' settings
	 * @param {String} name    name of the setting
	 * @param {Boolean} json    Is the internally handled value an Object (JSON)?
	 * @param {String} fieldid ID of the Field in the settings to auto populate / read from
	 */
	var Setting = function(name, json, fieldid){
		this.json = json === true;
		this.name = name;
		this.fieldid = fieldid || json;
		if(this.fieldid === this.json) this.fieldid = undefined;

		this._val = GM_getValue('setting_'+this.name);

		if(this._val && this.json) this._val = JSON.parse(this._val);
	};

	Setting.prototype = {
		/**
		 * Get the currently set value of this setting
		 * @return setting value
		 */
		get value(){
			return this._val;
		},
		/**
		 * Set the value of the setting and save it
		 * @param newValue Object / String to save
		 */
		set value(newValue){
			this._val = newValue;
			if(!this.json) GM_setValue('setting_'+this.name, this._val);
			if(this.json) GM_setValue('setting_'+this.name, JSON.stringify(this._val));
		},
		populateFormField: function(){
			if(this.fieldid && !this.json && this._val) $('.loungestatsSetting#'+this.name).val(this._val);
		},
	};

	/**
	 * Predefined settings
	 * @type {Object}
	 */
	this.Settings = {
		method: new Setting('method', 'method'),
		currency: new Setting('currency', 'currency'),
		bvalue: new Setting('bvalue', 'bvalue'),
		xaxis: new Setting('xaxis', 'xaxis'),
		debug: new Setting('debug', 'debug'),
		beforedate: new Setting('beforedate', 'beforedate'),
		domerge: new Setting('domerge', 'domerge'),
		hideclosed: new Setting('hideclosed', 'hideclosed'),
		lastversion: new Setting('lastversion'),
		accounts: new Setting('accounts', true)
	};

	/**
	 * Helperfunction called when pressing the save button in the settings window
	 * to also save custom stuff like multiaccount settings etc.
	 */
	this.Settings.save = function(){
		$(".loungestatsSetting").each(function(i, setting){
			this.Settings[setting.id].value = setting.value;
		}.bind(this));

		if(isValidDate($('#beforedate').val())){
			this.Settings.beforedate.value = $('#beforedate').val();
		} else {
			alert('The format of the given date is invalid! Use Day.Month.Year!');
			return;
		}

		var x = this.Settings.accounts.value;
		x.active[this.Lounge.currentAppid] = $("#loungestats_mergepicks input:checked").map(function(){return $(this).attr("name")}).toArray();
		this.Settings.accounts.value = x;

		this.Settings.close();
	}.bind(this);

	/**
	 * Helperfunction called to open the settingswindow and pouplate its fields
	 */
	this.Settings.show = function(){
		for(var key in this.Settings){
			if(!(this.Settings[key] instanceof Setting)) continue;
			this.Settings[key].populateFormField();
		}

		var multiaccthing = '<div>' + (this.Lounge.currentAppid == APP_CSGO ? 'CS:GO' : 'DotA') + ' Accounts</div>';

		for(var i in this.Settings.accounts.value.available[this.Lounge.currentAppid]) {
			var sett_is_checked = this.Settings.accounts.value.active[this.Lounge.currentAppid].indexOf(i) != -1 ? 'checked' : '';

			multiaccthing += '<input type="checkbox" name="'+i+'" '+sett_is_checked+'> "<a href="http://steamcommunity.com/profiles/'+i+'" target="_blank">'+Object.keys(this.getCachedBetHistory(i)).length+' bets cached</a>"<br/>';
		}
		$('#loungestats_mergepicks').html(multiaccthing);

		$('#loungestats_overlay').fadeIn(500);
	}.bind(this);

	/**
	 * Helperfunction called to close the settingswindow
	 */
	this.Settings.close = function(){
		$('#loungestats_overlay').fadeOut(500);
	};
};

LoungeStatsClass.prototype = {
	/**
	 * Initiate Loungestats, set basic DOM content, initiate handlers, etc.
	 * @param  {Function} callback callback to call
	 */
	init: function(callback){
		$('section:nth-child(2) div.box-shiny').append('<a id="loungestats_tabbutton" class="button">LoungeStats</a>');
		GM_addStyle('.jqplot-highlighter-tooltip {background-color: #393938; border: 1px solid gray; padding: 5px; color: #ccc} \
								 .jqplot-xaxis {margin-top: 5px; font-size: 12px} \
								 .jqplot-yaxis {margin-right: 5px; width: 55px; font-size: 12px} \
								 .jqplot-yaxis-tick {text-align: right; width: 100vw} \
								 #loungestats_overlay {z-index: 9002; display: none; top: 0px; left: 0px; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.4); position: fixed} \
								 #loungestats_settings_title {text-align: center; font-size: 12px; height: 40px; border: 2px solid #DDD; border-top: none; background-color: #EEE; width: 100%; margin-top: -10px; -webkit-border-radius: 0 0 5px 5px; border-radius: 0 0 5px 5px; padding: 10px 5px 0 5px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box;} \
								 #loungestats_settingswindow {font-size: 13px; z-index: 9001; padding: 10px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; position: relative; background-color: white; left: 50%; top: 50%; width: 300px; margin-left: -151px; height: 430px; margin-top: -216px; -webkit-border-radius: 5px; border-radius: 5px; -webkit-box-shadow: 0 0 10px -5px #000; box-shadow: 0 0 10px -5px #000; border: 1px solid gray; overflow: hidden;-webkit-transition: all 250ms ease-in-out;-moz-transition: all 250ms ease-in-out;-ms-transition: all 250ms ease-in-out;-o-transition: all 250ms ease-in-out;transition: all 250ms ease-in-out;} \
								 #loungestats_settingswindow.accounts {width: 500px; margin-left: -251px;} \
								 #loungestats_settings_leftpanel select, #loungestats_settings_leftpanel input{margin: 3px 0; width: 100%; height: 22px !important; padding: 0;} \
								 #loungestats_settings_leftpanel input{width: 274px;} \
								 #loungestats_fullscreenbutton{margin-right: 29px !important; margin-top: -5px !important; height: 14px; z-index: 9001; position: relative;} \
								 #loungestats_fullscreenbutton.fullsc{position: fixed;margin: 0 !important;right: 34px; top: -5px;} \
								 #loungestats_profitgraph{position: relative; height: 400px; clear: left; z-index: 9001;} \
								 #loungestats_profitgraph.fullsc{background-color: #DDD;height: 100vh !important;left: 0;margin: 0;position: fixed !important;top: 0;width: 100vw;} \
								 #loungestats_settings_leftpanel{width: 278px; float: left;} \
								 #loungestats_settings_rightpanel{width: 188px; float: left; margin-left: 11px;} \
								 #loungestats_settings_panelcontainer{width: 500px;} \
								 #loungestats_datacontainer{position: relative;clear: both;} \
								 .jqplot-highlighter-tooltip{z-index: 8999;} \
								 #loungestats_updateinfo{text-align: center;} \
								 #loungestats_mergepicks{border:2px solid #ccc; height: 100px; overflow-y: scroll; height: 258px; padding: 5px;-moz-box-sizing: border-box;-webkit-box-sizing: border-box;box-sizing: border-box;} \
								 #loungestats_mergepicks div:first-child{font-weight: bold;} \
								 #loungestats_mergepicks input{height: 20px !important; vertical-align: middle;} \
								 #loungestats_datecontainer{position: relative;} \
								 #loungestats_stats_text a{color: blue;} \
								 .hideuntilready{display: none !important;}');

		GM_addStyle('.calendar {top: 5px !important; left: 108px !important; font-family: \'Trebuchet MS\', Tahoma, Verdana, Arial, sans-serif !important;font-size: 0.9em !important;background-color: #EEE !important;color: #333 !important;border: 1px solid #DDD !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;padding: 0.2em !important;width: 14em !important;}.calendar .months {background-color: #F6AF3A !important;border: 1px solid #E78F08 !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;color: #FFF !important;padding: 0.2em !important;text-align: center !important;}.calendar .prev-month,.calendar .next-month {padding: 0 !important;}.calendar .prev-month {float: left !important;}.calendar .next-month {float: right !important;}.calendar .current-month {margin: 0 auto !important;}.calendar .months .prev-month,.calendar .months .next-month {color: #FFF !important;text-decoration: none !important;padding: 0 0.4em !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;cursor: pointer !important;}.calendar .months .prev-month:hover,.calendar .months .next-month:hover {background-color: #FDF5CE !important;color: #C77405 !important;}.calendar table {border-collapse: collapse !important;padding: 0 !important;font-size: 0.8em !important;width: 100% !important;}.calendar th {text-align: center !important; color: black !important;}.calendar td {text-align: right !important;padding: 1px !important;width: 14.3% !important;}.calendar tr{border: none !important; background: none !important;}.calendar td span {display: block !important;color: #1C94C4 !important;background-color: #F6F6F6 !important;border: 1px solid #CCC !important;text-decoration: none !important;padding: 0.2em !important;cursor: pointer !important;}.calendar td span:hover {color: #C77405 !important;background-color: #FDF5CE !important;border: 1px solid #FBCB09 !important;}.calendar td.today span {background-color: #FFF0A5 !important;border: 1px solid #FED22F !important;color: #363636 !important;}');

		$('body').append('<div id="loungestats_overlay"> \
			<div id="loungestats_settingswindow"'+((this.Settings.domerge.value == '1') ? ' class="accounts"' : '')+'> \
				<div id="loungestats_settings_title">Loungestats '+version+' Settings | by <a href="http://reddit.com/u/kinsi55">/u/kinsi55</a><br><br></div> \
				<div id="loungestats_settings_panelcontainer"> \
					<div id="loungestats_settings_leftpanel"> \
						Pricing accuracy <a class="info">?<p class="infobox"><br>Fastest: Use current item prices for all bets<br><br>Most accurate: Use item prices at approximately the time of the bet, as little delay as possible between requests<br><br>Most accurate & safest: Same as Most accurate, but with a bit more delay between requests</p></a>:<br> \
						<select class="loungestatsSetting" id="method"></select><br> \
						Currency:<br> \
						<select class="loungestatsSetting" id="currency"></select><br> \
						Show bet value graph:<br> \
						<select class="loungestatsSetting" id="bvalue"> \
							<option value="1">Yes</option> \
							<option value="0">No</option> \
						</select><br> \
						Merge Accounts:<br> \
						<select class="loungestatsSetting" id="domerge"> \
							<option value="0">No</option> \
							<option value="1">Yes</option> \
						</select><br> \
						Exclude bets before <a class="info">?<p class="infobox"><br>Any bet that happened before the given date will be excluded. To disable this just pick any date before you started betting(e.g. set the year to 2000 or something)</p></a>:<br> \
						<div id="loungestats_datecontainer"> \
							<input class="loungestatsSetting" id="beforedate" value="01.01.2000"><br> \
						</div> \
						X-Axis:<br> \
						<select class="loungestatsSetting" id="xaxis"> \
							<option value="0">Date</option> \
							<option value="1">Incrementing</option> \
						</select><br> \
						Dont show Closed bets:<br> \
						<select class="loungestatsSetting" id="hideclosed"> \
							<option value="0">No</option> \
							<option value="1">Yes</option> \
						</select><br> \
						Debug mode:<br> \
						<select class="loungestatsSetting" id="debug"> \
							<option value="0">Off</option> \
							<option value="1">On</option> \
						</select><br> \
					</div> \
					<div id="loungestats_settings_rightpanel"> \
						Accounts to merge <a class="info">?<p class="infobox"><br>Since you chose to merge accounts, select all acounts you want to be merged in the graph(The current one is NOT automatically included!)</p></a>:<br> \
						<div id="loungestats_mergepicks"></div> \
					</div> \
				</div> \
				<div style="position: absolute; bottom: 10px;"> \
					<a id="loungestats_settings_save" class="button">Save</a> \
					<a id="loungestats_settings_close" class="button">Close</a> \
				</div> \
			</div> \
		</div>');

		//Populate currencies field
		$('select#currency').html(ConversionRateProvider.getAvailableCurrencies().reduce(function(pv, cv){
			return pv + '<option value="'+ cv +'">'+ cv +'</option>';
		}, ""));

		$('select#method').html(_.transform(availablePriceProviders,
			function(res, v, k){
				res.push('<option value="'+ k +'">' + k + ' (' + v.description + ')</option>');
			}, []
		).join(""));

		var domergesett = $('.loungestatsSetting#domerge'),
				ls_settingswindow = $('#loungestats_settingswindow');

		domergesett.change(function() {
			ls_settingswindow.toggleClass('accounts', domergesett.val() == 1);
		});

		new datepickr('beforedate', {dateFormat: 'd.m.Y'});

		$('.calendar').detach().appendTo('#loungestats_datecontainer');

		$('#loungestats_tabbutton').click(this.loadStats);
		$('#loungestats_overlay, #loungestats_settings_close').click(this.Settings.close);
		$('#loungestats_settings_save').click(this.Settings.save);
		ls_settingswindow.find('#loungestats_beforedate, .calendar').click(function(e) {e.stopPropagation();});
		ls_settingswindow.click(function(e) {e.stopPropagation(); $('.calendar').css('display', 'none');});

		//Predefine settings on first load
		if(!this.Settings.accounts.value) this.Settings.accounts.value = {available: {'570': {}, '730': {}},
																																			active:    {'570': [], '730': []}};

		$(document).on('click', 'a#loungestats_settingsbutton', this.Settings.show);

		/*var availablePriceProviders = {"Fast": {interface: PriceProviderFast, description: "Uses recent prices for any bet, even those made in the past"},
															 "Exact": {interface: PriceProviderExact, description: "Gets historical prices for items from the time they were bet. Takes longer to load but is way more accurate."}}*/

		PriceProvider = availablePriceProviders[this.Settings.method.value].interface;

		callback();
	},
	/**
	 * Helperfunction called to cache the bet history for the currently logged in account
	 * to make it availalbe for multi-account usage
	 * @param  {Object} betHistory Object with the bethistory
	 */
	cacheBetHistory: function(betHistory){
		var x = this.Settings.accounts.value;

		x.available[this.Lounge.currentAppid][this.Lounge.currentAccountId] = betHistory;

		this.Settings.accounts.value = x;
	},
	/**
	 * Get the previously cached bet history for the defined account
	 * @param  {String} requestedAccount Account to get the bet history for, defaults to the currently logged in one
	 * @return {Object}                  Object with the bethistory
	 */
	getCachedBetHistory: function(requestedAccount){
		if(!requestedAccount) requestedAccount = this.Lounge.currentAccountId;
		var h = this.Settings.accounts.value.available[this.Lounge.currentAppid][requestedAccount];

		//console.log(requestedAccount, h);

		_.each(Object.keys(h), function(key){
			if(Object.setPrototypeOf){
				Object.setPrototypeOf(h[key], LoungeClass.prototype.betHistoryEntry.prototype)
			}else{
				h[key].__proto__ = LoungeClass.prototype.betHistoryEntry.prototype;
			}

			h[key].betDate = new Date(Date.parse(h[key].betDate));

			h[key].items.won = h[key].items.won.map(function(i){return new SteamItem(i.name, i.appid);});
			h[key].items.bet = h[key].items.bet.map(function(i){return new SteamItem(i.name, i.appid);});
			h[key].items.lost = h[key].items.lost.map(function(i){return new SteamItem(i.name, i.appid);});
		});

		//console.log(h);

		return h;
	}
};

var LoungeStats = new LoungeStatsClass();

LoungeStats.loadStats = function(){
	if(!LoungeStats.Settings.method.value){
		$('#ajaxCont').html('Please set up Loungestats first');
		return LoungeStats.Settings.show();
	}

	$(window).off('resize');

	$('#ajaxCont').html('<a id="loungestats_settingsbutton" class="button">LoungeStats Settings</a> \
		<a class="button" target="_blank" href="https://steamcommunity.com/tradeoffer/new/?partner=33309635&token=H0lCbkY3">Donate ♥</a> \
												<a class="button" target="_blank" href="https://reddit.com/r/LoungeStats">Subreddit</a> \
												<a id="loungestats_resetzoombutton" class="button hideuntilready">Reset Zoom</a> \
												<a id="loungestats_screenshotbutton" class="button hideuntilready">Screenshot</a> \
												<a id="loungestats_csvexport" class="button hideuntilready">Export CSV (Excel)</a> \
												<br><hr><br> \
												<div id="loungestats_datacontainer"> \
													<img src="/img/load.gif" id="loading" style="margin: 0.75em 2%"> \
												</div>');

	if(newVersion) {
		GM_setValue('lastversion', version);
		$('#ajaxCont').prepend('<div id="loungestats_updateinfo" class="bpheader">LoungeStats was updated to ' + version + '!<br/>Please make sure to check <a href="http://reddit.com/r/loungestats">the subreddit</a> to see what changes were made!</div>');
	}

	$('#loungestats_settingsbutton').click(LoungeStats.Settings.show);

	LoungeStats.Lounge.getBetHistory(function(err, bets){
		if(err){
			return $('#ajaxCont').html(err);

			//Possibly use cached history if loading live data failed?
			//LoungeStats.getCachedBetHistory(acc)
		}

		LoungeStats.cacheBetHistory(bets);

		if(LoungeStats.Settings.domerge.value == "1"){
			var useaccs = LoungeStats.Settings.accounts.value.active[LoungeStats.Lounge.currentAppid];

			//Go trough each account requested to merge
			_.each(useaccs, function(acc){
				//Do not merge if the proposed to-merge account is the currently logged in one
				if(acc == LoungeStats.Lounge.currentAccountId) return;
				//get all bets for that acount, using lodash here to be sync instead of async
				_.forIn(LoungeStats.getCachedBetHistory(acc), function(key, value) {
					//If no bet was placed on a game for the current account lets just use the one from the other acc merged
					if(!bets[key]) {
						bets[key] = value;
					} else {
						bets[key].items.bet = bets[key].items.bet.concat(value.items.bet);
						bets[key].items.won = bets[key].items.won.concat(value.items.won);
						bets[key].items.lost = bets[key].items.lost.concat(value.items.lost);
					}
				});
			});
		}

		var betsKeys = Object.keys(bets).sort(function(a, b){return bets[a].betDate - bets[b].betDate;});

		async.series([
		function precachePrices(callback){
			if(PriceProvider.supportsPrecaching){
				var toPrecache = [];

				_.each(betsKeys, function(bet){
					bet = bets[bet];
					var toLoad = bet.items.won.concat(bet.items.lost).concat(bet.items.bet);

					_.each(toLoad, function(item){
						toPrecache.push([item.name, bet.betDate]);
					});
				});

				toPrecache = _.uniq(toPrecache, function(n){return n[0] + n[1]});

				PriceProvider.precachePricesFor(toPrecache, LoungeStats.Lounge.currentAppid, callback);
			}else callback();
		}, function processBets(callback){
			//calculate streaks, stats, ...

			var overallValue = 0.0,
					overallWon = 0.0,
					overallLoss = 0.0,
					overallWonCount = 0,
					overallLostCount = 0,
					biggestwin = 0.0,
					biggestwinid = 0,
					biggestloss = 0.0,
					biggestlossid = 0,
					// Temp variables used for finding winstreaks / loss streaks etc
					winstreakstart = 0, winstreaktemp = 0, winstreaklast = 0,
					losestreakstart = 0, losestreaktemp = 0, losestreaklast = 0,
					previousBetResult = null,
					chartData = [],
					betData = [],

					absoluteIndex = 0;

			if(!betsKeys.length) return $('#loungestats_datacontainer').html('Looks like you dont have any bets with the set criteria');

			var firstDate = bets[betsKeys[0]].betDate.getTime(),
					firstDateLo = firstDate * 0.9999,
					lastDate = bets[betsKeys[betsKeys.length - 1]].betDate.getTime(),
					lastDateHi = lastDate * 1.0001;

			var GameProgress = 0;

			async.eachSeries(betsKeys, function(key, betsKeysEachCallback) {
				$('#loungestats_datacontainer').html("Loading Infos for Bet " + (++GameProgress) + " of " + betsKeys.length);

				var bet = bets[key],
						betValue = 0.0,
						betChangeDelta = 0.0,
						wonValue = 0.0,
						lostValue = 0.0,
						teamString = '',
						// If you bet with two accounts, one lost, one won i need to use this variable
						// to 'override' if you won or lost according to actual won / lost value
						mergedWinOverride = false,
						// Bet was either won, or lost
						matchNotClose = ['won', 'lost'].indexOf(bet.betoutcome) !== -1,
						dt_s = bet.betDate.getFullYear()+"-"+("0"+(bet.betDate.getMonth()+1)).slice(-2)+"-"+("0"+bet.betDate.getDate()).slice(-2);

				if(matchNotClose) {
					// Winner = 0, !0 = 1. Relieing on Lounge to be relieable here.. +0 to cast String to Integer
					teamString = '<b>'+bet.teams[bet.winner]+'</b> vs. '+bet.teams[!bet.winner+0];
					if(teamString == '<b></b> vs. ') teamString = 'Prediction';
				} else {
					teamString = bet.teams.join(' vs. ');
				}

				var toLoad = bet.items.won.concat(bet.items.lost).concat(bet.items.bet);

				toLoad = toLoad.map(function injectBetDateToitems(item){
					return [item.name, bet.betDate];
				});

				async.retry({times: 5, interval: 500}, function(cb){
					PriceProvider.getPricesFor(toLoad, LoungeStats.Lounge.currentAppid, function(e, a){
						console.log(e, a);
						cb(e,a);
					});
				}, function processPricesReply(err, prices){
					//Price loaded fine? Add the price to the relevant variable
					if(!err){
						/////////////////////////////////

						_.each(["bet", "won", "lost"], function(key){
							var value = bet.items[key];

							if(value) _.each(value, function(item){
								var price = prices[item.name][dt_s];

								var val = ConversionRateProvider.convert(price, LoungeStats.Settings.currency.value, PriceProvider.returnedCurrency);
								if(key == "bet")       {betValue += val;}
								else if (key == "won") {wonValue += val;}
								else if (key == "lost"){lostValue += val;}
							});
						});

						overallWon += wonValue;
						overallLoss += lostValue;
						betChangeDelta = wonValue - lostValue;
						overallValue += betChangeDelta;

						mergedWinOverride = (betChangeDelta >= 0);
						var betChangeDelta_s = betChangeDelta.toFixed(2);

						if(previousBetResult != mergedWinOverride && matchNotClose){
							winstreaktemp = losestreaktemp = 0;
							previousBetResult = mergedWinOverride;
						}

						if(matchNotClose) if(mergedWinOverride) {
							if(betChangeDelta > biggestwin) {
								biggestwin = betChangeDelta;
								biggestwinid = bet.matchId;
							}
							winstreaktemp++;
							overallWonCount++;
							if(winstreaktemp > winstreaklast) {
								winstreakstart = absoluteIndex - (winstreaktemp - 1);
								winstreaklast = winstreaktemp;
							}
							betChangeDelta = '+'+betChangeDelta.toFixed(2);
						}else{
							//loss
							if(betChangeDelta * -1 > biggestloss) {
								biggestloss = betChangeDelta * -1;
								biggestlossid = bet.matchId;
							}

							losestreaktemp++;
							overallLostCount++;
							if(losestreaktemp > losestreaklast) {
								losestreakstart = absoluteIndex - (losestreaktemp-1);
								losestreaklast = losestreaktemp;
							}
							betChangeDelta = betChangeDelta.toFixed(2);
						}

						chartData.push([LoungeStats.Settings.xaxis.value == '0' ? bet.betDate : absoluteIndex, parseFloat(overallValue.toFixed(2)), betValue, betChangeDelta, teamString, betChangeDelta_s]);
						if(LoungeStats.Settings.bvalue.value == '1') betData.push([LoungeStats.Settings.xaxis.value == '0' ? bet.betDate : absoluteIndex, betValue, teamString]);
						absoluteIndex++;
						betsKeysEachCallback();

					}else{
						return $('#loungestats_datacontainer').html('An error occoured while attempting to load prices for some items. Please try again later');
					}
				}); //End async.retry
			}, function BetsProcessedGenerateStats(err){
				PriceProvider.destroy();

				//Generate DOM content

				$('#loungestats_datacontainer').empty();
				$('#loungestats_datacontainer').append('<a id="loungestats_fullscreenbutton" class="button">Toggle Fullscreen</a><div id="loungestats_profitgraph" class="jqplot-target"></div>');

				var boundary = parseInt(absoluteIndex * 0.05); if(boundary === 0) boundary = 1;

				var xaxis_def = LoungeStats.Settings.xaxis.value == '0' ? {renderer:$.jqplot.DateAxisRenderer,tickOptions: {formatString: '%d %b %y'}, min: firstDateLo,maxx: lastDateHi} : {renderer: $.jqplot.LinearAxisRenderer, tickOptions: {formatString: '%i'}};

				var plot = $.jqplot('loungestats_profitgraph', [chartData, betData], {
					title: {text: 'Overall profit over time'},
					gridPadding: {left: 55, right: 35, top: 25, bottom: 25},
					axesDefaults: {showTickMarks:false},
					axes:{
						xaxis: xaxis_def,
						yaxis: {
							pad: 1,
							tickOptions:{formatString: '%0.2f ' + LoungeStats.Settings.currency.value, labelPosition: 'end', tooltipLocation: 'sw'}
						}
					},
					canvasOverlay: {show: true},
					grid: {gridLineColor: '#414141', borderColor: '#414141', background: '#373737'},
					cursor: {show: true, zoom: true, showTooltip: false},
					highlighter: {show: true, tooltipOffset: 20, fadeTooltip: true, yvalues: 4},
					series:[{lineWidth: 2, markerOptions: {show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Overall Profit: %s<br>Value bet: %s<br>Value change: %s ' + LoungeStats.Settings.currency.value + '<br>Game: %s'}},
									{lineWidth: 1, markerOptions: {show: false, style:'circle'}, highlighter: {formatString: '<strong>%s</strong><br>Value bet: %s<br>Game: %s'}}],
					seriesColors: ['#FF8A00', '#008A00']
				});

				$('#loungestats_profitgraph').bind('jqplotDataClick',
					function (ev, seriesIndex, pointIndex) {
						window.open('/match?m='+betsKeys[pointIndex], '_blank');
					}
				);

				$('#loungestats_profitgraph').bind('jqplotDataMouseOver', function () {
					$('.jqplot-event-canvas').css('cursor', 'pointer');
				});

				$('#loungestats_profitgraph').on('jqplotDataUnhighlight', function() {
					$('.jqplot-event-canvas').css('cursor', 'crosshair');
				});

				if(LoungeStats.Settings.xaxis.value == '0') {
					$('#loungestats_profitgraph').dblclick(function() {plot_zomx(plot, firstDateLo, lastDateHi); clearSelection();});
					$('#loungestats_resetzoombutton').click(function() {plot_zomx(plot, firstDateLo, lastDateHi);});
				}else{
					//with the linearaxisrenderer, i cant pre-set minx, and maxx, lol.
					plot_zomx(plot, -boundary, absoluteIndex+boundary);
					$('#loungestats_profitgraph').dblclick(function() {plot_zomx(plot, -boundary, absoluteIndex+boundary); clearSelection();});
					$('#loungestats_resetzoombutton').click(function() {plot_zomx(plot, -boundary, absoluteIndex+boundary);});
				}

				$('#loungestats_fullscreenbutton').click(function() {toggleFullscreen(plot);plot_zomx(plot);});
				$('.hideuntilready').removeClass("hideuntilready");

				$(window).on('resize', function() {plot.replot();});

				$('#loungestats_datacontainer').append('<div id="loungestats_stats_text"></div>');

				$('#loungestats_stats_text').append('<hr>Overall value of items won: ' + overallWon.toFixed(2) + ' ' + LoungeStats.Settings.currency.value);
				$('#loungestats_stats_text').append('<br>Overall value of items lost: ' + overallLoss.toFixed(2) + ' ' + LoungeStats.Settings.currency.value);
				$('#loungestats_stats_text').append('<br>Overall won bets: ' + overallWonCount + '/' + parseInt(overallWonCount + overallLostCount) + ' (' + parseInt(100/parseInt(overallWonCount + overallLostCount)*parseInt(overallWonCount)) + '%) <a class="info">?<p class="infobox">Draws / closed matches are not counted into this, only losses & wins are counted in this stat</p></a>');
				$('#loungestats_stats_text').append('<br>Net value: ' + overallValue.toFixed(2) + ' ' + LoungeStats.Settings.currency.value);
				$('#loungestats_stats_text').append('<br>Highest win: ' + biggestwin.toFixed(2) + ' ' + LoungeStats.Settings.currency.value + '<a href="/match?m=' + biggestwinid + '"> (Match link)</a>');
				$('#loungestats_stats_text').append('<br>Highest loss: ' + biggestloss.toFixed(2) + ' ' + LoungeStats.Settings.currency.value + '<a href="/match?m=' + biggestlossid + '"> (Match link)</a>');
				$('#loungestats_stats_text').append('<br>Longest losing streak: ' + losestreaklast + '<a id="loungestats_zoonon_lls" href="javascript:void(0)"> (Show on plot)</a>');
				$('#loungestats_stats_text').append('<br>Longest winning streak: ' + winstreaklast + '<a id="loungestats_zoonon_lws" href="javascript:void(0)"> (Show on plot)</a>');

				$('#loungestats_zoonon_lws').click(function() {
					plot_zomx(plot,chartData[winstreakstart][0],chartData[winstreakstart+winstreaklast][0]);
				}).removeAttr('id');
				$('#loungestats_zoonon_lls').click(function() {
					plot_zomx(plot,chartData[losestreakstart][0],chartData[losestreakstart+losestreaklast][0]);
				}).removeAttr('id');

				//TODO break out into classes / functions
				/*$('#loungestats_csvexport').click(function(){
					var useaccs = (!setting_domerge || setting_domerge == '0') ? [user_steam64] : accounts.active[app_id];
					var d = new Date();
					var csvContent = 'data:application/csv; charset=charset=iso-8859-1, Users represented in Export(SteamID64):;="' + useaccs.join(', ') + '"\n \
														Time of Export:;' + d.getUTCDate() + '-' + d.getUTCMonth() + '-' + d.getUTCFullYear() + ' ' + d.getUTCHours() + ':' + d.getUTCMinutes() + '\n \
														Currency:;'+currencyText+'\n \
														Bet Data:\n \
														Game;Date;Match ID;Bet Outcome;Bet Value;Value Change;Overall Profit;Bet Items;Won Items;Lost Items\n';
					for(var i in betsKeys) {
						var b = bets[betsKeys[i]];
						var c = chartData[i];
						var betdate = b.date;
						csvContent += c[4].replace('<b>','[').replace('</b>',']') +';'+ b.date +';'+ b.matchid +';'+ b.matchoutcome +';'+ forceExcelDecimal(c[2],true) +';'+ forceExcelDecimal(c[5],true) +';'+ forceExcelDecimal(c[1],true) +';'+ b.items.bet.join(', ') +';'+ b.items.won.join(', ') +';'+ b.items.lost.join(', ') +'\n';
					}
					var encodedUri = encodeURI(csvContent);
					var link = document.createElement("a");
					link.setAttribute("href", encodedUri);
					link.setAttribute("download", "LoungeStats_Export.csv");
					link.click();
				}).removeAttr('id');*/

				$('#loungestats_screenshotbutton').click(function(){
					if($('#loungestats_screenshotbutton').text() != "Screenshot") return;
					alert("The Screenshot will be taken in 4 seconds so that you can hover a bet if you want to...\n\n You can also quickly put the graph in Fullscreen mode!");
					$('#loungestats_screenshotbutton').text("Waiting");
					setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting.")}, 1000);
					setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting..")}, 2000);
					setTimeout(function(){$('#loungestats_screenshotbutton').text("Waiting...")}, 3000);
					setTimeout(function(){
						$('#loungestats_screenshotbutton').text("Uploading...");

						// Find needed stuff
						var canvas = $("#loungestats_profitgraph").find('.jqplot-grid-canvas, .jqplot-series-shadowCanvas, .jqplot-series-canvas, .jqplot-highlight-canvas');
								w = canvas[0].width,
								h = canvas[0].height,
								newCanvas = $('<canvas/>').attr('width', w).attr('height', h)[0],
								context = newCanvas.getContext("2d");

						//Fill white background
						context.fillStyle = "#FFF";
						context.fillRect(0, 0, w, h);
						context.fillStyle = "#000";
						//Draw all canvas elements in the jqplot onto the new canvas
						$(canvas).each(function() {
							context.drawImage(this, this.style.left.replace("px", ""), this.style.top.replace("px", ""));
						});
						//Populate Y axis in new canvas
						context.font = "11px Arial";
						var yaxis = $("#loungestats_profitgraph .jqplot-yaxis");
						$(yaxis.children()).each(function() {
							context.fillText(this.textContent, 3, parseInt(this.style.top) + 10);
						});
						//Populate X axis in new canvas
						var xaxis = $("#loungestats_profitgraph .jqplot-xaxis");
						$(xaxis.children()).each(function() {
							context.fillText(this.textContent, parseInt(this.style.left) + 1, h - 12);
						});
						//Draw Tooltip onto new canvas if currently displayed in DOM
						var ttip = $("#loungestats_profitgraph .jqplot-highlighter-tooltip")[0];
						if(ttip.style.display != "none"){
							var topoffset = parseInt(ttip.style.top);
							if(topoffset < 20) topoffset = 20;
							context.font = "16px Arial";
							context.fillStyle = "rgba(57, 57, 57, .8)";
							context.strokeStyle = "#808080";
							context.fillRect(parseInt(ttip.style.left), topoffset, ttip.clientWidth, ttip.clientHeight);
							context.lineWidth = "1";
							context.rect(parseInt(ttip.style.left), topoffset, ttip.clientWidth, ttip.clientHeight);
							context.stroke();
							context.fillStyle = "rgba(220, 220, 220, .8)";
							var strs = ttip.innerHTML.replace(/<br>/g,"|").replace(/<.+?>/g,"").split("|");
							for(var i = 0; i < strs.length; i++) context.fillText(strs[i], parseInt(ttip.style.left) + 5, topoffset + 18 + (i * 16))
						}
						//Header.
						context.font = "14px Arial";
						context.fillStyle = "#000";
						context.textAlign = 'center';
						context.font = "bold 15px Arial";
						context.fillText("LoungeStats Profit Graph ("+(app_id == APP_CSGO ? "CS:GO" : "DotA")+") | http://reddit.com/r/LoungeStats", w / 2, 17);

						new ImgurUploader().uploadFromCanvas(newCanvas, "LoungeStats Profit Graph Autoupload", "Visit http://reddit.com/r/LoungeStats for more infos!", function(err, imagelink){
							$('#loungestats_screenshotbutton').text("Screenshot");
							if(err) return alert("Sorry, uploading the image to Imgur failed :(\n\nTry it again in a second and doublecheck that Imgur is up!");

							var myPopup = window.open(response.data.link, "", "directories=no,height="+h+",width="+w+",menubar=no,resizable=no,scrollbars=no,status=no,titlebar=no,top=0,location=no");
							if (!myPopup){
								alert("Your Screenshot was uploaded, but it looks like your browser blocked the PopUp!");
							} else {
								myPopup.onload = function() {
									setTimeout(function() {
										if (myPopup.screenX === 0) alert("Your Screenshot was uploaded, but it looks like your browser blocked the Popup!");
									}, 0);
								};
							}
						}.bind(this));
					}, 4000);
				});
			}); //end async.eachSeries(betsKeys
		}]); //end async.series([
	}); //end LoungeStats.Lounge.getBetHistory
};//end LoungeStats.loadStats

async.series([ConversionRateProvider.init.bind(ConversionRateProvider),
							LoungeStats.init.bind(LoungeStats),
							function(cb){PriceProvider.init(cb);}], function(err){
	if(err) $('#ajaxCont').html(err);
});