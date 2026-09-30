# PLAN — CAPA GRÁFICA DEL SISTEMA EVOLUTIVO
### Que se vea POR QUÉ decide lo que decide: ONI, índices climáticos, radiación y la rúbrica

> Estado: **propuesta, sin implementar**. Nace de una observación del autor: el motor de
> escenarios funciona pero **es invisible** — vive en `reports/evolutivo/escenarios_72h.json`.
> Nada muestra el ONI, el modo climático, ni cómo el clima cambia la decisión.

---

## 0. El problema, en una frase

Hoy el sistema evolutivo existe **solo como programación**: un JSON con números. Si el clima
cambia (El Niño ↔ La Niña), la rúbrica **cambia sus pesos** — pero eso no se ve en ninguna
parte. Sin una capa gráfica, esa parte central de la tesis queda indocumentada y no se puede
defender ante un jurado ni mostrar a un operador.

---

## 1. Principio de diseño: cada figura responde UNA pregunta

| bloque | pregunta | quién lo mira |
|---|---|---|
| **A. Contexto climático** | ¿**POR QUÉ** el sistema decide así hoy? | jurado / operador |
| **B. Estado y pronóstico** | ¿**QUÉ SABEMOS** del futuro inmediato y con cuánta incertidumbre? | operador |
| **C. La decisión** | ¿**QUÉ HACEMOS** y qué consecuencia tiene? | operador / jurado |
| **D. El bucle** (futuro) | ¿**APRENDIMOS**? ¿lo que dijimos se cumplió? | jurado |

Regla: **títulos cortos**, español, y cada figura citable en el manuscrito (numerada, con su
fuente de datos al pie).

---

## 2. Las figuras propuestas

### Bloque A — Contexto climático (el "por qué")

| # | figura | mensaje que debe transmitir | fuente | esfuerzo |
|---|---|---|---|---|
| **A1** | **Serie del ONI** (1950→hoy) con las bandas ±0.5, el modo vigente marcado y un recuadro con el valor actual | El sistema opera **dentro de un régimen climático**, no en el vacío | CPC/NOAA (ASCII) ✅ | bajo |
| **A2** | **Mapa esquemático del Pacífico** con las 4 cajas Niño (1+2, 3, 3.4, 4) **coloreadas por su anomalía real** | De qué **sabor** es el evento: el Niño 1+2 (costero, el que toca a Nariño) vs 3.4 (el canónico) | CPC/NOAA ✅ | bajo |
| **A3** | **Panel de índices**: ONI · SOI · Niño3.4 · PDO (24–36 meses, sparklines + clasificación en color) | Los índices **no van siempre juntos** (hoy: ONI +1.8 con PDO −1.5) → no se puede mirar uno solo | CPC + NCEI ✅ | bajo |
| **A4** | **El puente** 🔑: ciclo anual de **nubosidad/GHI en Pasto separado por modo ONI** (Niño / Niña / neutral), 1940–2024 | **La prueba empírica** de que el modo cambia la radiación del sitio — justifica que los pesos cambien | ERA5 (Open-Meteo archive) ✅ | medio |
| **A5** | **Mapa de radiación del suroccidente colombiano**: GHI medio anual en rejilla 0.5° (lat 0–3, lon −79 a −75) + marcador del sitio | **Dónde está Pasto** en el mapa solar de la región (y por qué 79% de nubosidad importa) | NASA POWER (rejilla punto a punto) ✅ | medio |
| **A6** | **Tendencia (cambio climático)**: temperatura, GHI y nubosidad del sitio 1940→2024 con su pendiente por década | El clima **no solo oscila, también deriva** → los pesos deben adaptarse en décadas, no solo en años | ERA5 ✅ | bajo |

### Bloque B — Estado y pronóstico (el "qué sabemos")

| # | figura | mensaje | fuente | esfuerzo |
|---|---|---|---|---|
| **B1** | **Cono de pronóstico 72 h**: PV (o GHI) P50 con banda **P10–P90** sombreada + el real si ya ocurrió | La incertidumbre es un **dato**, no un estorbo: justifica la evaluación robusta | iTransformer/MOS ✅ | bajo |
| **B2** | El **mismo día bajo los 3 modos** (o las 3 bandas típicas por modo) | Cuánto cambia el escenario según el régimen | histórico ✅ | medio |

### Bloque C — La decisión (el "qué hacemos")

| # | figura | mensaje | fuente | esfuerzo |
|---|---|---|---|---|
| **C1** | **Scoreboard de estrategias**: barras de `U_robusta`, descalificadas en gris con el **motivo** (nº de violaciones) | Se ve el **juez en acción**: no solo quién gana, también quién queda fuera y por qué | motor ✅ | bajo |
| **C2** | **Desglose de la rúbrica**: barras apiladas de las componentes (costo diésel · corte · penalización SoC · ciclos) por estrategia, y **los pesos del modo vigente** al lado | Deja ver **qué está premiando el modo climático hoy** — el corazón del sistema evolutivo | motor ✅ | bajo |
| **C3** | **Despacho 72 h de la ganadora**: áreas apiladas (PV, BESS±, diésel) + demanda + línea de **SoC** con piso/techo y la banda de la estrategia | La decisión convertida en **plan operativo** | motor ✅ | medio |
| **C4** | **El acta sellada**: tarjeta con hash, fecha, modo, estrategia, U y pronóstico usado | La **novedad de la tesis** hecha imagen: decisión auditable e inmutables | bucle (futuro) | bajo |

