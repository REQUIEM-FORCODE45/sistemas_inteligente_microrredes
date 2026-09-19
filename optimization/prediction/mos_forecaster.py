# -*- coding: utf-8 -*-
"""MOS — corrector LightGBM sobre NWP ECMWF + feature v1 del iTransformer.

FASE 1 (sin reentrenamiento): los 10 modelos `.txt` y el checkpoint
`modelo_b.pt` vienen ya entrenados del paquete
`integracion_plataforma/cambio_01_mos_forecaster/` (ver SPEC_MOS_FASE1.md).

Contrato: igual que PatchTST (serie central P50, 10 WEATHER_VARIABLES en
orden, índice tz-aware America/Bogota, horizonte máx 72 h). Solo se expone la
serie central; la incertidumbre la añade después la capa de calibración.

Advertencia metodológica: ERA5 (verdad de calibración) y ECMWF (entrada) son
de la MISMA FAMILIA → el MAE es optimista. Reportar como "pronóstico NWP
corregido con ML", nunca como "ML puro".

Decisión de diseño (SPEC §3.5): `cloud_cover` y `precipitation` son
PASS-THROUGH del NWP en vivo (el MOS no las mejora y precipitación no tiene
señal física: proxy constante 0.0). No introducir una regresión silenciosa.

Sin fuga de datos: `pers_h24` y `v1` solo usan información pasada
(misma hora del día anterior del contexto; iTransformer sobre contexto
terminado en anchor-1h).
"""
from __future__ import annotations

import logging
import time

import numpy as np
import pandas as pd

from optimization.prediction.forecaster import ClimateForecaster, ClimateForecast
from optimization.weather.openmeteo import OpenMeteoClient, WEATHER_VARIABLES

logger = logging.getLogger(__name__)

# TRANSFORMS correcto (hardcodeado en reference/prediccion_en_vivo.py).
# NO usar el campo TRANSFORMS de config_modelos.json: está corrupto (dicts
# serializados como listas de claves).
_TRANSFORMS = {
    "shortwave_radiation": {"type": "divide", "denom": "ghi_toa"},
    "direct_normal_irradiance": {"type": "divide", "denom": "sin_elev"},
    "diffuse_radiation": {"type": "divide", "denom": "ghi_toa"},
    "temperature_2m": {"type": "anomaly"},
    "relative_humidity_2m": {"type": "anomaly"},
    "cloud_cover": {"type": "anomaly"},
    "wind_speed_100m": {"type": "anomaly"},
    "wind_speed_10m": {"type": "anomaly"},
    "surface_pressure": {"type": "anomaly"},
    "precipitation": {"type": "none"},
}
_PROXY = {
    "shortwave_radiation": "ghi", "direct_normal_irradiance": "ghi",
    "diffuse_radiation": "ghi", "temperature_2m": "temp",
    "relative_humidity_2m": "rh", "cloud_cover": "nubes",
    "wind_speed_100m": "viento", "wind_speed_10m": "viento",
    "surface_pressure": "pres", "precipitation": "ghi",
}
_PROXY_SCALE = {"wind_speed_100m": 1.3, "precipitation": 0.0}
# Variables que el MOS no mejora: pass-through del NWP (SPEC §3.5).
_PASS_THROUGH = ("cloud_cover", "precipitation")
_FEAT_NAMES = ["proxy_ecmwf", "v1", "pers_h24", "ghi_toa", "hora",
               "nubes_ecmwf", "temp_ecmwf", "viento_ecmwf"]
# ECMWF en vivo: variables pedidas -> tag de proxy/feature.
_ECMWF_COLS = {"shortwave_radiation": "ghi", "cloud_cover": "nubes",
               "temperature_2m": "temp", "wind_speed_10m": "viento",
               "relative_humidity_2m": "rh", "surface_pressure": "pres"}
_MOS_TARGETS = ["shortwave_radiation", "direct_normal_irradiance",
                "diffuse_radiation", "temperature_2m",
                "relative_humidity_2m", "cloud_cover",
                "wind_speed_100m", "wind_speed_10m",
                "surface_pressure", "precipitation"]
_MIND = {"ghi_toa": 10.0, "sin_elev": 0.1}
_ECMWF_URL = "https://api.open-meteo.com/v1/forecast"


