import numpy as np
import torch
import torch.nn as nn
from typing import Optional


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
        else:
            raise ValueError(
                "Unsupported segmentation checkpoint. "
                "Save a full nn.Module via torch.save(model, path), "
                "or provide a dict with 'model_state_dict'."
            )
        model.eval()
        model.to(self.device)
        return model

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
