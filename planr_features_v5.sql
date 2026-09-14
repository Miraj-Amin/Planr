-- Fix meeting_item_links to have an id column so the adapter can insert into it
alter table meeting_item_links add column if not exists id uuid default gen_random_uuid();
update meeting_item_links set id = gen_random_uuid() where id is null;

alter table meeting_item_links drop constraint if exists meeting_item_links_pkey;
alter table meeting_item_links add primary key (id);
alter table meeting_item_links add constraint meeting_item_links_unique unique (meeting_item_id, meeting_id);