def _sol_geo(time_idx, lat_deg: float):
    """(ghi_toa, sin_elev) deterministas para un array de Timestamps."""
    d = np.array([t.dayofyear for t in time_idx])
    h = np.array([t.hour + t.minute / 60.0 for t in time_idx])
    dec = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + d) / 365.0))
    om = np.deg2rad(15 * (h - 12))
    lat_r = np.deg2rad(lat_deg)
    sine = np.clip(np.sin(lat_r) * np.sin(dec)
                   + np.cos(lat_r) * np.cos(dec) * np.cos(om), 0, None)
    e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * d / 365.0))
    return 1367.0 * e0 * sine, sine


def _medfill(s: pd.Series, fallback: float = 0.0) -> pd.Series:
    """Rellena NaN con la mediana (política de entrenamiento); si la serie es
    toda-NaN (p.ej. wind_speed_100m en archive de Pasto), usa `fallback`."""
    med = s.median()
    if pd.isna(med):
        logger.warning("MOS: serie toda-NaN, relleno con %s", fallback)
        return s.fillna(fallback)
    return s.fillna(med)


class MOSClimateForecaster(ClimateForecaster):
    """MOS Fase 1: LightGBM por variable + v1 del iTransformer sobre ECMWF."""

    provider_name = "mos"
    MAX_HORIZON_H = 72
    CONTEXT_LENGTH = 512
    CONTEXT_VARS = list(WEATHER_VARIABLES) + ["wind_direction_100m"]

    def __init__(self, site_cfg: dict = None):
        from optimization.config.loader import load_site
        from optimization.prediction.forecaster import DEFAULT_SITE
        self.site_cfg = site_cfg or load_site(DEFAULT_SITE)["site"]
        self._lgbm = None
        self._imodel = None
        self._cfg = None
        self._ctx_raw = None

    @property
    def variables(self) -> list:
        return list(WEATHER_VARIABLES)

    # ------------------------------------------------------------------ #
    def _load_lazy(self):
        """Carga modelos una sola vez (imports pesados locales)."""
        if self._lgbm is not None:
            return
        try:
            import torch
            import torch.nn as nn
        except ImportError as exc:
            raise RuntimeError(
                "MOS requiere torch en esta máquina. Instala: pip install "
                "torch --index-url https://download.pytorch.org/whl/cpu "
                "(o usa FORECASTER=openmeteo)."
            ) from exc
        try:
            import lightgbm as lgb
        except ImportError as exc:
            raise RuntimeError(
                "MOS requiere lightgbm en esta máquina. Instala: "
                "pip install lightgbm (o usa FORECASTER=openmeteo)."
            ) from exc
        from pathlib import Path

        pkg = Path(__file__).resolve().parent / "mos"
        models_dir = pkg / "models"
        itr_dir = pkg / "itransformer"
        missing = [f"lgbm_mos_{v}.txt" for v in _MOS_TARGETS
                   if not (models_dir / f"lgbm_mos_{v}.txt").exists()]
        if missing or not (itr_dir / "modelo_b.pt").exists() \
                or not (itr_dir / "config_modelos.json").exists():
            raise RuntimeError(
                "MOS: modelos no encontrados en "
                f"{pkg} (faltan {missing}). Portar el paquete "
                "integracion_plataforma/cambio_01_mos_forecaster/ "
                "a optimization/prediction/mos/.")
        import json as _json
        boosters = {}
        for var in _MOS_TARGETS:
            b = lgb.Booster(
                model_file=str(models_dir / f"lgbm_mos_{var}.txt"))
            if b.num_feature() != len(_FEAT_NAMES):
                raise RuntimeError(
                    f"MOS {var}: esperaba {len(_FEAT_NAMES)} features, "
                    f"el booster trae {b.num_feature()}")
            boosters[var] = b

        cfg = _json.loads((itr_dir / "config_modelos.json").read_text(
            encoding="utf-8"))
        features = list(cfg["FEATURES"])
        tgt_idx = [features.index(f"{t}__tr") for t in _MOS_TARGETS]
        stats = {k: tuple(v) for k, v in cfg["stats"].items()}
        L, H = int(cfg.get("L", 512)), int(cfg.get("H", 72))

        class _ITransformer(nn.Module):
            def __init__(self, n_channels):
                super().__init__()
                self.embed = nn.Linear(L, 128)
                self.variable_embed = nn.Parameter(
                    torch.randn(1, n_channels, 128) * 0.02)
                enc = nn.TransformerEncoderLayer(
                    d_model=128, nhead=8, dim_feedforward=256,
                    dropout=0.0, batch_first=True, activation="gelu")
                self.encoder = nn.TransformerEncoder(enc, 3)
                self.head = nn.Linear(128, H * 3)
                self.register_buffer(
                    "tgt_idx", torch.tensor(tgt_idx, dtype=torch.long))

            def forward(self, x):
                mean = x.mean(dim=1, keepdim=True)
                std = x.std(dim=1, keepdim=True) + 1e-6
                x = (x - mean) / std
                z = self.embed(x.permute(0, 2, 1)) + self.variable_embed
                z = self.encoder(z)
                out = self.head(z).view(x.shape[0], x.shape[2], H, 3)
                out = out.permute(0, 2, 1, 3)
                return (out * std.unsqueeze(-1)
                        + mean.unsqueeze(-1)).index_select(2, self.tgt_idx)

        torch.set_num_threads(max(1, __import__("os").cpu_count() or 1))
        model = _ITransformer(len(features))
        sd = torch.load(itr_dir / "modelo_b.pt", map_location="cpu")
        if isinstance(sd, dict) and "state_dict" in sd:
            sd = sd["state_dict"]
        model.load_state_dict(
            {k.replace("model.", ""): v for k, v in sd.items()},
            strict=False)
        model.eval()

        self._lgbm = boosters
        self._imodel = model
        self._cfg = {"features": features, "stats": stats,
                     "clim": cfg["clim"], "L": L, "H": H}

    # ------------------------------------------------------------------ #
    def _context_df(self, anchor: pd.Timestamp | None = None) -> pd.DataFrame:
        """Contexto observado (Open-Meteo past_days), igual que PatchTST."""
        client = OpenMeteoClient(
            latitude=self.site_cfg["latitude"],
            longitude=self.site_cfg["longitude"],
            timezone=self.site_cfg.get("timezone", "America/Bogota"),
            variables=self.CONTEXT_VARS,
        )
        if anchor is None:
            now_hour = pd.Timestamp.now(tz=client.timezone).floor("h")
        else:
            if anchor.tz is None:
                anchor = anchor.tz_localize(client.timezone)
            now_hour = anchor.floor("h")
        need_from = now_hour - pd.Timedelta(hours=self.CONTEXT_LENGTH + 24)
        base_days = self.CONTEXT_LENGTH // 24 + 1
        extra_days = max(0, int((pd.Timestamp.now(tz=client.timezone)
                                 - need_from).total_seconds() // 86400))
        past_days = min(base_days + extra_days, 92)
        if (self._ctx_raw is None
                or self._ctx_raw[1].index.min() > need_from):
            self._ctx_raw = (past_days, client.fetch_forecast(
                past_days=past_days, forecast_days=1))
        df = self._ctx_raw[1]
        if df.empty:
            raise RuntimeError("Contexto MOS vacío (Open-Meteo sin datos)")
        df = df.loc[df.index < now_hour]
        if len(df) < self.CONTEXT_LENGTH:
            raise RuntimeError(
                f"Contexto insuficiente: {len(df)}h < {self.CONTEXT_LENGTH}h "
                f"(anchor={now_hour}, past_days={past_days})")
        return df

    # ------------------------------------------------------------------ #
    def _ecmwf_live(self, start: pd.Timestamp, hours: int) -> pd.DataFrame:
        """ECMWF IFS en vivo (proxy + contexto). Reintentos con backoff (SPEC)."""
        import requests
        params = dict(
            latitude=float(self.site_cfg["latitude"]),
            longitude=float(self.site_cfg["longitude"]),
            models="ecmwf_ifs025",
            hourly=",".join(_ECMWF_COLS),
            forecast_days=4, timezone="America/Bogota")
        last = None
        for attempt in range(6):
            try:
                r = requests.get(_ECMWF_URL, params=params, timeout=90)
                if r.status_code == 503:
                    raise RuntimeError("ECMWF 503 overloaded")
                r.raise_for_status()
                fc = r.json()["hourly"]
                idx = pd.to_datetime(fc["time"]).tz_localize("America/Bogota")
                out = pd.DataFrame(
                    {tag: pd.to_numeric(fc[col], errors="coerce")
                     for col, tag in _ECMWF_COLS.items()}, index=idx)
                out = out.loc[(out.index >= start)
                              & (out.index < start + pd.Timedelta(hours=hours))]
                if len(out) < hours:
                    raise RuntimeError(
                        f"ECMWF en vivo cubre {len(out)}h < {hours}h")
                return out
            except Exception as exc:  # noqa: BLE001 - reintento ciego + raise
                last = exc
                logger.warning("MOS ECMWF intento %d/6: %s", attempt + 1, exc)
                time.sleep(min(2 ** attempt, 30))
        raise RuntimeError(f"MOS: ECMWF en vivo inaccesible: {last}")

    # ------------------------------------------------------------------ #
    def _engineer_ctx(self, ctx: pd.DataFrame) -> pd.DataFrame:
        """Features completas del contexto (igual que entrenamiento v1)."""
        lat = float(self.site_cfg["latitude"])
        ts = ctx.index
        doy = ts.dayofyear.values
        hour = ts.hour.values + ts.minute.values / 60.0
        decl = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + doy) / 365.0))
        omega = np.deg2rad(15 * (hour - 12))
        lat_r = np.deg2rad(lat)
        sin_elev = np.clip(np.sin(lat_r) * np.sin(decl)
                           + np.cos(lat_r) * np.cos(decl) * np.cos(omega),
                           0, None)
        e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * doy / 365.0))
        ctx = ctx.copy()
        ctx["ghi_toa"] = 1367.0 * e0 * sin_elev
        ctx["sin_elev"] = sin_elev
        ctx["hour_sin"] = np.sin(2 * np.pi * hour / 24)
        ctx["hour_cos"] = np.cos(2 * np.pi * hour / 24)
        ctx["doy_sin"] = np.sin(2 * np.pi * doy / 365.0)
        ctx["doy_cos"] = np.cos(2 * np.pi * doy / 365.0)
        if "shortwave_radiation" in ctx:
            kt = np.where(ctx["ghi_toa"].values > 10,
                          ctx["shortwave_radiation"].values
                          / ctx["ghi_toa"].values, 0.0).clip(0, 1.2)
        else:
            kt = np.zeros(len(ctx))
        ctx["kt"] = kt
        ctx["kt_roll3h"] = pd.Series(kt, index=ctx.index).rolling(
            3, min_periods=1).mean().values
        if "wind_direction_100m" in ctx and "wind_speed_100m" in ctx:
            wd = np.deg2rad(np.nan_to_num(ctx["wind_direction_100m"].values))
            wsp = np.nan_to_num(ctx["wind_speed_100m"].values)
            ctx["wind_u_100m"] = -wsp * np.sin(wd)
            ctx["wind_v_100m"] = -wsp * np.cos(wd)
            ctx["wind_power_proxy"] = wsp ** 3
        else:
            ctx["wind_u_100m"] = 0.0
            ctx["wind_v_100m"] = 0.0
            ctx["wind_power_proxy"] = 0.0
        if "cloud_cover" in ctx:
            ctx["cloud_delta_1h"] = ctx["cloud_cover"].diff().fillna(0).values
        else:
            ctx["cloud_delta_1h"] = 0.0
        return ctx

    def _v1_phys(self, ctx: pd.DataFrame, fut_idx: pd.DatetimeIndex) -> dict:
        """v1 del iTransformer decodificada a física (P50, cuantil 1)."""
        import torch
        cfg = self._cfg
        features, stats, clim, L, H = (
            cfg["features"], cfg["stats"], cfg["clim"], cfg["L"], cfg["H"])
        win = self._engineer_ctx(ctx).iloc[-L:].copy()
        for var, sp in _TRANSFORMS.items():
            if sp["type"] == "divide":
                d = win[sp["denom"]].values
                mind = _MIND.get(sp["denom"], 1.0)
                win[f"{var}__tr"] = np.where(
                    d > mind, win[var].values / np.maximum(d, mind), 0.0)
            elif sp["type"] == "anomaly":
                hrs = win.index.hour.values
                win[f"{var}__tr"] = win[var].values - np.asarray(
                    clim[var])[hrs]
            else:
                win[f"{var}__tr"] = win[var].values
        Xc = np.zeros((len(win), len(features)), dtype=np.float32)
        for c, col in enumerate(features):
            m, s = stats.get(col, (0.0, 1.0))
            Xc[:, c] = (np.nan_to_num(win[col].values) - m) / s
        fut_toa, fut_sin = _sol_geo(fut_idx, float(self.site_cfg["latitude"]))
        hrs_fut = np.array([t.hour for t in fut_idx])
        with torch.no_grad():
            pr = self._imodel(torch.tensor(
                Xc, dtype=torch.float32).unsqueeze(0)).cpu().numpy()[0]
        out = {}
        for ti, var in enumerate(_MOS_TARGETS):
            m, s = stats[f"{var}__tr"]
            p_tr = pr[..., ti, 1] * s + m
            tr_ = _TRANSFORMS[var]
            if tr_["type"] == "divide":
                den = fut_toa if tr_["denom"] == "ghi_toa" else fut_sin
                out[var] = p_tr * den
            elif tr_["type"] == "anomaly":
                out[var] = p_tr + np.asarray(clim[var])[hrs_fut]
            else:
                out[var] = p_tr
        return out

    # ------------------------------------------------------------------ #
    def forecast(self, days: float = 1.0,
                 anchor: pd.Timestamp | None = None) -> ClimateForecast:
        horizon = max(1, int(days * 24))
        if horizon > self.MAX_HORIZON_H:
            raise RuntimeError(
                f"MOS: horizonte máx 72h (se pidió {horizon})")
        self._load_lazy()
        tz = self.site_cfg.get("timezone", "America/Bogota")
        if anchor is None:
            now_hour = pd.Timestamp.now(tz=tz).floor("h")
        else:
            now_hour = anchor.tz_localize(tz) if anchor.tz is None \
                else anchor.tz_convert(tz)
            now_hour = now_hour.floor("h")
        ctx = self._context_df(anchor)
        ctx = ctx.loc[ctx.index < now_hour].iloc[-self.CONTEXT_LENGTH:]
        fut_idx = pd.date_range(now_hour, periods=self._cfg["H"], freq="h",
                                tz=tz)
        v1 = self._v1_phys(ctx, fut_idx)
        lat = float(self.site_cfg["latitude"])
        fut_toa, _ = _sol_geo(fut_idx[:horizon], lat)
        use_live = anchor is None
        if use_live:
            proxy_src = self._ecmwf_live(now_hour, horizon)
            src_note = "ecmwf_ifs025 en vivo"
        else:
            # Sin ECMWF operativo histórico: proxy = ERA5 archive (misma
            # familia que el proxy de entrenamiento; ver advertencia del
            # módulo). Solo válido para backtest, no para operación.
            client = OpenMeteoClient(
                latitude=self.site_cfg["latitude"],
                longitude=self.site_cfg["longitude"], timezone=tz,
                variables=list(_ECMWF_COLS))
            arch = client.fetch_archive(
                now_hour.strftime("%Y-%m-%d"),
                (now_hour + pd.Timedelta(hours=horizon - 1)).strftime(
                    "%Y-%m-%d"))
            if arch.empty:
                raise RuntimeError("MOS: archive sin datos para el proxy")
            arch = arch.loc[(arch.index >= now_hour)
                            & (arch.index < now_hour + pd.Timedelta(
                                hours=horizon))]
            proxy_src = pd.DataFrame(
                {tag: _medfill(arch[col]) for col, tag in _ECMWF_COLS.items()
                 if col in arch},
                index=arch.index)
            for tag in _ECMWF_COLS.values():
                if tag not in proxy_src:
                    proxy_src[tag] = 0.0
            src_note = "ERA5 archive como proxy (backtest)"
        logger.info("MOS proxy: %s (%dh)", src_note, horizon)
        ctx_hour = ctx.index.hour.values
        central = {}
        for var in _MOS_TARGETS:
            if var in _PASS_THROUGH:
                central[var] = np.nan_to_num(
                    proxy_src[_PROXY[var]].values[:horizon]).astype(float)
                continue
            tag = _PROXY[var]
            proxy = np.nan_to_num(proxy_src[tag].values[:horizon]).astype(
                float)
            if var in _PROXY_SCALE:
                proxy = proxy * _PROXY_SCALE[var]
            v1_full = np.asarray(v1[var][:horizon], dtype=float)
            pers = np.full(horizon, np.nan)
            for ii, hr in enumerate(fut_idx[:horizon].hour.values):
                cand = np.where(ctx_hour == hr)[0]
                pers[ii] = ctx[var].values[cand[-1]] if len(cand) else np.nan
            pers = np.nan_to_num(pers, nan=0.0)
            X = np.nan_to_num(np.stack([
                proxy, v1_full, pers, fut_toa,
                fut_idx[:horizon].hour.values.astype(float),
                np.nan_to_num(proxy_src["nubes"].values[:horizon]),
                np.nan_to_num(proxy_src["temp"].values[:horizon]),
                np.nan_to_num(proxy_src["viento"].values[:horizon]),
            ], axis=1), nan=0.0)
            central[var] = self._lgbm[var].predict(X).astype(float)
        out = pd.DataFrame(central, index=fut_idx[:horizon])[self.variables]
        for col in ("shortwave_radiation", "direct_normal_irradiance",
                    "diffuse_radiation", "wind_speed_100m", "wind_speed_10m",
                    "precipitation"):
            out[col] = np.clip(out[col].values, 0, None)
        out = out.astype("float64")
        if bool(out.isna().any().any()):
            raise RuntimeError("MOS: NaN en la salida (fallo de features)")
        return ClimateForecast(data=out.iloc[:horizon],
                               horizon_h=len(out), provider=self.provider_name)
