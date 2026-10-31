-- The backend (secret key → service_role) writes every table. Supabase grants this by default, but a
-- project created with "automatically expose new tables" off does not, so grant it explicitly.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
