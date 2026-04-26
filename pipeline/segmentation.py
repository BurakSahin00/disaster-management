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
        checkpoint = torch.load(path, map_location=self.device)
        # .pth dosyası direkt model ise
        if isinstance(checkpoint, nn.Module):
            model = checkpoint
        # state_dict ise — model mimarisini dışarıdan alacak şekilde genişletilebilir
        else:
            raise ValueError(
                "Model direkt nn.Module olarak kaydedilmemiş. "
                "SegmentationModel.__init__ içine 'architecture' parametresi ekleyin."
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
