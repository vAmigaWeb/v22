const url_root_path= self.location.pathname.replace("/sw.js","");
const core_version  = '2.2b1'; //has to be the same as the version in Emulator/config.h
const ui_version = '2022_11_07'+url_root_path.replace("/","_");
const cache_name = `${core_version}@${ui_version}`;
const settings_cache = 'settings';

set_settings_cache_value = async function (key, value)
{
    let settings = await caches.open(settings_cache);
    await settings.put(key, new Response(value) );
}
get_settings_cache_value= async function (key)
{
    let settings = await caches.open(settings_cache);
    let response=await settings.match(key)
    if(response==undefined)
        return null;
    return await response.text();
}

async function get_active_cache_name()
{
    let v = await get_settings_cache_value('active_version');
    return v!=null ? v:cache_name;
}

//get messages from the web app
self.addEventListener("message", async evt => {
  const client = evt.source;
  if(evt.data == "version")
  {
    //set the active_cache_name to the cache_name of this sw in case of no active version set yet!
    await set_settings_cache_value("active_version", await get_active_cache_name());

    client.postMessage({core: core_version, ui: ui_version, cache_name: cache_name});
  }
});


// install event
self.addEventListener('install', evt => {
  console.log('service worker installed');
  self.skipWaiting();
//no preinstall - installation implicit during fetch
/*  event.waitUntil(
    caches.open(cache_name).then(function(cache) {
      return cache.addAll([
        '/index.html',
        '/vAmiga.js',
        '/vAmiga.wasm',
      ]);
    })
  );
*/
});

// activate event
self.addEventListener('activate', evt => {
  console.log('service worker activated');
  let check_and_update=async () =>{    
    current_version=await get_settings_cache_value("active_version");
    if(current_version == null)
    {      
      console.log("current version of vAmigaWeb does not yet support update dialog, enforce install...");
      let keys = await caches.keys();
      for(c of keys)
      {
        if(c != settings_cache)
        {
          console.log('deleting cache files:'+c);
          await caches.delete(c);
        }
      }
      // and set active version
      await set_settings_cache_value("active_version", cache_name);
      // and reload app
      const tabs = await self.clients.matchAll({type:'window'});
      tabs.forEach((tab)=>{ tab.navigate(tab.url) });
    }
  }
  evt.waitUntil( check_and_update());

/*    evt.waitUntil(
      caches.keys().then(keys => {
        console.log('deleting cache files:'+keys);
        return Promise.all(keys.map(key => caches.delete(key)));
      })
    );
*/
});

self.addEventListener('fetch', function(event){
  event.respondWith(async function () {
      //is this url one that should not be cached at all ? 
      if(
        event.request.url.startsWith('https://csdb.dk/webservice/') && 
        !event.request.url.endsWith('cache_me=true')
        ||
        event.request.url.startsWith('https://mega65.github.io/')
        ||
        event.request.url.toLowerCase().startsWith('https://vamigaweb.github.io/doc')
        ||
        event.request.url.toLowerCase().endsWith('vamigaweb_player.js')
	||
        event.request.url.endsWith('run.html')
	||
        event.request.url.endsWith('cache_me=false')
      )
      {
        console.log('sw: do not cache fetched resource: '+event.request.url);
        return fetch(event.request);
      }
      else
      {
        //try to get it from the cache
        active_cache_name = await get_active_cache_name();
        var cache = await caches.open(active_cache_name);
        var cachedResponsePromise = await cache.match(event.request);
        if(cachedResponsePromise)
        {
          console.log('sw: get from '+active_cache_name+' cached resource: '+event.request.url);
          return cachedResponsePromise;
        }

        //if not in cache try to fetch
      	//with no-cache because we dont want to cache a 304 response ...
	      //learn more here
	      //https://stackoverflow.com/questions/29246444/fetch-how-do-you-make-a-non-cached-request 
        var networkResponsePromise = fetch(event.request, {cache: "no-cache"});
        event.waitUntil(
          async function () 
          {
            try {
              var networkResponse = await networkResponsePromise;
              if(networkResponse.status == 200)
              {
                console.log(`sw: status=200 into ${active_cache_name} putting fetched resource: ${event.request.url}`);
                await cache.put(event.request, networkResponse.clone());
              }
              else
              {
                console.error(`sw: ${active_cache_name} received code ${networkResponse.code} for resource: ${event.request.url}`);
              }
            }
            catch(e) { console.error(`exception during fetch ${e}`); }
          }()
        );   
        return networkResponsePromise;
      }
   }());
});
