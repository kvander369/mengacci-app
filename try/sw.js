/* retired 2026-09-13: removes the trial's offline copy and itself, then sends the phone to the app */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf('mengacci-try-') === 0; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.registration.unregister(); }).then(function(){ return self.clients.matchAll(); }).then(function(cs){ cs.forEach(function(c){ c.navigate('../'); }); })); });
