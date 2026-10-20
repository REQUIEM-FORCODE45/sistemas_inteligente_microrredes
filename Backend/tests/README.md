# Tests de autorización del CRUD de sensores (P5)

Runner nativo, sin dependencias: `node --test` (Node ≥ 20).

## Corrida versionada (2026-10-19)

Comando (desde `Backend/`):

```
node --test tests/sensores_autorizacion.test.js
```

- Node: v20.17.0 · BD: `sistema_inteligente_db_test` (Atlas; la BD de desarrollo no se toca).
- Archivo: `sensores_autorizacion.test.js`
  sha256 `6ee951f4bc9d31bc7dcdaaefd53c6b5ea787df76957c7bd658350022fb059953`

## Salida TAP completa (exit 0)

```
TAP version 13
# \# BD de test: sistema_inteligente_db_test
# Subtest: CRUD sensores — autorizacion (P5)
    # Subtest: PATCH con status invalido -> 400 (validacion antes de tocar nada)
    ok 1 - PATCH con status invalido -> 400 (validacion antes de tocar nada)
      ---
      duration_ms: 469.495076
      ...
    # Subtest: owner: register 201 y lista blanca sincronizada
    ok 2 - owner: register 201 y lista blanca sincronizada
      ---
      duration_ms: 304.144347
      ...
    # Subtest: owner: PATCH inactive saca de la lista blanca, active la devuelve
    ok 3 - owner: PATCH inactive saca de la lista blanca, active la devuelve
      ---
      duration_ms: 828.600304
      ...
#   [optimization] Redis conectado
    # Subtest: stranger: PATCH -> 403 y DELETE -> 403, sensor intacto
    ok 4 - stranger: PATCH -> 403 y DELETE -> 403, sensor intacto
      ---
      duration_ms: 4612.977005
      ...
    # Subtest: DELETE con mapping vivo -> 409 con impact; ?force=true -> 200 con warnings
    ok 5 - DELETE con mapping vivo -> 409 con impact; ?force=true -> 200 con warnings
      ---
      duration_ms: 6449.803174
      ...
    # Subtest: DELETE archiva lecturas (_deleted_*) en vez de dropear
    ok 6 - DELETE archiva lecturas (_deleted_*) en vez de dropear
      ---
      duration_ms: 3745.090112
      ...
    1..6
ok 1 - CRUD sensores — autorizacion (P5)
  ---
  duration_ms: 18680.961764
  type: 'suite'
  ...
#   [MPC] No se pudo persistir topologia en Redis: Connection is closed.
#   [MPC] No se pudo persistir topologia en Redis: Connection is closed.
1..1
# tests 6
# suites 1
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 24200.463537
```

Notas: `Redis conectado` / `Connection is closed` son ruido del entorno (Redis
caído; el borrado no depende de él: el timeout propio de `sensorDeleteImpact`
lo declara). La limpieza `after()` dejó 0 restos (verificado por consulta).
