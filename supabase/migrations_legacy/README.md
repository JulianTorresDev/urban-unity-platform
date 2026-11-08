# Migraciones archivadas

Historial de migraciones anteriores al 7 de noviembre de 2026. **No se ejecutan**: la base se crea con
`supabase/migrations/20261107120000_esquema_inicial.sql` y `supabase/seed.sql`.

Se conservan como referencia y por dos usos:

- `20261011_master_database_update.sql` y `20261011_receipts_and_branding_update.sql` forman el esquema
  "antes" con el que `npm run test:db:baseline` mide los fallos que se corrigieron.
- `20261107000000_security_hardening.sql` actualiza una base creada con el esquema viejo sin borrar datos.
