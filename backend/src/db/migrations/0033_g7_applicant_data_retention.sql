-- G7 (D-117, DPDP): months after which a rejected or withdrawn applicant's data is erased [P].
UPDATE "settings_versions"
SET "data" = '{"applicantDataRetentionMonths": 12}'::jsonb || "data"
WHERE NOT ("data" ? 'applicantDataRetentionMonths');
