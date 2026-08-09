# -*- coding: utf-8 -*-
"""Tests del MatlabPredictor: anclaje a la HORA ACTUAL (desplazamiento ciclico)."""
from __future__ import annotations

import numpy as np
import pytest

from optimization.prediction.matlab_predictor import MatlabPredictor


class FakeMatlabPredictor(MatlabPredictor):
    """Predictor con arrays sinteticos de 24h (evita leer los .mat reales)."""

    def __init__(self, hour: int = 0):
        super().__init__()
        self._hour = hour
        self._loaded = True
        self._irradiancia = np.arange(24, dtype=float)
        self._pl1 = np.arange(24, dtype=float) + 100.0
        self._pl2 = np.zeros(24)
        self._pl3 = np.zeros(24)

    @classmethod
    def _current_hour(cls) -> int:
        # override con la hora fijada en la instancia
        inst = cls
        return inst._fake_hour

    @classmethod
    def _shift_to_now(cls, values):
        if values is None or len(values) == 0:
            return values
        return np.roll(values, -int(cls._fake_hour))


def make_predictor(hour: int):
    p = FakeMatlabPredictor(hour=hour)
    FakeMatlabPredictor._fake_hour = hour
    return p


def test_shift_hora_cero_no_mueve():
    p = make_predictor(0)
    solar = p.predict_solar(4)
    assert solar == [0.0, 1.0, 2.0, 3.0]


def test_shift_hora_14_empieza_en_la_hora_actual():
    p = make_predictor(14)
    solar = p.predict_solar(4)
    # np.roll con -14: el elemento 14 pasa a la posicion 0 (arranca en hora 14)
    assert solar == [14.0, 15.0, 16.0, 17.0]


def test_shift_hora_14_en_load():
    p = make_predictor(14)
    loads = p.predict_load(2)
    assert loads[0]["PL1"] == 114.0  # pl1[14] = 14 + 100
    assert loads[1]["PL1"] == 115.0


def test_shift_envuelve_fin_de_dia():
    p = make_predictor(23)
    solar = p.predict_solar(3)
    # hora 23 -> sigue 0, 1 (ciclico)
    assert solar == [23.0, 0.0, 1.0]
