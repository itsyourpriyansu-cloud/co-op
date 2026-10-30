-- P3 ledger guards (REQ-131, docs/22 §3). The posting service checks the same rules first
-- (@tgs/domain checkJournal); these make them impossible to break from anywhere else.

-- 1. Every entry balances and has at least two lines, checked at COMMIT (deferred), so an entry
--    and its lines can be inserted one after another in the same transaction.
CREATE OR REPLACE FUNCTION ledger_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  v_entry uuid;
  v_lines integer;
  v_debit bigint;
  v_credit bigint;
BEGIN
  IF TG_TABLE_NAME = 'journal_lines' THEN
    v_entry := NEW.entry_id;
  ELSE
    v_entry := NEW.id;
  END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO v_lines, v_debit, v_credit
    FROM journal_lines WHERE entry_id = v_entry;
  IF v_lines < 2 THEN
    RAISE EXCEPTION 'Journal entry % needs at least two lines (has %)', v_entry, v_lines USING ERRCODE = 'check_violation';
  END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal entry % does not balance: debit % <> credit %', v_entry, v_debit, v_credit USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_balanced
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced();
--> statement-breakpoint

-- 2. Append-only: posted entries and lines are never changed or deleted. Corrections are
--    reversing entries. (TRUNCATE stays possible for the dev/test reseed only.)
CREATE OR REPLACE FUNCTION ledger_refuse_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The books are append-only: % on % is not allowed. Post a reversing entry instead.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_refuse_change();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION ledger_refuse_change();
