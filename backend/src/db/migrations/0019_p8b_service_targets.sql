-- P8b (D-089, REQ-135): service targets join the settings (values already saved win).
UPDATE "settings_versions"
SET "data" = '{"membershipTargetHours": 48, "loanTargetDays": 5}'::jsonb || "data";
