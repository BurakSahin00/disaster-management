import numpy as np
import torch
import torch.nn as nn
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
    .pth formatındaki segmentasyon modelini sarar.
    Beklenti: model binary mask üretir (0=arka plan, 1=bina).
    """

    def __init__(self, model_path: str, device: Optional[str] = None, threshold: float = 0.5):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.threshold = threshold
        self.model = self._load(model_path)

    def _load(self, path: str) -> nn.Module:
        # PyTorch 2.6+ defaults to weights_only=True which cannot load full nn.Module checkpoints.
        # This pipeline expects full models saved with torch.save(model, path).
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        # Case 1: .pth is a full nn.Module
        if isinstance(checkpoint, nn.Module):
            model = checkpoint
        # Case 2: training checkpoint dict (common)
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            arch = checkpoint.get("arch")
            encoder_name = checkpoint.get("encoder_name")
            if arch != "Unet" or not isinstance(encoder_name, str):
                raise ValueError(
                    "Unsupported segmentation checkpoint format. "
                    "Expected {arch: 'Unet', encoder_name: str, model_state_dict: ...}."
                )
            try:
                import segmentation_models_pytorch as smp  # type: ignore
            except ModuleNotFoundError as e:
                raise ModuleNotFoundError(
                    "segmentation_models_pytorch is required to load this checkpoint. "
                    "Install it with: pip install segmentation-models-pytorch timm"
                ) from e

            # Checkpoint was trained as binary segmentation: 1 output channel.
            model = smp.Unet(
                encoder_name=encoder_name,
                encoder_weights=None,
                in_channels=3,
                classes=1,
                activation=None,
            )
            model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        # Case 3: common raw state_dict / {state_dict: ...} export without metadata.
        elif isinstance(checkpoint, Mapping):
            state_dict = checkpoint.get("state_dict", checkpoint)
            if not self._looks_like_smp_unet_state_dict(state_dict):
                raise ValueError(
                    "Unsupported segmentation checkpoint dict. "
                    "Expected full nn.Module, {arch, encoder_name, model_state_dict}, "
                    "or a raw SMP Unet state_dict with encoder/decoder/segmentation_head keys."
                )
            model = self._build_smp_unet_from_state_dict(state_dict)
        else:
            raise ValueError(
                "Unsupported segmentation checkpoint. "
                "Save a full nn.Module via torch.save(model, path), "
                "or provide a dict with 'model_state_dict'."
            )
        model.eval()
        model.to(self.device)
        return model

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
                "segmentation_models_pytorch is required to load this checkpoint. "
                "Install it with: pip install segmentation-models-pytorch timm"
            ) from e

        for encoder_name in SMP_UNET_ENCODER_CANDIDATES:
            model = smp.Unet(
                encoder_name=encoder_name,
                encoder_weights=None,
                in_channels=3,
                classes=1,
                activation=None,
            )
            model_state = model.state_dict()
            if self._state_dict_shapes_match(model_state, state_dict):
                model.load_state_dict(state_dict, strict=True)
                return model

        sample_keys = list(state_dict.keys())[:8]
        raise ValueError(
            "Unsupported raw segmentation state_dict. Could not infer a compatible "
            f"SMP Unet encoder from keys/shapes. Sample keys: {sample_keys}"
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

    def preprocess(self, tile: np.ndarray) -> torch.Tensor:
        """(C, H, W) uint8/uint16 → normalize float tensor"""
        x = tile.astype(np.float32)
        # [0, 255] veya [0, 65535] → [0, 1]
        x = x / x.max() if x.max() > 0 else x
        return torch.from_numpy(x).unsqueeze(0).to(self.device)  # (1, C, H, W)

    @torch.no_grad()
    def predict_tile(self, tile: np.ndarray) -> np.ndarray:
        """Tek tile için binary mask döner. Shape: (H, W)"""
        x = self.preprocess(tile)
        logits = self.model(x)  # (1, 1, H, W) veya (1, H, W)
        prob = torch.sigmoid(logits).squeeze().cpu().numpy()
        return (prob >= self.threshold).astype(np.uint8)

    def predict_full(self, tile: np.ndarray) -> np.ndarray:
        """Küçük dosyalar için direkt çalıştır."""
        return self.predict_tile(tile)