### Bloque D — El bucle (cuando exista)

**D1** predicho vs real a 24/72 h · **D2** evolución de los pesos de la rúbrica en el tiempo.

---

## 3. Fuentes de datos — VERIFICADAS HOY (no supuestas)

| dato | endpoint | estado | valor de hoy |
|---|---|---|---|
| ONI | `cpc.ncep.noaa.gov/data/indices/oni.ascii.txt` | ✅ 200 | **JJA 2026 = +1.80** |
| Niño 1+2 / 3 / 3.4 / 4 | `.../ersst5.nino.mth.91-20.ascii` | ✅ 200 | **1+2 = +2.82** (jun-2026) |
| SOI | `cpc.ncep.noaa.gov/data/indices/soi` | ✅ 200 | disponible |
| PDO | `ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.pdo.dat` | ✅ 200 | dic-2025 = **−0.96** |
| Radiación y nubosidad (rejilla) | NASA POWER `temporal/climatology/point` | ✅ 200 | Pasto: **4.03 kWh/m²/día · 79.4% nubes** |
| Serie larga del sitio (A4/A6) | Open-Meteo ERA5 archive (1940→) | ✅ 200 | ya en uso |

**Hallazgo que cambia el orden de las cosas**: hoy el ONI está en **+1.80 (El Niño)**, con
Niño 1+2 en **+2.82** (sabor Pacífico oriental, el que más influye en Nariño) y el **PDO en
negativo**. Es decir: el modo del motor **no es un ejemplo de laboratorio, es el régimen vivo**
— y la tesis puede decirlo con la fecha en la mano.

---

## 4. Formatos de entrega (dos, del mismo JSON)

1. **Figuras PNG** para el manuscrito: estilo de tesis, títulos cortos, fuente al pie.
2. **Dashboard HTML autocontenido** para la defensa y la plataforma: figuras en **SVG embebido**
   + JS mínimo, **sin CDN** → funciona offline, se puede abrir solo y se puede incrustar en el
   panel del director de la plataforma.

**Una sola fuente de verdad**: las dos salen del acta (`reports/evolutivo/acta_*.json`). Nada
se dibuja con números escritos a mano.

---

## 5. ¿Dónde vive?

- **En este proyecto** (tesis): las figuras + el dashboard.
- **En tu repo** (plataforma): solo cuando el diseño esté cerrado → `cambio_05_*`
  (servicio de escenarios) y `cambio_06_*` (nodo director). **No se toca nada hoy.**

---

## 6. Incrementos propuestos (en este orden)

| # | entregable | incluye |
|---|---|---|
| **I1** | `scripts/descargar_indices.py` + **A1 + A3** | ONI/SOI/Niño/PDO a parquet local (cacheado) + figuras de series |
| **I2** | **A2 + A5** | mapa esquemático del Pacífico (cajas Niño) + mapa de radiación regional |
| **I3** | **A4 + A6** | el puente empírico ONI↔nubosidad en Pasto + tendencias (cambio climático) |
| **I4** | **C1 + C2** | scoreboard + desglose de la rúbrica (con los pesos del modo) |
| **I5** | **C3 + B1** | despacho 72 h + cono de pronóstico |
| **I6** | **Dashboard HTML** | integra todo, autocontenido, para defensa y plataforma |
| **I7** | *(después)* ventanas históricas + **C4/D1/D2** | el volteado del bucle evolutivo |

---

## 7. Lo que NO propongo (y por qué)

- **Mapas de SST "puros" desde NetCDF crudo** (OISST/ERSST): pesados, con dependencias y
  **sin valor adicional** para la tesis → mejor el esquemático data-driven + el mapa oficial
  de contexto con atribución.
- **Cartopy / líneas de costa**: dependencia innecesaria; el esquemático de cajas no las necesita.
- **Tocar el repo** o cambiar el motor: esta fase es **solo capa gráfica y de datos**.

---

## 8. Hipótesis a VERIFICAR (no a afirmar)

> **H**: el modo ONI cambia la nubosidad/radiación en Pasto de forma medible.

**No la doy por cierta**: en los Andes de Nariño el signo de la respuesta a ENSO es
discutido (la vertiente Pacífica suele responder distinto al interior andino). La figura **A4
es precisamente el experimento que la mide**. Si el efecto resulta débil o con signo
contrario a lo esperado, **ese es el resultado** y los pesos de la rúbrica deben fundarse en
lo medido, no en lo heredado. (Regla del autor: *nada de intuir*.)

---

## 9. Decisiones que necesito del autor

1. **¿Un archivo por bloque o un solo dashboard que crece?** (propongo: las dos cosas en
   paralelo — las figuras sueltas para el manuscrito y el dashboard que las integra).
2. **¿La ventana de prueba sigue siendo 2024-05 (La Niña) o añado una ventana por modo**
   (una Niña, una neutral, una Niño) para que el cambio del modo **se vea** comparado?
3. **¿La figura del puente (A4) va por nubosidad, por GHI, o por ambas?** (propongo ambas,
   nubosidad como principal porque es la que gobierna el desempeño del PV).
