// ==UserScript==
// @name        LoungeStats2
// @namespace   LoungeStats2
// @author      Kinsi http://reddit.com/u/kinsi55
// @include     http://csgolounge.com/myprofile
// @include     http://dota2lounge.com/myprofile
// @include     https://csgolounge.com/myprofile
// @include     https://dota2lounge.com/myprofile
// @version     2.0.0
// @require     http://loungestats.kinsi.me/dl/jquery-2.1.1.min.js
// @require    	http://loungestats.kinsi.me/dl/jquery.jqplot.min.js
// @require     http://loungestats.kinsi.me/dl/jqplot.cursor.min.js
// @require    	http://loungestats.kinsi.me/dl/jqplot.dateAxisRenderer.min.js
// @require     http://loungestats.kinsi.me/dl/jqplot.highlighter.min.js
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

var version = GM_info.script.version;
var newVersion = (GM_getValue('LoungeStats_lastversion') != version);

var $ = this.$; //STFU JSLINT
var APP_CSGO = '730';
var APP_DOTA = '570';

//http://stackoverflow.com/a/5812341/3526458
function isValidDate(s) {
	var bits = s.split('.');
	var d = new Date(bits[2], bits[1] - 1, bits[0]);
	return d && (d.getMonth() + 1) == bits[1] && d.getDate() == Number(bits[0]);
}

function SteamClass(){

}

SteamClass.prototype.SteamItem = function(itemFullName){
	this.name = itemFullName;
};

SteamClass.prototype.SteamItem.prototype.getPrice = function(){
	//TBD
	return 0.0;
};

SteamClass.prototype.SteamItem.prototype.loadPrice = function(refresh){
	//if(!refresh && !GM_getValue(this.name))
}

function LoungeClass(Steam){
	var betHistoryEntry = function(betRowJq, betItemsJq, wonItemsJq){
		betItemsJq = betItemsJq.find('div > div.name > b:first-child').map(function(){return new Steam.SteamItem(this.textContent.trim());});
		wonItemsJq = wonItemsJq.find('div > div.name > b:first-child').map(function(){return new Steam.SteamItem(this.textContent.trim());});

		this.matchId 		= parseInt(betRowJq.children()[2].children[0].href.split('=').pop());
		this.betDate 		= new Date(Date.parse(betRowJq.children()[6].textContent.replace(/-/g,' ') + ' +0'));
		this.items = {bet: betItemsJq, won: wonItemsJq, lost: []};

		this.teams = [betRowJq.children()[2].children[0].textContent, betRowJq.children()[4].children[0].textContent];
		this.winner = (betRowJq.children()[4].style.fontWeight == 'bold')+0;

		this.betoutcome 	=	betRowJq.children()[1].children[0].classList[0] || "draw";

		if(wonItemsJq.length > 0){
			this.betoutcome = "won"; // http://redd.it/3edctm
		}else if(['won', 'draw'].indexOf(this.betoutcome) == -1){
			this.items.lost = betItemsJq;
		}
	};

	this.getBetHistory = function(callback) {
		var betData, archivedBetData, parsedBetdata = [];
		$.when(
			$.get("/ajax/betHistory.php", 				function(data){betData = data;}),
			$.get("/ajax/betHistoryArchives.php", function(data){archivedBetData = data;})
		).then(function(){
			if(!betData || !archivedBetData || betData.indexOf("<tr>") == -1 || archivedBetData.indexOf("<tr>") == -1 ){
				callback("Failed to load either betHistory or archivedBetHistory", null);
			}else{
				//"Concat" both html Tables, parse it w/ jQuery, get every tablerow
				var preParsedBetdata = $(betData.split('</tbody>')[0]+archivedBetData.split('<tbody>')[1]).find('tr');
				//Iterate bets from the end so oldest bets are first, step = 2 since theres always a row with bet info, then the won items, then the lost items, so 3 rows per bet

				for(var i = preParsedBetdata.length-3; i > 0; i -= 3){
					parsedBetdata.push(new betHistoryEntry($(preParsedBetdata[i]), $(preParsedBetdata[i+1]), $(preParsedBetdata[i+2])));
				}

				callback(null, parsedBetdata);
			}
		});
	};
}

LoungeClass.prototype.currentAppid = window.location.hostname == 'dota2lounge.com' ? APP_DOTA : APP_CSGO;

