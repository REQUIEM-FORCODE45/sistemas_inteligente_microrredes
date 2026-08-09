"""
PatchTST (Nie et al., ICLR 2023) — implementación PyTorch.

Idea central: una serie de tiempo "vale 64 palabras". Se divide cada canal
en parches (patch_len, stride), cada parche se proyecta a d_model, y un
Transformer encoder estándar aprende las relaciones temporales.

Diseño channel-independent: cada variable pasa por el MISMO transformer
(pesos compartidos). Esto regulariza mucho con datasets pequeños y es lo
que le gana a TFT/Informer en benchmarks LTSF.

Extensión respecto al paper: cabeza de cuantiles (pinball loss) para
forecast probabilístico — necesario para el control del BESS (P10/P50/P90).
"""
from __future__ import annotations

import math

import torch
import torch.nn as nn


class RevIN(nn.Module):
    """Reversible Instance Normalization (Kim et al., ICLR 2022).

    Normaliza cada ventana por su media/std y des-normaliza a la salida.
    Clave para series no estacionarias (la radiación tiene ciclo diario).
    """

    def __init__(self, num_features: int, eps: float = 1e-5, affine: bool = True):
        super().__init__()
        self.eps = eps
        self.affine = affine
        if affine:
            self.weight = nn.Parameter(torch.ones(num_features))
            self.bias = nn.Parameter(torch.zeros(num_features))

    def forward(self, x: torch.Tensor, mode: str) -> torch.Tensor:
        # x: (B, L, C)
        if mode == "norm":
            self.mean = x.mean(dim=1, keepdim=True).detach()
            self.std = torch.sqrt(x.var(dim=1, keepdim=True, unbiased=False) + self.eps).detach()
            x = (x - self.mean) / self.std
            if self.affine:
                x = x * self.weight + self.bias
            return x
        if mode == "denorm":
            if self.affine:
                x = (x - self.bias) / (self.weight + self.eps * self.eps)
            return x * self.std + self.mean
        raise ValueError(mode)


class PatchEmbedding(nn.Module):
    def __init__(self, patch_len: int, stride: int, d_model: int, dropout: float):
        super().__init__()
        self.patch_len = patch_len
        self.stride = stride
        self.proj = nn.Linear(patch_len, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B*C, L)  -> parches: (B*C, N, patch_len)
        n_patches = (x.shape[1] - self.patch_len) // self.stride + 1
        patches = x.unfold(dimension=1, size=self.patch_len, step=self.stride)
        return self.dropout(self.proj(patches))  # (B*C, N, d_model)


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 2048):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(max_len).unsqueeze(1).float()
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.pe[:, : x.shape[1]]


class PatchTST(nn.Module):
    """
    Args:
        context_length: horas de historia de entrada (L)
        horizon: horas a predecir (H)
        n_channels: número de variables de entrada (= targets en modo
                    channel-independent; cada canal se predice a sí mismo)
        quantiles: lista de cuantiles de salida, p.ej. [0.1, 0.5, 0.9]
        target_idx: índices de los canales a devolver a la salida.
                    Si None, se devuelven todos los canales.
    """

    def __init__(
        self,
        context_length: int,
        horizon: int,
        n_channels: int,
        patch_len: int = 16,
        stride: int = 8,
        d_model: int = 128,
        n_heads: int = 16,
        e_layers: int = 3,
        d_ff: int = 256,
        dropout: float = 0.2,
        quantiles: list[float] | None = None,
        target_idx: list[int] | None = None,
    ):
        super().__init__()
        self.horizon = horizon
        self.n_channels = n_channels
        self.quantiles = quantiles or [0.5]
        self.n_quantiles = len(self.quantiles)
        self.target_idx = target_idx

        self.rev_in = RevIN(n_channels)
        self.patch_embed = PatchEmbedding(patch_len, stride, d_model, dropout)
        self.pos_enc = PositionalEncoding(d_model)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_ff,
            dropout=dropout, batch_first=True, norm_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=e_layers)

        n_patches = (context_length - patch_len) // stride + 1
        self.head = nn.Sequential(
            nn.Flatten(start_dim=-2),                       # (B*C, N*d_model)
            nn.Linear(n_patches * d_model, horizon * self.n_quantiles),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, L, C)
        B, L, C = x.shape
        x = self.rev_in(x, "norm")                    # (B, L, C)

        # Channel independence: (B, L, C) -> (B*C, L)
        x = x.permute(0, 2, 1).reshape(B * C, L)

        z = self.patch_embed(x)                       # (B*C, N, d_model)
        z = self.pos_enc(z)
        z = self.encoder(z)                           # (B*C, N, d_model)
        out = self.head(z)                            # (B*C, H*n_quantiles)

        out = out.view(B, C, self.horizon, self.n_quantiles)
        out = out.permute(0, 2, 1, 3)                 # (B, H, C, Q)

        # RevIN denorm por canal (media/std de la ventana de entrada)
        # out: (B, H, C, Q); mean/std: (B, C); bias/weight: (C,)
        mean = self.rev_in.mean.squeeze(1)            # (B, C)
        std = self.rev_in.std.squeeze(1)              # (B, C)
        if self.rev_in.affine:
            w = self.rev_in.weight.unsqueeze(-1)      # (C, 1)
            b = self.rev_in.bias.unsqueeze(-1)        # (C, 1)
            out = (out - b) / (w + self.rev_in.eps**2)
        out = out * std.unsqueeze(1).unsqueeze(-1) + mean.unsqueeze(1).unsqueeze(-1)
        # (B, H, C, Q) — broadcasting sobre H y Q

        # Seleccionar solo los canales objetivo si se especificaron
        if self.target_idx is not None:
            idx = torch.as_tensor(self.target_idx, device=out.device)
            out = out.index_select(2, idx)            # (B, H, C_tgt, Q)
        return out


def pinball_loss(pred: torch.Tensor, target: torch.Tensor,
                 quantiles: list[float]) -> torch.Tensor:
    """pred: (B,H,C,Q), target: (B,H,C). Loss promedio sobre cuantiles."""
    losses = []
    for i, q in enumerate(quantiles):
        err = target - pred[..., i]
        losses.append(torch.maximum(q * err, (q - 1) * err))
    return torch.stack(losses).mean()
