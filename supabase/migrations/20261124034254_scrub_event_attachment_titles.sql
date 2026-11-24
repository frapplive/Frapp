-- Scrub document names stored in events' attachment titles (#5921,
-- spec/behavior/frapp-links.md § Names are read per reader).
--
-- Before Frapp links (#4934), an event's document attachment stored the
-- document's name in `title`, and every phone build draws that title to every
-- member who can see the event, including members who can't open the file.
-- The API now writes the kind's word ("Document") on every save; this rewrites
-- the entries saved before it. Order, ids and every other entry are kept.

update public.events e
   set attachments = (
     select coalesce(
              jsonb_agg(
                case
                  when entry ->> 'kind' = 'document'
                    then jsonb_set(entry, '{title}', '"Document"'::jsonb, true)
                  else entry
                end
                order by position
              ),
              '[]'::jsonb
            )
       from jsonb_array_elements(e.attachments) with ordinality as item(entry, position)
   )
 where jsonb_typeof(e.attachments) = 'array'
   and exists (
     select 1
       from jsonb_array_elements(e.attachments) as item(entry)
      where entry ->> 'kind' = 'document'
        and entry ->> 'title' is distinct from 'Document'
   );
