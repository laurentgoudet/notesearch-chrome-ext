var debug = true;
var userStoreURL = "https://www.evernote.com/edam/user";
var authenticationToken = filter = noteStore = resultSpec = noteStoreURL = null;

var oauth_page = "https://notesearch.laurentgoudet.com/oauth"
var success_page = "https://notesearch.laurentgoudet.com/success"
var tabs = {};

if (localStorage['access_token']) {
	authenticationToken = localStorage['access_token'];
	initNotestore();
}
else {
	getAccessToken();
}

/* Let's do a bit a analytics for the fun */
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-44704339-1']);
_gaq.push(['_trackPageview']);

(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

function getAccessToken() {
	// Open a new tab on https://notesearch.laurentgoudet.com/oauth
	chrome.tabs.create({ 'url' : oauth_page }, function(tab) {
  	  tabs[tab.id] = tab.url;
	});

	// On update, get tab URL & close it -> we have the authentification token authenticationToken
	chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  	  if (changeInfo.url &&
      	changeInfo.url.substr(0, success_page.length) === success_page &&
  		changeInfo.url != tabs[tabId]) {
			/* We're at the success page. Let's get the access_token from the URL */
		  	if(debug) console.log("chrome.tabs.onUpdated: changeInfo.url " + changeInfo.url);
		  /* Parse the success page URL to get the access_token */
		  var urlparts = changeInfo.url.split("#");
		  authenticationToken = urlparts[1];
		  if (urlparts.length >= 2) {
			  authenticationToken = urlparts[1];
			  localStorage['access_token'] = authenticationToken;
		  }
		  if(debug) console.log("chrome.tabs.onUpdated: access_token:" + authenticationToken);
		  if (authenticationToken) {
      		chrome.tabs.remove(tabId);
	  	  	initNotestore();
    	  }
  		}
	});
}

function initNotestore() {
    userStoreTransport = new Thrift.BinaryHttpTransport(userStoreURL);
    userStoreProtocol = new Thrift.BinaryProtocol(userStoreTransport);
    userStore = new UserStoreClient(userStoreProtocol);
    userStore.getNoteStoreUrl(authenticationToken,
		function (url) {
      	  if(debug) console.log("authorize: noteStoreURL: " + url);
			noteStoreURL = url;
			noteStoreTransport = new Thrift.BinaryHttpTransport(noteStoreURL);
			noteStoreProtocol = new Thrift.BinaryProtocol(noteStoreTransport);
			noteStore = new NoteStoreClient(noteStoreProtocol);
			filter = new NoteFilter();
			resultSpec = new NotesMetadataResultSpec();
			resultSpec.includeTitle = true;
  	  	},
    	function onerror(error) {
			if(error.errorCode == EDAMErrorCode.INVALID_AUTH || error.errorCode == EDAMErrorCode.AUTH_EXPIRED) {
				if(debug) console.log("initNotestore: access_token expired -> retry");
				getAccessToken();
			} else {
				console.error(error);
			}
    	}
	);
}

function getNotesList(query,suggest) {
	if (filter) {
		filter.words = query + "\*";
		if(debug) console.log("getNotesList: query: " + query);
		noteStore.findNotesMetadata(authenticationToken, filter, 0, 5, resultSpec, function (noteList) {
			if(debug) console.log("getNotesList: matches: " + noteList.totalNotes);
			var suggestArray=new Array();
			for( var note in  noteList.notes ){
				var noteURL = noteStoreURL.replace("notestore","view/notebook/") + noteList.notes[note].guid;
				var description = noteList.notes[note].title + "<dim> - " + "NoteSearch" + "</dim>";
				if(debug) console.log("getNotesList: description: " + description);
				suggestArray.push({content: noteURL, description: description });
			}
			suggest(suggestArray);
		});
	}
}

chrome.omnibox.onInputChanged.addListener(
  function(text, suggest) {
	if(debug) console.log("onInputChanged: text:" + text);
	chrome.omnibox.setDefaultSuggestion({description:"Search \""+text+"\" in Evernote"});
	getNotesList(text,suggest);
});

/* User has accepted what is typed into the omnibox. */
chrome.omnibox.onInputEntered.addListener(
  function(text) {
	if(debug) console.log("onInputChanged: text: " + text);
	var regexp = /[abcdef0-9]{8}-[abcdef0-9]{4}-[abcdef0-9]{4}-[abcdef0-9]{4}-[abcdef0-9]{12}/;
	if(!regexp.test(text))
		chrome.tabs.update({url:  "https://www.evernote.com/Home.action?#st=p&x="+text});
	else
		chrome.tabs.update({url: text + "#st=p&n=" + text.match(regexp)});
  });
