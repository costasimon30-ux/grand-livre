/* Grand Livre — service worker.
   Rend l'application utilisable sans réseau après une première ouverture.

   Principe : la page est redemandée au réseau quand il est là (pour avoir la
   dernière version déployée) et servie depuis le cache quand il n'y est pas.
   Les appels à l'API GitHub ne sont jamais mis en cache : des données
   financières périmées seraient pires que pas de données du tout. */

var CACHE_NAME = 'grand-livre-v1';
var SHELL = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      /* addAll échoue en bloc si un seul fichier manque : on tolère les absents */
      return Promise.all(SHELL.map(function(url){
        return cache.add(url).catch(function(){ return null; });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; })
                             .map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(e){ return; }

  /* Les données passent toujours par le réseau, jamais par le cache. */
  if(url.hostname === 'api.github.com') return;

  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  var isNavigation = req.mode === 'navigate' || (sameOrigin && req.destination === 'document');

  if(isNavigation){
    event.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  if(sameOrigin || isFont){
    event.respondWith(
      caches.match(req).then(function(cached){
        var networked = fetch(req).then(function(res){
          if(res && res.status === 200){
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function(c){ c.put(req, copy); });
          }
          return res;
        }).catch(function(){ return cached; });
        return cached || networked;
      })
    );
  }
});
