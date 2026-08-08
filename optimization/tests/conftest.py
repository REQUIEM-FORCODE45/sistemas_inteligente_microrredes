# -*- coding: utf-8 -*-
"""Config de pytest para el paquete optimization/.
Asegura que la raiz del repo este en sys.path para permitir
`import optimization.xxx` (igual que los scripts python3 que corren Node).
"""
import os
import sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Queremos ejecutar tests sin red (sin llamar a Open-Meteo/Mongo).
# Se controla con la opcion --live / env OFF_OFFLINE=1 (ver conftest parcial).