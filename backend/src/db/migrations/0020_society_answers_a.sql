-- D-093 (society answers, step A). Rates the Admin already saved are left alone.
-- F-14: the holiday list joins the settings (empty until the Admin fills it).
UPDATE "settings_versions"
SET "data" = '{"holidays": []}'::jsonb || "data";
--> statement-breakpoint
-- F-09: no SMS. Templates that went by SMS go by WhatsApp instead (once).
UPDATE "notification_templates"
SET "channels" = (
  SELECT coalesce(jsonb_agg(DISTINCT c), '[]'::jsonb)
  FROM jsonb_array_elements_text("channels") AS x(v)
  CROSS JOIN LATERAL (SELECT CASE WHEN x.v = 'SMS' THEN 'WHATSAPP' ELSE x.v END AS c) m
)
WHERE "channels" ? 'SMS';
--> statement-breakpoint
-- A member who had SMS on now gets WhatsApp; the SMS flag goes.
UPDATE "member_preferences"
SET "data" = jsonb_set("data", '{channels}', (("data"->'channels') - 'SMS'::text) || CASE WHEN ("data"->'channels'->>'SMS')::boolean THEN '{"WHATSAPP": true}'::jsonb ELSE '{}'::jsonb END)
WHERE "data"->'channels' ? 'SMS';
