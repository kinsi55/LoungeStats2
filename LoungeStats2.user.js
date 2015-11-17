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


// This code is shit, i get nightmares when i have to maintain it
// It please dont try to understand it

var app_id = (window.location.hostname == 'dota2lounge.com' ? '570' : '730');
var version = GM_info.script.version;
var newVersion = (GM_getValue('LoungeStats_lastversion') != version);

