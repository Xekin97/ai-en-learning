chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{if(change.status==='complete'&&tab.url?.startsWith('http://127.0.0.1:6101/'))chrome.tabs.setZoom(tabId,2);});
