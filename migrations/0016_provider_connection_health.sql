-- Retain the most recent personal-credential probe without disabling the credential.
ALTER TABLE user_provider_credentials ADD COLUMN last_tested_at TEXT;
ALTER TABLE user_provider_credentials ADD COLUMN last_test_status TEXT;
