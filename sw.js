/* HALWAA Service Worker — фоновые push-уведомления + PWA-кэш */
const CACHE='halwaa-v1';

self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});

/* Получение push от сервера (работает даже при закрытом приложении) */
self.addEventListener('push',function(e){
  let data={title:'HALWAA',body:'Новое уведомление'};
  try{if(e.data)data=e.data.json();}catch(err){try{data.body=e.data.text();}catch(_){}}
  const title=data.title||'HALWAA';
  const opts={
    body:data.body||'',
    icon:data.icon||'/icon-192.png',
    badge:'/icon-192.png',
    vibrate:[200,100,200],
    tag:data.tag||'halwaa',
    renotify:true,
    data:{url:data.url||'/'}
  };
  e.waitUntil(self.registration.showNotification(title,opts));
});

/* Клик по уведомлению — открыть/сфокусировать приложение */
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c)return c.focus();}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});
