/*
================================================================
  HALWAA — Фоновые PUSH-уведомления (Web Push)
  Инструкция по настройке серверной части (Supabase)
================================================================

КЛЮЧИ VAPID (уже встроены в mobile.html публичный ключ):
  PUBLIC : BDk7OsRQnYiFKWRzlALa6NQ_-iDwYE8F50Hzcq6s2unelAvVWRTS7e1jkaBvbLueC0Gn8aLaZm7MljaXQOtDqV8
  PRIVATE: q8Bun4utcFHGwYqugWGAetVHmxAn_PvU5ki05YHnb_k   (хранить в секрете!)

----------------------------------------------------------------
ШАГ 1. Таблица подписок — выполнить в Supabase → SQL Editor:
----------------------------------------------------------------

create table if not exists push_subs (
  endpoint text primary key,
  agent text,
  name text,
  p256dh text,
  auth text,
  updated_at timestamptz default now()
);
alter table push_subs enable row level security;
create policy "all_push" on push_subs for all using (true) with check (true);

----------------------------------------------------------------
ШАГ 2. Edge Function — отправщик push.
  В Supabase → Edge Functions → создать функцию "send-push"
  и вставить код ниже (Deno). Затем Deploy.
----------------------------------------------------------------
*/

import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC  = "BDk7OsRQnYiFKWRzlALa6NQ_-iDwYE8F50Hzcq6s2unelAvVWRTS7e1jkaBvbLueC0Gn8aLaZm7MljaXQOtDqV8";
const VAPID_PRIVATE = "q8Bun4utcFHGwYqugWGAetVHmxAn_PvU5ki05YHnb_k";
const SB_URL  = Deno.env.get("SB_URL")!;        // https://wgkilpzxhmwqsnfytwya.supabase.co
const SB_KEY  = Deno.env.get("SB_SERVICE_KEY")!; // service_role ключ (Settings→API)

webpush.setVapidDetails("mailto:halwaa@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  // тело: { "title":"...", "body":"...", "agent":"e1"|null (null = всем) }
  const { title, body, agent, url } = await req.json().catch(() => ({}));
  // берём подписки (всех или одного агента)
  const q = agent ? `&agent=eq.${agent}` : "";
  const res = await fetch(`${SB_URL}/rest/v1/push_subs?select=*${q}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const subs = await res.json();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: title || "HALWAA", body: body || "", url: url || "/" })
      );
      sent++;
    } catch (_e) { /* мёртвую подписку можно удалить */ }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

/*
----------------------------------------------------------------
ШАГ 3. Секреты функции — в Supabase → Edge Functions → Secrets:
  SB_URL         = https://wgkilpzxhmwqsnfytwya.supabase.co
  SB_SERVICE_KEY = (service_role ключ из Settings → API)
----------------------------------------------------------------
ШАГ 4. Как ОТПРАВИТЬ push (например, продающее уведомление всем):

  POST https://wgkilpzxhmwqsnfytwya.supabase.co/functions/v1/send-push
  Headers: Authorization: Bearer <anon-или-service-ключ>
  Body: { "title":"📈 Продажи", "body":"Заходи в каждый магазин — будут продажи!" }

ШАГ 5. Авто-рассылка по расписанию (необязательно) —
  Supabase → Database → Cron (pg_cron) + pg_net, например каждый час 9–18:

  select cron.schedule('halwaa-push','0 9-18 * * *', $$
    select net.http_post(
      url:='https://wgkilpzxhmwqsnfytwya.supabase.co/functions/v1/send-push',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_KEY>"}'::jsonb,
      body:='{"title":"HALWAA","body":"Заходи в магазин — будут продажи! Не опаздывай."}'::jsonb
    );
  $$);

ГОТОВО. После этого уведомления приходят на телефон агента
ДАЖЕ при полностью закрытом приложении.
*/
