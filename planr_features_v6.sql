-- Add channel field to meeting_items (used on follow-up items only, but nullable for all)
alter table meeting_items add column if not exists channel text;