function LoungeStatsClass(){
	this.Steam = new SteamClass();
	this.Lounge = new LoungeClass(this.Steam);

	var Setting = function(name, json, fieldid){
		this.name = name;
		this.json = json === true;
		this.fieldid = fieldid || json;
		if(this.fieldid === true) this.fieldid = undefined;

		this.value = GM_getValue('setting_'+this.name);

		if(this.value && this.json) this.value = JSON.parse(this.value);
	};

	Setting.prototype= {getValue: function(){return this.value;},
											populateFormField: function(){
												if(this.fieldid && !this.json && this.value) $('.loungestatsSetting#'+this.name).val(this.value);
											},
											setValue: function(newValue){
												this.value = newValue;
												if(!this.json) GM_setValue('setting_'+this.name, this.value);
												if(this.json) GM_setValue('setting_'+this.name, JSON.stringify(this.value));
												return newValue;
											}};

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

	this.Settings.save = function(){
		$(".loungestatsSetting").each(function(i, setting){
			console.log(setting.id, this.Settings[setting.id]);
			this.Settings[setting.id].setValue(setting.value);
		}.bind(this));

		if(isValidDate($('#beforedate').val())){
			this.Settings.beforedate.setValue($('#beforedate').val());
		} else {
			alert('The format of the given date is invalid! Use Day.Month.Year!');
			return;
		}
		this.Settings.close();
	}.bind(this);

	this.Settings.show = function(){
		for(var key in this.Settings){
			if(!(this.Settings[key] instanceof Setting)) continue;
			this.Settings[key].populateFormField();
		}

		var multiaccthing = '<div>' + (this.Lounge.currentAppid == APP_CSGO ? 'CS:GO' : 'DotA') + ' Accounts</div>';

		for(var i in this.Settings.accounts.getValue().aval[this.Lounge.currentAppid]) {
			var bla = this.Settings.accounts.getValue().active[this.Lounge.currentAppid].indexOf(i) != -1 ? "checked" : "";

			multiaccthing += '<input type="checkbox" name="'+i+'" '+bla+'> "<a href="http://steamcommunity.com/profiles/'+i+'" target="_blank">'+this.Settings.accounts.getValue().aval[this.Lounge.currentAppid][i]+'</a>"<br/>';
		}
		$('#loungestats_mergepicks').html(multiaccthing);

		$('#loungestats_overlay').fadeIn(500);
	}.bind(this);

	this.Settings.close = function(){
		$('#loungestats_overlay').fadeOut(500);
	};
}

