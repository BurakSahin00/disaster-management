import os
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Mapping, Optional


SMP_UNET_ENCODER_CANDIDATES = [
    "efficientnet-b0",
    "efficientnet-b1",
    "efficientnet-b2",
    "efficientnet-b3",
    "efficientnet-b4",
    "efficientnet-b5",
    "efficientnet-b6",
    "efficientnet-b7",
    "timm-efficientnet-b0",
    "timm-efficientnet-b1",
    "timm-efficientnet-b2",
    "timm-efficientnet-b3",
    "timm-efficientnet-b4",
    "timm-efficientnet-b5",
    "timm-efficientnet-b6",
    "timm-efficientnet-b7",
]


class SegmentationModel:
    """
    Segmentasyon modelini sarar.

    Desteklenen formatlar:
      1. HuggingFace SegFormer dizini  — config.json + model.safetensors içeren klasör
      2. Tam nn.Module .pth dosyası
      3. SMP UNet checkpoint dict      — {arch, encoder_name, model_state_dict}
      4. Ham SMP UNet state_dict
    """

    def __init__(self, model_path: str, device: Optional[str] = None, threshold: float = 0.5):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.threshold = threshold
        self._is_segformer = os.path.isdir(model_path)

        if self._is_segformer:
            self._load_segformer(model_path)
        else:
            self.model = self._load_pth(model_path)

    # ── HuggingFace SegFormer ─────────────────────────────────────────────────

    def _load_segformer(self, path: str) -> None:
        try:
            from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
        except ImportError as e:
            raise ImportError(
                "transformers kütüphanesi bulunamadı. "
                "Kurmak için: pip install transformers safetensors"
            ) from e

        self._processor = SegformerImageProcessor.from_pretrained(path)
        self._hf_model = SegformerForSemanticSegmentation.from_pretrained(path)
        self._hf_model.eval()
        self._hf_model.to(self.device)

    @torch.no_grad()
    def _predict_segformer(self, tile: np.ndarray) -> np.ndarray:
        """(C, H, W) → binary mask (H, W)  via SegFormer."""
        h, w = tile.shape[1], tile.shape[2]
        tile_hwc = tile.transpose(1, 2, 0)  # (H, W, C)

        inputs = self._processor(images=tile_hwc, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device)

        outputs = self._hf_model(pixel_values=pixel_values)
        # logits: (1, num_classes, H/4, W/4) → upsample to tile size
        logits = F.interpolate(
            outputs.logits,
            size=(h, w),
            mode="bilinear",
            align_corners=False,
        )
        pred = logits.argmax(dim=1).squeeze(0).cpu().numpy()  # (H, W)
        return (pred == 1).astype(np.uint8)

    # ── PyTorch .pth ──────────────────────────────────────────────────────────

    def _load_pth(self, path: str) -> nn.Module:
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        if isinstance(checkpoint, nn.Module):
            model = checkpoint
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            arch = checkpoint.get("arch")
            encoder_name = checkpoint.get("encoder_name")
            if arch != "Unet" or not isinstance(encoder_name, str):
                raise ValueError(
                    "Desteklenmeyen segmentasyon checkpoint formatı. "
                    "Beklenen: {arch: 'Unet', encoder_name: str, model_state_dict: ...}"
                )
            try:
                import segmentation_models_pytorch as smp  # type: ignore
            except ModuleNotFoundError as e:
                raise ModuleNotFoundError(
                    "segmentation_models_pytorch gerekli. "
                    "Kurmak için: pip install segmentation-models-pytorch timm"
                ) from e
            model = smp.Unet(
                encoder_name=encoder_name,
                encoder_weights=None,
                in_channels=3,
                classes=1,
                activation=None,
            )
            model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        elif isinstance(checkpoint, Mapping):
            state_dict = checkpoint.get("state_dict", checkpoint)
            if not self._looks_like_smp_unet_state_dict(state_dict):
                raise ValueError(
                    "Desteklenmeyen segmentasyon state_dict. "
                    "Beklenen: tam nn.Module, {arch, encoder_name, model_state_dict} "
                    "veya ham SMP Unet state_dict."
                )
            model = self._build_smp_unet_from_state_dict(state_dict)
        else:
            raise ValueError(
                "Desteklenmeyen segmentasyon checkpoint. "
                "torch.save(model, path) ile kaydedilmiş tam nn.Module kullanın "
                "ya da --seg-model için HuggingFace model dizini verin."
            )
        model.eval()
        model.to(self.device)
        return model

    def preprocess(self, tile: np.ndarray) -> torch.Tensor:
        """(C, H, W) uint8/uint16 → normalize float tensor  [yalnızca .pth modu]"""
        x = tile.astype(np.float32)
        x = x / x.max() if x.max() > 0 else x
        return torch.from_numpy(x).unsqueeze(0).to(self.device)

    @torch.no_grad()
    def predict_tile(self, tile: np.ndarray) -> np.ndarray:
        """Tek tile için binary mask döner. Shape: (H, W)"""
        if self._is_segformer:
            return self._predict_segformer(tile)

        x = self.preprocess(tile)
        logits = self.model(x)
        prob = torch.sigmoid(logits).squeeze().cpu().numpy()
        return (prob >= self.threshold).astype(np.uint8)

    def predict_full(self, tile: np.ndarray) -> np.ndarray:
        """Küçük dosyalar için direkt çalıştır."""
        return self.predict_tile(tile)

    # ── SMP yardımcı metotlar ─────────────────────────────────────────────────

    def _looks_like_smp_unet_state_dict(self, state_dict: object) -> bool:
        if not isinstance(state_dict, Mapping):
            return False
        keys = set(state_dict.keys())
        return (
            "segmentation_head.0.weight" in keys
            and any(isinstance(k, str) and k.startswith("encoder.") for k in keys)
            and any(isinstance(k, str) and k.startswith("decoder.") for k in keys)
        )

    def _build_smp_unet_from_state_dict(self, state_dict: Mapping[str, object]) -> nn.Module:
        try:
            import segmentation_models_pytorch as smp  # type: ignore
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "segmentation_models_pytorch gerekli. "
                "Kurmak için: pip install segmentation-models-pytorch timm"
            ) from e

        for encoder_name in SMP_UNET_ENCODER_CANDIDATES:
            model = smp.Unet(
                encoder_name=encoder_name,
                encoder_weights=None,
                in_channels=3,
                classes=1,
                activation=None,
            )
            if self._state_dict_shapes_match(model.state_dict(), state_dict):
                model.load_state_dict(state_dict, strict=True)
                return model

        sample_keys = list(state_dict.keys())[:8]
        raise ValueError(
            "Uyumlu SMP Unet encoder bulunamadı. "
            f"Örnek key'ler: {sample_keys}"
        )

    def _state_dict_shapes_match(
        self,
        model_state: Mapping[str, object],
        checkpoint_state: Mapping[str, object],
    ) -> bool:
        if set(model_state.keys()) != set(checkpoint_state.keys()):
            return False
        for key, expected in model_state.items():
            actual = checkpoint_state[key]
            if not hasattr(expected, "shape") or not hasattr(actual, "shape"):
                continue
            if tuple(expected.shape) != tuple(actual.shape):
                return False
        return True
