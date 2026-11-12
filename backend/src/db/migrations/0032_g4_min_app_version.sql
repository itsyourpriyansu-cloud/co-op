-- G4 (D-114): the oldest app version allowed; 0.0.0 lets every version in.
UPDATE "settings_versions"
SET "data" = '{"minAppVersion": "0.0.0"}'::jsonb || "data"
WHERE NOT ("data" ? 'minAppVersion');
