# -*- coding: utf-8 -*-
"""Invariante del protocolo unico (auditoria 2a ronda, item 3c).

La copia ejecutable optimization/tests/medir_cobertura_banda.py debe ser
IDENTICA a reference/scripts/medir_cobertura_banda_v2.py (la version vigente).
Si divergen, este test FALLA para que no se cuele en silencio.
Comparacion por sha256 normalizando CRLF (el checkout puede convertir).
"""
from __future__ import annotations

import hashlib
from pathlib import Path


def _norm(p: Path) -> bytes:
    return p.read_bytes().replace(b"\r\n", b"\n")


def test_protocolo_v2_identico():
    root = Path(__file__).resolve().parents[2]
    ref = root / "integracion_plataforma" / "cambio_06_banda_conformal" \
        / "reference" / "scripts" / "medir_cobertura_banda_v2.py"
    exe = root / "optimization" / "tests" / "medir_cobertura_banda.py"
    assert ref.exists(), f"falta {ref}"
    assert exe.exists(), f"falta {exe}"
    h_ref = hashlib.sha256(_norm(ref)).hexdigest()
    h_exe = hashlib.sha256(_norm(exe)).hexdigest()
    assert h_ref == h_exe, (
        f"protocolo divergido: reference v2 {h_ref[:16]} != tests {h_exe[:16]}")


def test_protocolo_v1_congelada():
    root = Path(__file__).resolve().parents[2]
    ref = root / "integracion_plataforma" / "cambio_06_banda_conformal" \
        / "reference" / "scripts" / "medir_cobertura_banda.py"
    assert ref.exists(), f"falta {ref}"
    h = hashlib.sha256(_norm(ref)).hexdigest()
    assert h == "30015a85be596e63e5de96f4e2be3c829a7d90b2582db3d141de6ccf76643c5d", (
        f"la v1 fue modificada: {h[:16]} (regla dura 3: nunca sobrescribir)")


def test_json_v2_declara_protocolo(tmp_path):
    import json
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[2]
    out = tmp_path / "cob.json"
    # --help no toca red ni Mongo: verifica que la v2 acepta --split.
    r = subprocess.run([sys.executable, str(root / "optimization" / "tests"
                        / "medir_cobertura_banda.py"), "--help"],
                       capture_output=True, text=True, timeout=60)
    assert "--split" in r.stdout
