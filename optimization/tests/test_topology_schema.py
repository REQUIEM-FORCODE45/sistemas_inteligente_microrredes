# -*- coding: utf-8 -*-
"""Cambio 12.1/12.3 — invariante del esquema: cada tipo del esquema es
reconocido por el solver (o declarado soportado:false con motivo)."""
from __future__ import annotations

from optimization.solver.model_builder import load_topology_schema


def test_schema_tipos_reconocidos():
    from optimization.solver import model_builder as mb
    import inspect
    schema = load_topology_schema()
    src = inspect.getsource(mb)
    for tipo, spec in schema.items():
        if tipo in ("version", "nota"):
            continue
        if isinstance(spec, dict) and spec.get("soportado") is False:
            assert spec.get("motivo"), f"{tipo}: soportado:false sin motivo"
            continue
        assert isinstance(spec, dict) and "params" in spec, f"{tipo}: sin params"
        # el solver debe mencionar el tipo (o su familia) en el codigo
        familia = {"solar_panel_ac": "solar", "wind_turbine": "wind"}.get(tipo, tipo)
        assert familia in src, f"{tipo}: el solver no lo reconoce"


def test_schema_inverter_sensor_declarados():
    schema = load_topology_schema()
    assert schema["inverter"]["soportado"] is False
    assert schema["inverter"]["motivo"]
    assert schema["sensor_iot"]["soportado"] is False
    assert schema["sensor_iot"]["motivo"]
