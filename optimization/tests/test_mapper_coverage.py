# -*- coding: utf-8 -*-
"""Cambio 12.2 — invariante de cobertura del mapper (PRUEBA DE FUEGO).

Todo param de defaultParams tiene camino al job (el mapper lo usa) O figura
en PARAMS_SOLO_UI con su motivo. Si se anade una clave a un defaultParams sin
mapearla ni declararla, este test FALLA.
"""
from __future__ import annotations

import json
import os
import re

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DT = os.path.join(REPO, "Frontend", "GestionFront", "src", "Dashboard",
                  "components", "diagram", "constants", "deviceTypes.js")
PANEL = os.path.join(REPO, "Frontend", "GestionFront", "src", "Dashboard",
                     "components", "diagram", "DiagramOptimizationPanel.jsx")
SCHEMA = os.path.join(REPO, "optimization", "solver", "topology_schema.json")


def _read(p):
    with open(p, "r", encoding="utf-8") as fh:
        return fh.read()


def _default_params(src):
    """{deviceType: [keys]} desde los bloques defaultParams."""
    out, cur, depth = {}, None, 0
    in_block = False
    for line in src.splitlines():
        m = re.match(r"\s*\[DEVICE_TYPE\.(\w+)\]:\s*\{", line)
        if m and not in_block:
            cur = m.group(1)
        if cur and re.search(r"defaultParams:\s*\{", line):
            in_block = True
            depth = 0
            out[cur] = []
            continue
        if in_block:
            depth += line.count("{") - line.count("}")
            km = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", line)
            if km and depth >= 0:
                out[cur].append(km.group(1))
            if re.match(r"\s*\},?\s*$", line) and depth <= 0:
                in_block = False
                cur = None
    return out


def _mapper_bodies(src):
    """{deviceType: cuerpo} de TOPOLOGY_MAPPERS (=> {..} o => ({..}))."""
    out = {}
    for m in re.finditer(r"\[DEVICE_TYPE\.(\w+)\]:\s*\([^)]*\)\s*=>\s*\(?\{", src):
        start = m.end() - 1
        depth = 0
        i = start
        while i < len(src):
            if src[i] == "{":
                depth += 1
            elif src[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        out[m.group(1)] = src[start:i + 1]
    return out


def _solo_ui(src):
    m = re.search(r"PARAMS_SOLO_UI\s*=\s*\{([^}]*)\}", src, re.S)
    out = {}
    if not m:
        return out
    for k, v in re.findall(r"['\"]([\w.]+)['\"]\s*:\s*['\"]([^'\"]+)['\"]", m.group(1)):
        out[k] = v
    return out


def _device_values(src):
    """{CONST: valor} del bloque DEVICE_TYPE."""
    m = re.search(r"export const DEVICE_TYPE\s*=\s*\{([^}]*)\}", src, re.S)
    out = {}
    if not m:
        return out
    for k, v in re.findall(r"(\w+)\s*:\s*['\"]([^'\"]+)['\"]", m.group(1)):
        out[k] = v
    return out


def test_mapper_coverage():
    dt = _read(DT)
    panel = _read(PANEL)
    solo = _solo_ui(dt)
    assert solo, "PARAMS_SOLO_UI ausente en deviceTypes.js"
    for v in solo.values():
        assert v.strip(), "PARAMS_SOLO_UI con motivo vacio"
    params = _default_params(dt)
    assert params, "no se extrajo ningun defaultParams"
    values = _device_values(dt)
    mappers = _mapper_bodies(panel)
    faltan = []
    for dev, keys in params.items():
        tipo = values.get(dev, dev)
        body = mappers.get(dev, "")
        for k in keys:
            if f"params.{k}" in body:
                continue
            if f"{tipo}.{k}" in solo:
                continue
            faltan.append(f"{tipo}.{k}")
    assert not faltan, f"params sin camino al job ni motivo: {faltan}"


def _solver_type(src, dev):
    """solverType del bloque DEVICE_DEFINITIONS (None si no modelado)."""
    m = re.search(r"\[DEVICE_TYPE\." + dev + r"\]:\s*\{", src)
    if not m:
        return None
    start = m.end() - 1
    depth, i = 0, start
    while i < len(src):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    sm = re.search(r"solverType:\s*['\"]([^'\"]+)['\"]", src[start:i + 1])
    return sm.group(1) if sm else None


def _balanced(src, start):
    """Devuelve el literal {...} balanceado desde start (que es '{')."""
    depth, i = 0, start
    while i < len(src):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    return src[start:]


def _top_keys(literal):
    """Claves de nivel 1 de un literal {...} (con { inicial)."""
    out, buf, d = set(), "", 0
    for c in literal[1:]:
        if c == "{":
            d += 1
            buf += c
        elif c == "}":
            if d == 0:
                break
            d -= 1
            buf += c
        elif c == "," and d == 0:
            km = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", buf)
            if km:
                out.add(km.group(1))
            buf = ""
        else:
            buf += c
    km = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", buf)
    if km:
        out.add(km.group(1))
    return out


def _output_keys(body):
    """Claves del payload que el mapper emite (literal + out.X)."""
    keys = set(re.findall(r"\bout\.([A-Za-z_][A-Za-z0-9_]*)\s*=", body))
    for m in list(re.finditer(r"return\s*\(?\s*\{", body)) \
            + list(re.finditer(r"const\s+out\s*=\s*\{", body)):
        keys |= _top_keys(_balanced(body, m.end() - 1))
    # flecha concisa: el cuerpo ES el literal
    if "return" not in body and "const out" not in body:
        keys |= _top_keys(_balanced(body, body.index("{")))
    return keys


# Claves que el solver aporta por defecto (documentadas en el esquema).
FUERA_DEL_MAPPER = {
    "export_tariff": "default del solver 0.0",
    "ens_penalty_cop_kwh": "default del solver 5000.0",
}


def test_mapper_output_contra_schema():
    """Contrato (auditoria C2): el payload del mapper cubre los params del
    esquema para su solverType. LIMITACION DECLARADA: no verifica la semantica
    del mapeo (p. ej. maxCapacity/1000 -> max_kw), solo la presencia de claves.
    """
    schema = json.load(open(SCHEMA, encoding="utf-8"))
    dt = _read(DT)
    panel = _read(PANEL)
    mappers = _mapper_bodies(panel)
    faltan = []
    for dev, body in mappers.items():
        stype = _solver_type(dt, dev)
        if not stype:
            continue
        spec = schema.get(stype, {})
        want = set((spec.get("params") or {}).keys()) - set(FUERA_DEL_MAPPER)
        got = _output_keys(body)
        for k in sorted(want - got):
            faltan.append(f"{dev}: esquema pide '{k}' y el payload no lo trae")
    assert not faltan, faltan


def test_solo_ui_contra_schema():
    schema = json.load(open(SCHEMA, encoding="utf-8"))
    dt = _read(DT)
    solo = _solo_ui(dt)
    # todo tipo no soportado debe tener sus params declarados
    params = _default_params(dt)
    values = _device_values(dt)
    for dev, keys in params.items():
        tipo = values.get(dev, dev)
        spec = schema.get(tipo)
        if isinstance(spec, dict) and spec.get("soportado") is False:
            for k in keys:
                assert f"{tipo}.{k}" in solo, \
                    f"{tipo}.{k}: tipo sin modelo y param sin motivo"
