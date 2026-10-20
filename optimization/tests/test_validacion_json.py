# -*- coding: utf-8 -*-
"""Todos los .json de integracion_plataforma/validacion tienen que parsear.

Precedente: v1_bandc/resultado.json llego con una coma doble (char 472) y
ninguna lectura automatica podia abrirlo; lo detecto una auditoria a mano.
Este test lo detecta en CI. MANIFEST.md no se verifica aqui (no es JSON).
"""
from __future__ import annotations

import glob
import json
import os

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


def _jsons_validacion() -> list[str]:
    patron = os.path.join(REPO, "integracion_plataforma", "validacion", "**", "*.json")
    return sorted(glob.glob(patron, recursive=True))


def test_hay_json_de_validacion():
    assert _jsons_validacion(), "sin .json en integracion_plataforma/validacion"


def test_todos_los_json_parsean():
    mal = []
    for p in _jsons_validacion():
        try:
            with open(p, encoding="utf-8") as fh:
                json.load(fh)
        except (json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
            mal.append(f"{os.path.relpath(p, REPO)}: {e}")
    assert not mal, "JSON rotos en validacion/:\n" + "\n".join(mal)
