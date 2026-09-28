-- Test fixtures: two units, two admins + two inspectors + one viewer in
-- SS-75, one admin in another unit, one IFS object.
INSERT INTO public.units (id, code, name)
VALUES ('00000000-0000-0000-0000-0000000000b2', 'OTHER', 'Other unit')
ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'admin1@test'),
  ('00000000-0000-0000-0000-00000000a002', 'admin2@test'),
  ('00000000-0000-0000-0000-00000000c001', 'insp1@test'),
  ('00000000-0000-0000-0000-00000000c002', 'insp2@test'),
  ('00000000-0000-0000-0000-00000000e001', 'viewer1@test'),
  ('00000000-0000-0000-0000-00000000b001', 'adminb@test')
ON CONFLICT DO NOTHING;
UPDATE public.profiles SET active = true, role = 'admin'
 WHERE email IN ('admin1@test', 'admin2@test', 'adminb@test');
UPDATE public.profiles SET active = true, role = 'inspector'
 WHERE email IN ('insp1@test', 'insp2@test');
UPDATE public.profiles SET active = true, role = 'viewer'
 WHERE email = 'viewer1@test';
UPDATE public.profiles SET unit_id = '00000000-0000-0000-0000-0000000000b2'
 WHERE email = 'adminb@test';
INSERT INTO public.ifs_objects (id, description, sece)
VALUES ('OBJ-1', 'Pump', true) ON CONFLICT DO NOTHING;
