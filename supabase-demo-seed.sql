-- =============================================================================
-- SS-75 CMP — DEMO SEED DATA (idempotent)
-- =============================================================================
-- Run in Supabase SQL Editor. Re-run to refresh the demo data.
--
-- Adds ~25 representative corrosion inspection points across all 14 DROPS
-- zones, with a mix of priorities/SECE/overdue/upcoming dates so the
-- dashboard, risk matrix, schedule, and status chip have something to show.
-- Includes pit-depth readings (with growth) and text evidence rows.
-- No image files are uploaded — only metadata.
--
-- Every row is tagged with the sentinel "[DEMO]" at the start of `notes`.
-- The block first removes anything carrying that tag (cascading to readings,
-- evidences and history) so the script is safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_unit  uuid;
  v_admin uuid;
  v_item  uuid;
BEGIN
  -- Anchor unit and admin (used for created_by / updated_by attribution).
  SELECT id INTO v_unit FROM public.units WHERE code = 'SS-75' LIMIT 1;
  SELECT id INTO v_admin FROM public.profiles
    WHERE email = 'hyassuo@gmail.com' LIMIT 1;
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'SS-75 unit not found; run supabase-setup.sql first';
  END IF;

  -- Idempotency: drop previous demo rows. CASCADE clears children + history.
  DELETE FROM public.items WHERE notes LIKE '[DEMO]%' AND unit_id = v_unit;

  -- ── Z01 Crown Level ───────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z01', 'Crown Block - Sheave Pins & Retainers',
    'Atmospheric Corrosion', 'Special Greases / Lubricants',
    '313-A1-01', 'CROWN BLOCK', '320187442', 'UNIT/DRILL/CROWN/BLOCK',
    3, 5, 'Critical', 'Attention', true, 'Quarterly',
    CURRENT_DATE - 95, CURRENT_DATE - 5,
    '[DEMO] Surface rust on 3 of 8 sheave pins. Grease nipples blocked on pins 4 and 7.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 95,
    'Visual inspection: surface rust on sheave pins 4 and 7. No structural loss detected.');

  -- ── Z02 Crown to Monkey Board ─────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z02', 'Derrick Legs - 50ft Level Bracings',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    'UNIT/DRILL/DERRICK/50FT',
    2, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 120, CURRENT_DATE + 62,
    '[DEMO] Coating breakdown on 4 bracing members at 50ft level. Scheduled for spot painting.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 120, 1.8, 'Bracing B-04 NE face', 'Rig Inspector');

  -- ── Z03 Monkey Board ──────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z03', 'Monkey Board Platform - Grating & Handrails',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    'UNIT/DRILL/MONKEYBOARD',
    2, 2, 'Low', 'OK', false, 'Semi-annual',
    CURRENT_DATE - 40, CURRENT_DATE + 142,
    '[DEMO] Minor surface rust on handrail welds. Grating in good condition.',
    v_admin, v_admin);

  -- ── Z04 Travelling Equipment ──────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_fl, prob, cons, priority, status, sece,
    freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z04', 'Top Drive - Body & Elevator Links',
    'Atmospheric Corrosion', 'Special Greases / Lubricants',
    '313-F1', 'TOP DRIVE SYSTEM', 'UNIT/DRILL/TOPDRIVE',
    2, 5, 'High', 'OK', true, 'Quarterly',
    CURRENT_DATE - 25, CURRENT_DATE + 66,
    '[DEMO] Last inspection clear. Elevator links greased and certified.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 25,
    'Full VT completed. No active corrosion. All safety-critical connections greased and torque-checked.');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z04', 'Traveling Block - Hook & Swivel',
    'Atmospheric Corrosion', 'Special Greases / Lubricants',
    '320199001', 'UNIT/DRILL/TRAVBLOCK',
    3, 5, 'Critical', 'Attention', true, 'Quarterly',
    CURRENT_DATE - 100, CURRENT_DATE - 10,
    '[DEMO] Light rust on hook latch spring housing. Swivel body shows minor pitting.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 100, 0.5, 'Hook latch housing', 'Rig Inspector');

  -- ── Z05 BOP & Moon Pool ───────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z05', 'BOP Stack - 18-3/4in 15K',
    'H2S Corrosion (Sour Service)', 'NACE MR0175/ISO 15156',
    '313-M1', 'BLOWOUT PREVENTER', '320045678', 'UNIT/DRILL/BOP/STACK',
    2, 5, 'High', 'OK', true, 'Semi-annual',
    CURRENT_DATE - 70, CURRENT_DATE + 112,
    '[DEMO] Pre-spud inspection completed. No anomalies. DNV certificate issued.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 70,
    'Full pre-spud VT. No active corrosion. Ram seals and bonnets in good condition.');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z05', 'Moon Pool - Guide Rails & Beams',
    'Galvanic Corrosion', 'Epoxy Coating + Al-Zn-In Anodes',
    '320201334', 'UNIT/MOONPOOL/RAILS',
    3, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 130, CURRENT_DATE + 52,
    '[DEMO] Pitting corrosion identified on guide rail flanges, approx 15% surface affected.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 130, 2.1, 'Guide Rail FR-04 Port', 'Rig Inspector');

  -- ── Z06 Machinery ─────────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z06', 'Sea Water Lift Pumps - Suction Casings',
    'Erosion-Corrosion', 'Resistant Material (Duplex/316L)',
    '278-C2-01', 'SEA WATER LIFT PUMP NO.1', '320178902', 'UNIT/ENG/SWPUMP/01',
    3, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 220, CURRENT_DATE - 38,
    '[DEMO] Erosion pitting on suction casing inlet. Approaching maintenance threshold.',
    v_admin, v_admin) RETURNING id INTO v_item;
  -- Two readings showing growth -> orange rate badge in lists
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by) VALUES
    (v_item, CURRENT_DATE - 580, 1.1, 'Suction inlet 6-oclock', 'Mech. Tech'),
    (v_item, CURRENT_DATE - 220, 2.3, 'Suction inlet 6-oclock', 'Mech. Tech');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z06', 'Diesel Day Tanks - External Shell',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)', 'UNIT/ENG/DAYTANK',
    2, 2, 'Low', 'OK', false, 'Annual',
    CURRENT_DATE - 60, CURRENT_DATE + 305,
    '[DEMO] Minor surface oxidation at base welds. No through-wall defect.',
    v_admin, v_admin);

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_fl, prob, cons, priority, status, sece,
    freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z06', 'SWBT 1P - Sea Water Ballast Tank 1 Port',
    'MIC (Microbiologically Influenced)', 'Internal Epoxy Coating (PSPC)',
    '285-C1-01', 'TANK, SEA WATER BALLAST 1P', 'UNIT/TANK/BALLAST/1P',
    2, 3, 'Medium', 'OK', false, 'Every 2.5 years',
    CURRENT_DATE - 450, CURRENT_DATE + 462,
    '[DEMO] Dry dock inspection. Coating in good condition. 3 anodes replaced.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by) VALUES
    (v_item, CURRENT_DATE - 1200, 1.4, 'Bottom plate CL', 'Class Surveyor'),
    (v_item, CURRENT_DATE - 450, 1.9, 'Bottom plate CL', 'Class Surveyor');

  -- ── Z07 Deck Cranes ───────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z07', 'Portside Crane - Main Boom & Luffing Wire',
    'Atmospheric Corrosion', 'Special Greases / Lubricants',
    '112-C2-C2', 'CERTIFICATE OF CRANE SURVEY', '320204551',
    'UNIT/CRANE/PORT/BOOM',
    3, 4, 'High', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 80, CURRENT_DATE + 102,
    '[DEMO] Coating blistering on boom upper chord. Spot repairs required before next lift.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 80, 1.2, 'Boom upper chord mid-span', 'Crane Inspector');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z07', 'Starboard Crane - Slewing Ring',
    'Crevice Corrosion', 'Special Greases / Lubricants',
    'UNIT/CRANE/STBD/SLEWING',
    2, 4, 'High', 'OK', true, 'Quarterly',
    CURRENT_DATE - 20, CURRENT_DATE + 71,
    '[DEMO] Slewing ring greased and inspected. No corrosion. Seal integrity confirmed.',
    v_admin, v_admin);

  -- ── Z08 Hull / Columns / Pontoons ─────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z08', 'Hull Port Side - FR 20-40',
    'Galvanic Corrosion', 'Epoxy Coating + Al-Zn-In Anodes',
    '271-C1-01', 'HULL BOTTOM PORT SIDE', '320156789', 'UNIT/HULL/PORT/FR20-40',
    3, 4, 'High', 'Attention', true, 'Semi-annual',
    CURRENT_DATE - 210, CURRENT_DATE - 28,
    '[DEMO] Localised pitting during ROV survey. Min pit depth 3.2mm at FR-22. Priority monitoring.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by) VALUES
    (v_item, CURRENT_DATE - 760, 1.8, 'FR-22 P - pitting zone', 'J. Silva'),
    (v_item, CURRENT_DATE - 210, 3.2, 'FR-22 P - pitting zone', 'C. Mota');
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 210,
    'ROV survey: pitting 3-5mm at 4 locations FR-20 to FR-25. No critical depth yet.');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z08', 'Splash Zone Port - FR 15-45',
    'Atmospheric Corrosion', 'Splash Zone Compound',
    '20', 'HULL MATERIALS, GENERAL HULL WORK', '320162201', 'UNIT/SPLASH/PORT',
    4, 5, 'Critical', 'Critical', true, 'Semi-annual',
    CURRENT_DATE - 150, CURRENT_DATE + 32,
    '[DEMO] CRITICAL: Coating loss on 60% of Port splash zone. Active corrosion visible.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by) VALUES
    (v_item, CURRENT_DATE - 850, 0.8, 'Splash Port FR-30', 'Class Surveyor'),
    (v_item, CURRENT_DATE - 150, 3.4, 'Splash Port FR-30', 'Class Surveyor');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_obj_id, ifs_obj_desc, ifs_wo, ifs_fl, prob, cons, priority, status,
    sece, freq_insp, last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z08', 'Hull Anodes - Central Zone (45 units)',
    'Galvanic Corrosion', 'Sacrificial Anodes Al-Zn-In',
    '278-F1-01', 'CORROSION PROTECTION-ANODES', '320164001',
    'UNIT/PROT/ANODES/CENTRAL',
    3, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 145, CURRENT_DATE + 37,
    '[DEMO] 8 anodes >75% consumed in central zone. Replacement programmed for next dry dock.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 145,
    'ROV survey: 8 of 45 anodes exceed 75% consumption threshold; 22 between 40-74%.');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z08', 'Port Aft Column - External Shell',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    'UNIT/COLUMN/PORT/AFT',
    3, 3, 'Medium', 'Pending', false, 'Annual',
    CURRENT_DATE - 360, CURRENT_DATE - 5,
    '[DEMO] Inspection overdue. Awaiting ROV access window. Coating condition unknown.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 360, 0.9, 'Col Port Aft mid', 'J. Silva');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z08', 'Anchor Chain - Leg 3 (Stbd Fwd)',
    'Galvanic Corrosion', 'No Specific Protection',
    'UNIT/MOOR/CHAIN/LEG3',
    2, 5, 'High', 'OK', true, 'Annual',
    CURRENT_DATE - 200, CURRENT_DATE + 165,
    '[DEMO] Nominal 84mm. Measured 81.8mm Leg 3 Stbd Fwd. Wear within DNV tolerance.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by) VALUES
    (v_item, CURRENT_DATE - 580, 1.4, 'Leg 3 Shot 4 - link crown', 'Mooring Inspector'),
    (v_item, CURRENT_DATE - 200, 2.2, 'Leg 3 Shot 4 - link crown', 'Mooring Inspector');

  -- ── Z09 Shakers ───────────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z09', 'Shaker Screens - Poseidon #1 & #2',
    'Erosion-Corrosion', 'No Specific Protection',
    'UNIT/DRILL/SHAKER/01-02',
    2, 2, 'Low', 'OK', false, 'Quarterly',
    CURRENT_DATE - 35, CURRENT_DATE + 56,
    '[DEMO] Screen baskets showing normal wear. No structural corrosion.',
    v_admin, v_admin);

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z09', 'Mud Pit Baffles & Agitators',
    'MIC (Microbiologically Influenced)', 'Epoxy Coating (C5-M)',
    '320191220', 'UNIT/DRILL/MUDPIT',
    3, 2, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 130, CURRENT_DATE + 52,
    '[DEMO] MIC suspected on baffle plates. Biocide treatment added to mud system.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 130, 1.7, 'Baffle plate B-03 waterline', 'Rig Inspector');

  -- ── Z10 Helideck ──────────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z10', 'Helideck Surface & Safety Nets',
    'Atmospheric Corrosion', 'No Specific Protection',
    'UNIT/HELIDECK/SURFACE',
    2, 4, 'High', 'OK', true, 'Semi-annual',
    CURRENT_DATE - 140, CURRENT_DATE + 42,
    '[DEMO] Deck surface and perimeter nets in good condition. Minor rust on net brackets treated.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.evidences (item_id, evidence_date, description)
  VALUES (v_item, CURRENT_DATE - 140,
    'CAP437 inspection. Anti-slip coating 85% intact. Net brackets treated and zinc-primered.');

  -- ── Z11 Accommodation ─────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z11', 'Accommodation Module - Exterior Cladding',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    'UNIT/ACCOM/EXTERIOR',
    1, 1, 'Low', 'OK', false, 'Annual',
    CURRENT_DATE - 130, CURRENT_DATE + 235,
    '[DEMO] Overall coating in good condition. Screw fixings show minor rust.',
    v_admin, v_admin);

  -- ── Z12 Lifeboats / Davits ────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z12', 'Lifeboat Davits - Port & Stbd',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    'UNIT/SAFETY/DAVIT/PORT-STBD',
    2, 5, 'High', 'OK', true, 'Semi-annual',
    CURRENT_DATE - 90, CURRENT_DATE + 92,
    '[DEMO] Annual load test completed. Davit arms and falls in good condition.',
    v_admin, v_admin);

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z12', 'TEMPSC Hulls - External Paint',
    'Atmospheric Corrosion', 'Epoxy Coating (C5-M)',
    '320193445', 'UNIT/SAFETY/TEMPSC/HULL',
    3, 4, 'High', 'Attention', true, 'Semi-annual',
    CURRENT_DATE - 150, CURRENT_DATE - 32,
    '[DEMO] Both TEMPSCs show coating degradation on lower hull. Repainting required before next survey.',
    v_admin, v_admin);

  -- ── Z13 Main Deck ─────────────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z13', 'Main Deck - Pipe Rack Area',
    'Atmospheric Corrosion', 'No Specific Protection',
    'UNIT/DECK/MAIN/PIPERACK',
    2, 2, 'Low', 'OK', false, 'Annual',
    CURRENT_DATE - 100, CURRENT_DATE + 265,
    '[DEMO] Good condition overall. Minor rust staining under pipe support shoes.',
    v_admin, v_admin);

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z13', 'Drain System - Deck Scuppers & Headers',
    'MIC (Microbiologically Influenced)', 'Epoxy Coating (C5-M)',
    '320185667', 'UNIT/DECK/DRAIN/SCUPPERS',
    3, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 180, CURRENT_DATE - 5,
    '[DEMO] MIC detected in drain headers near moon pool. Biocide treatment applied.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 180, 1.9, 'Header pipe NE corner', 'Rig Inspector');

  -- ── Z14 ROV / Third Party ─────────────────────────────────────────────────
  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_wo, ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z14', 'ROV Garage - A-Frame & Launch Rails',
    'Galvanic Corrosion', 'Epoxy Coating + Al-Zn-In Anodes',
    '320196112', 'UNIT/SUBSEA/ROV/AFRAME',
    3, 3, 'Medium', 'Attention', false, 'Semi-annual',
    CURRENT_DATE - 125, CURRENT_DATE + 57,
    '[DEMO] Galvanic corrosion at dissimilar metal contact between stainless and carbon steel.',
    v_admin, v_admin) RETURNING id INTO v_item;
  INSERT INTO public.readings (item_id, reading_date, depth_mm, location, checked_by)
  VALUES (v_item, CURRENT_DATE - 125, 1.6, 'Launch rail contact point S', 'ROV Tech');

  INSERT INTO public.items (unit_id, zone_id, name, mechanism, protection,
    ifs_fl, prob, cons, priority, status, sece, freq_insp,
    last_insp, next_insp, notes, created_by, updated_by)
  VALUES (v_unit, 'Z14', 'Subsea Control Module - Umbilical Termination',
    'Crevice Corrosion', 'No Specific Protection',
    'UNIT/SUBSEA/SCM/UMBILICAL',
    2, 5, 'High', 'OK', true, 'Semi-annual',
    CURRENT_DATE - 130, CURRENT_DATE + 52,
    '[DEMO] ROV inspection. Umbilical termination in good condition.',
    v_admin, v_admin);
END $$;

-- Quick check
SELECT zone_id, count(*)
FROM public.items
WHERE notes LIKE '[DEMO]%'
GROUP BY zone_id
ORDER BY zone_id;
