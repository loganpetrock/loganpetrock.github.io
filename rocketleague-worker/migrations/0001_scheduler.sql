CREATE TABLE slots (
 id TEXT PRIMARY KEY, start INTEGER NOT NULL, end INTEGER NOT NULL,
 team TEXT, discord TEXT, cancel_hash TEXT UNIQUE, cancel_token TEXT,
 CHECK(end-start IN (2700000,3600000)), CHECK(end>start)
);
CREATE INDEX slots_start ON slots(start);
CREATE TRIGGER prevent_overlap BEFORE INSERT ON slots
WHEN EXISTS(SELECT 1 FROM slots WHERE start<NEW.end AND end>NEW.start)
BEGIN SELECT RAISE(ABORT,'overlap'); END;
CREATE TABLE sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE requests (id TEXT PRIMARY KEY, team TEXT NOT NULL, discord TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, sent INTEGER, lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER booked AFTER UPDATE OF team ON slots WHEN OLD.team IS NULL AND NEW.team IS NOT NULL
BEGIN INSERT INTO outbox(id,payload) VALUES(lower(hex(randomblob(16))),json_object('event','Match booked','team',NEW.team,'discord',NEW.discord,'start',NEW.start,'end',NEW.end,'token',NEW.cancel_token)); END;
CREATE TRIGGER cancelled AFTER UPDATE OF team ON slots WHEN OLD.team IS NOT NULL AND NEW.team IS NULL
BEGIN INSERT INTO outbox(id,payload) VALUES(lower(hex(randomblob(16))),json_object('event','Match cancelled — slot reopened','team',OLD.team,'discord',OLD.discord,'start',OLD.start,'end',OLD.end)); END;
CREATE TRIGGER removed AFTER DELETE ON slots WHEN OLD.team IS NOT NULL
BEGIN INSERT INTO outbox(id,payload) VALUES(lower(hex(randomblob(16))),json_object('event','Match cancelled by admin — slot removed','team',OLD.team,'discord',OLD.discord,'start',OLD.start,'end',OLD.end)); END;
CREATE TRIGGER conflict AFTER INSERT ON requests
BEGIN INSERT INTO outbox(id,payload) VALUES(NEW.id,json_object('event','Scheduling discussion requested','team',NEW.team,'discord',NEW.discord,'message',NEW.message)); END;
