-- Dual-stack agent roster
-- Aloware IDs: Admin → Users (Inbound Callbacks ring group, verified Jul 2026)

INSERT INTO agents (name, agent_id_aloware, platform, ring_group, team, email) VALUES
  ('Cristian Cruz', '121460', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL),
  ('Clark Nelson', '121487', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL),
  ('Grant Mitchell', '121596', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL),
  ('Trevor Major', '123622', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL),
  ('Catherine Beck', '123641', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL),
  ('Mike Castaneda', '116174', 'aloware', 'Inbound Callbacks', 'inbound_closers', 'miguelsanpancho973@gmail.com'),
  ('Jonathan Mcgowan', '123642', 'aloware', 'Inbound Callbacks', 'inbound_closers', NULL)
ON CONFLICT ON CONSTRAINT agents_agent_id_aloware_key DO UPDATE SET
  name = EXCLUDED.name,
  ring_group = EXCLUDED.ring_group,
  team = EXCLUDED.team,
  email = COALESCE(EXCLUDED.email, agents.email);

INSERT INTO agents (name, agent_id_8x8, platform, ring_group, team) VALUES
  ('Marvin', '1026', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Yesenia Santos', '1019', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Bertha', '1017', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Amelia', '1018', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Magali Salazar', '1020', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Tori Jai', '1016', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Marc', '1010', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Tammy', '1011', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Ryan', '1012', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Denis', '1015', '8x8', '8x8 Closers RG', '8x8_closer'),
  ('Verification Team', '1014', '8x8', 'Verification', 'verification'),
  ('Customer Success', '1013', '8x8', 'CS', 'cs')
ON CONFLICT ON CONSTRAINT agents_agent_id_8x8_key DO UPDATE SET
  name = EXCLUDED.name,
  ring_group = EXCLUDED.ring_group,
  team = EXCLUDED.team;