LoungeStatsClass.prototype = {
	init: function(){
		$('section:nth-child(2) div.box-shiny').append('<a id="loungestats_tabbutton" class="button">LoungeStats</a>');
		GM_addStyle('.jqplot-highlighter-tooltip {background-color: #393938; border: 1px solid gray; padding: 5px; color: #ccc} \
								 .jqplot-xaxis {margin-top: 5px; font-size: 12px} \
								 .jqplot-yaxis {margin-right: 5px; width: 55px; font-size: 12px} \
								 .jqplot-yaxis-tick {text-align: right; width: 100vw} \
								 #loungestats_overlay {z-index: 9000; display: none; top: 0px; left: 0px; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.4); position: fixed} \
								 #loungestats_settings_title {text-align: center; font-size: 12px; height: 40px; border: 2px solid #DDD; border-top: none; background-color: #EEE; width: 100%; margin-top: -10px; -webkit-border-radius: 0 0 5px 5px; border-radius: 0 0 5px 5px; padding: 10px 5px 0 5px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box;} \
								 #loungestats_settingswindow {font-size: 13px; z-index: 9001; padding: 10px; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; position: relative; background-color: white; left: 50%; top: 50%; width: 300px; margin-left: -151px; height: 420px; margin-top: -211px; -webkit-border-radius: 5px; border-radius: 5px; -webkit-box-shadow: 0 0 10px -5px #000; box-shadow: 0 0 10px -5px #000; border: 1px solid gray; overflow: hidden;-webkit-transition: all 250ms ease-in-out;-moz-transition: all 250ms ease-in-out;-ms-transition: all 250ms ease-in-out;-o-transition: all 250ms ease-in-out;transition: all 250ms ease-in-out;} \
								 #loungestats_settingswindow.accounts {width: 500px; margin-left: -251px;} \
								 #loungestats_settings_leftpanel select, #loungestats_settings_leftpanel input{margin: 3px 0; width: 100%; height: 22px !important; padding: 0;} \
								 #loungestats_settings_leftpanel input{width: 274px;} \
								 #loungestats_fullscreenbutton{margin-right: 29px !important; margin-top: -5px !important; height: 14px; z-index: 8998; position: relative;} \
								 #loungestats_fullscreenbutton.fullsc{position: fixed;margin: 0 !important;right: 34px; top: -5px;} \
								 #loungestats_profitgraph{position: relative; height: 400px; clear: left; z-index: 322;} \
								 #loungestats_profitgraph.fullsc{background-color: #DDD;height: 100vh !important;left: 0;margin: 0;position: fixed !important;top: 0;width: 100vw;} \
								 #loungestats_settings_leftpanel{width: 278px; float: left;} \
								 #loungestats_settings_rightpanel{width: 188px; float: left; margin-left: 11px;} \
								 #loungestats_settings_panelcontainer{width: 500px;} \
								 #loungestats_datacontainer{position: relative;clear: both;} \
								 .jqplot-highlighter-tooltip{z-index: 8999;} \
								 #loungestats_updateinfo{text-align: center;} \
								 #loungestats_mergepicks{border:2px solid #ccc; height: 100px; overflow-y: scroll; height: 258px; padding: 5px;-moz-box-sizing: border-box;-webkit-box-sizing: border-box;box-sizing: border-box;} \
								 #loungestats_mergepicks div:first-child{font-weight: bold;} \
								 #loungestats_mergepicks input{height: 20px !important;vertical-align: middle;} \
								 #loungestats_datecontainer{position: relative;} \
								 #loungestats_stats_text a{color: blue;} \
								 .hideuntilready{display: none !important;}');

		GM_addStyle('.calendar {top: 5px !important; left: 108px !important; font-family: \'Trebuchet MS\', Tahoma, Verdana, Arial, sans-serif !important;font-size: 0.9em !important;background-color: #EEE !important;color: #333 !important;border: 1px solid #DDD !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;padding: 0.2em !important;width: 14em !important;}.calendar .months {background-color: #F6AF3A !important;border: 1px solid #E78F08 !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;color: #FFF !important;padding: 0.2em !important;text-align: center !important;}.calendar .prev-month,.calendar .next-month {padding: 0 !important;}.calendar .prev-month {float: left !important;}.calendar .next-month {float: right !important;}.calendar .current-month {margin: 0 auto !important;}.calendar .months .prev-month,.calendar .months .next-month {color: #FFF !important;text-decoration: none !important;padding: 0 0.4em !important;-moz-border-radius: 4px !important;-webkit-border-radius: 4px !important;border-radius: 4px !important;cursor: pointer !important;}.calendar .months .prev-month:hover,.calendar .months .next-month:hover {background-color: #FDF5CE !important;color: #C77405 !important;}.calendar table {border-collapse: collapse !important;padding: 0 !important;font-size: 0.8em !important;width: 100% !important;}.calendar th {text-align: center !important; color: black !important;}.calendar td {text-align: right !important;padding: 1px !important;width: 14.3% !important;}.calendar tr{border: none !important; background: none !important;}.calendar td span {display: block !important;color: #1C94C4 !important;background-color: #F6F6F6 !important;border: 1px solid #CCC !important;text-decoration: none !important;padding: 0.2em !important;cursor: pointer !important;}.calendar td span:hover {color: #C77405 !important;background-color: #FDF5CE !important;border: 1px solid #FBCB09 !important;}.calendar td.today span {background-color: #FFF0A5 !important;border: 1px solid #FED22F !important;color: #363636 !important;}');

		$('body').append('<div id="loungestats_overlay"> \
			<div id="loungestats_settingswindow"'+((this.Settings.domerge == '1') ? ' class="accounts"' : '')+'> \
				<div id="loungestats_settings_title">Loungestats '+version+' Settings | by <a href="http://reddit.com/u/kinsi55">/u/kinsi55</a><br><br></div> \
				<div id="loungestats_settings_panelcontainer"> \
					<div id="loungestats_settings_leftpanel"> \
						Pricing accuracy <a class="info">?<p class="infobox"><br>Fastest: Use current item prices for all bets<br><br>Most accurate: Use item prices at approximately the time of the bet, as little delay as possible between requests<br><br>Most accurate & safest: Same as Most accurate, but with a bit more delay between requests</p></a>:<br> \
						<select class="loungestatsSetting" id="method"> \
							<option value="0">Fastest</option> \
							<option value="1">Most accurate</option> \
							<option value="2">Most accurate & safest</option> \
						</select><br> \
						Currency:<br> \
						<select class="loungestatsSetting" id="currency"> \
							<option value="1">US Dollar(Most exact)</option> \
							<option value="3">Euro</option> \
							<option value="2">Great British Pound</option> \
							<option value="5">Rubel</option> \
							<option value="7">Brazilian real</option> \
						</select><br> \
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
							<input id="beforedate" value="01.01.2000"><br> \
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

		$('.loungestatsSetting#domerge').change(function() {
			$('#loungestats_settingswindow').toggleClass('accounts', $('.loungestatsSetting#domerge').val() == 1);
		});

		new datepickr('beforedate', {
			'dateFormat': 'd.m.Y'
		});

		$('.calendar').detach().appendTo('#loungestats_datecontainer');

		$('#loungestats_tabbutton').click(function() {this.loadStats();}.bind(this)).removeAttr('id');
		$('#loungestats_overlay, #loungestats_settings_close').click(function() {this.Settings.close();}.bind(this));
		$('#loungestats_settings_save').click(function() {this.Settings.save();}.bind(this));
		$('#loungestats_settingswindow #loungestats_beforedate, .calendar').click(function(e) {e.stopPropagation();});
		$('#loungestats_settingswindow').click(function(e) {e.stopPropagation(); $('.calendar').css('display','none');});

		if(!this.Settings.accounts.getValue()) this.Settings.accounts.setValue({aval:{'570': {}, '730': {}}, active:{'570': [], '730': []}});

		$(document).on('click', 'a#loungestats_settingsbutton', function(){
			this.Settings.show();
		}.bind(this));
	}
};

var LoungeStats = new LoungeStatsClass();

LoungeStats.init();

//LoungeStats.Lounge.getBetHistory(function(err, bets){if(!err) console.log(bets);});

LoungeStats.Settings.show();