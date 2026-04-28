import numpy as np
import torch
import torch.nn as nn
from typing import Optional


class SegmentationModel:
    """
    .pth formatındaki segmentasyon modelini sarar.
    Beklenti: model binary mask üretir (0=arka plan, 1=bina).

    Model yükleme:
      - Dosya bir nn.Module ise doğrudan kullanılır.
      - Dosya state_dict (dict) ise 'architecture' parametresi zorunludur.
    """

    def __init__(
        self,
        model_path: str,
        device: Optional[str] = None,
        threshold: float = 0.5,
        architecture: Optional[nn.Module] = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.threshold = threshold
        self.architecture = architecture
        self.model = self._load(model_path)

    def _load(self, path: str) -> nn.Module:
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)

        if isinstance(checkpoint, nn.Module):
            model = checkpoint
        elif isinstance(checkpoint, dict):
            if self.architecture is None:
                raise ValueError(
                    "Model state_dict formatında kaydedilmiş ancak 'architecture' parametresi verilmedi. "
                    "SegmentationModel(architecture=<model_instance>) şeklinde çağırın."
                )
            # 'model_state_dict' anahtarını destekle; yoksa dict'in tamamını kullan
            state = checkpoint.get("model_state_dict", checkpoint)
            self.architecture.load_state_dict(state)
            model = self.architecture
        else:
            raise ValueError(
                f"Desteklenmeyen checkpoint formatı: {type(checkpoint)}. "
                "nn.Module veya state_dict (dict) bekleniyor."
            )

        model.eval()
        model.to(self.device)
        return model

    def preprocess(self, tile: np.ndarray) -> torch.Tensor:
        """
        (C, H, W) uint8/uint16 → normalize edilmiş float tensor.
        dtype'a göre sabit maksimum: uint8 → 255, diğer → 65535.
        Tile başına farklı ölçeklemeyi önlemek için sabit aralık kullanılır.
        """
        x = tile.astype(np.float32)
        max_val = 255.0 if tile.dtype == np.uint8 else 65535.0
        x = x / max_val
        return torch.from_numpy(x).unsqueeze(0).to(self.device)  # (1, C, H, W)

    @torch.no_grad()
    def predict_tile(self, tile: np.ndarray) -> np.ndarray:
        """Tek tile için binary mask döner. Shape: (H, W)"""
        x = self.preprocess(tile)
        logits = self.model(x)  # (1, 1, H, W) veya (1, H, W)
        prob = torch.sigmoid(logits).squeeze().cpu().numpy()
        return (prob >= self.threshold).astype(np.uint8)

    @torch.no_grad()
    def predict_full(self, tile: np.ndarray) -> np.ndarray:
        """Küçük dosyalar için direkt çalıştır."""
        return self.predict_tile(tile)
