# -*- coding: utf-8 -*-
"""Manifiestos de reference/: la evidencia versionada no cambia sin aviso.

Recorre integracion_plataforma/cambio_*/reference/README.md, parsea SOLO las
tablas bajo el header exacto `| archivo | bytes | sha256 |` y falla si el
sha256 del archivo no empieza por el declarado o el tamano no cuadra
(22 manifiestos OK tras la auditoria del 14; el historial vive en git).

Comparacion por PREFIJO (minimo 16 hex): el paquete legacy del cambio 05
documenta "sha256 (prefijo de 16 hex)". Los manifiestos nuevos (12-16) usan
sha256 completo (64 hex) y asi se verifican enteros.

Limitacion conocida: en Windows con core.autocrlf=true el disco puede diferir
del blob LF en archivos de texto (misma nota de los manifiestos); la
verificacion canonica ahi es `git show HEAD:<path> | sha256sum`. En este repo
(LF) disco y blob coinciden.
"""
from __future__ import annotations

import glob
import hashlib
import os
import re

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
HEADER = re.compile(r"^\|\s*archivo\s*\|\s*bytes\s*\|\s*sha256\s*\|\s*$")
ROW = re.compile(r"^\|")
HEX = re.compile(r"`([0-9a-fA-F]+)`")


def _filas_manifiesto(md_path: str) -> list:
    """(relpath, bytes, declarado) de las tablas de manifiesto del README."""
    filas = []
    lines = open(md_path, encoding="utf-8").read().splitlines()
    i = 0
    while i < len(lines):
        if HEADER.match(lines[i]):
            j = i + 2  # salta el separador |---|...
            while j < len(lines) and ROW.match(lines[j]):
                cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
                if len(cells) >= 3:
                    pm = re.search(r"`([^`]+)`", cells[0])
                    hm = HEX.search(cells[2])
                    if pm and hm:
                        filas.append((pm.group(1),
                                      int(cells[1].replace(" ", "").replace("\u00a0", "")),
                                      hm.group(1).lower()))
                j += 1
            i = j
        else:
            i += 1
    return filas


def test_manifiestos_reference_verifican():
    patron = os.path.join(REPO, "integracion_plataforma", "cambio_*",
                          "reference", "README.md")
    leidos = sorted(glob.glob(patron))
    assert leidos, "sin reference/README.md: el glob no matchea nada"
    mal, total = [], 0
    for md in leidos:
        base = os.path.dirname(md)
        for rel, tam, declarado in _filas_manifiesto(md):
            total += 1
            ruta = os.path.normpath(os.path.join(base, rel))
            if not os.path.exists(ruta):
                mal.append(f"{rel}: NO EXISTE (desde {md})")
                continue
            crudo = open(ruta, "rb").read()
            real = hashlib.sha256(crudo).hexdigest()
            if len(declarado) < 16 or not real.startswith(declarado):
                mal.append(f"{rel}: hash declarado {declarado} != sha256 {real[:16]}...")
            if len(crudo) != tam:
                mal.append(f"{rel}: bytes declarados {tam} != reales {len(crudo)}")
    assert total >= 10, f"solo {total} filas: el parser dejo de matchear"
    assert not mal, "manifiestos rotos:\n" + "\n".join(mal)
