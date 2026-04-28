import numpy as np
import torch
import torch.nn as nn
from typing import Optional, List


DAMAGE_CLASSES = {
    0: "no-damage",
    1: "minor-damage",
    2: "major-damage",
    3: "destroyed",
}


class DamageClassifier:
    """
    .pth formatındaki hasar sınıflandırma modelini sarar.
    Varsayılan: pre + post crop'larını kanal boyutunda birleştirerek (6-kanal) alır.
    Modelin farklı bir girdi beklentisi varsa preprocess() override edilebilir.

    Model yükleme:
      - Dosya bir nn.Module ise doğrudan kullanılır.
      - Dosya state_dict (dict) ise 'architecture' parametresi zorunludur.
    """

    def __init__(
        self,
        model_path: str,
        device: Optional[str] = None,
        architecture: Optional[nn.Module] = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
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
                    "DamageClassifier(architecture=<model_instance>) şeklinde çağırın."
                )
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

    def preprocess(self, pre_crop: np.ndarray, post_crop: np.ndarray) -> torch.Tensor:
        """
        pre_crop, post_crop: (C, H, W) — herhangi bir dtype
        Kanal boyutunda birleştir → (1, 2C, H, W), [0, 1] aralığına normalize et.
        dtype'a göre sabit maksimum: uint8 → 255, diğer → 65535.
        """
        combined = np.concatenate([pre_crop, post_crop], axis=0).astype(np.float32)
        max_val = 255.0 if pre_crop.dtype == np.uint8 else 65535.0
        combined = combined / max_val
        return torch.from_numpy(combined).unsqueeze(0).to(self.device)

    @torch.no_grad()
    def classify(self, pre_crop: np.ndarray, post_crop: np.ndarray) -> int:
        """Tek bina için hasar sınıfı döner (0-3)."""
        x = self.preprocess(pre_crop, post_crop)
        logits = self.model(x)  # (1, num_classes)
        return int(torch.argmax(logits, dim=1).item())

    @torch.no_grad()
    def classify_batch(
        self,
        pre_crops: List[np.ndarray],
        post_crops: List[np.ndarray],
        batch_size: int = 16,
    ) -> List[int]:
        """Tüm binalar için batch inference."""
        results = []
        for i in range(0, len(pre_crops), batch_size):
            batch_pre = pre_crops[i:i + batch_size]
            batch_post = post_crops[i:i + batch_size]
            tensors = [
                self.preprocess(p, q).squeeze(0)
                for p, q in zip(batch_pre, batch_post)
            ]
            x = torch.stack(tensors).to(self.device)
            logits = self.model(x)
            preds = torch.argmax(logits, dim=1).cpu().tolist()
            results.extend(preds)
        return results
