import numpy as np
import torch
import torch.nn as nn
from typing import Mapping, Optional, List, Tuple
import torchvision


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
    """

    def __init__(self, model_path: str, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = self._load(model_path)

    def _load(self, path: str) -> nn.Module:
        # PyTorch 2.6+ defaults to weights_only=True which cannot load full nn.Module checkpoints.
        # This pipeline expects full models saved with torch.save(model, path).
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        if isinstance(checkpoint, nn.Module):
            model = checkpoint
        elif isinstance(checkpoint, (dict, torch.nn.modules.module.Module)) and not isinstance(checkpoint, dict):
            model = checkpoint  # safety
        elif isinstance(checkpoint, dict) and "state_dict" in checkpoint and isinstance(checkpoint["state_dict"], dict):
            state_dict = checkpoint["state_dict"]
            model = self._build_model_from_state_dict(state_dict)
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint and isinstance(
            checkpoint["model_state_dict"], dict
        ):
            # Some trainers use model_state_dict for classifiers too.
            state_dict = checkpoint["model_state_dict"]
            model = self._build_model_from_state_dict(state_dict)
        elif isinstance(checkpoint, dict) or hasattr(checkpoint, "keys"):
            # A raw state_dict (OrderedDict)
            try:
                state_dict = dict(checkpoint)
            except Exception:
                state_dict = None
            if isinstance(state_dict, dict) and any(k.startswith("feature_extractor.") for k in state_dict.keys()):
                model = self._build_model_from_state_dict(state_dict)
            else:
                raise ValueError(
                    "Unsupported damage checkpoint format. "
                    "Expected full nn.Module or a state_dict with feature_extractor/classifier keys."
                )
        else:
            raise ValueError(
                "Unsupported damage checkpoint. Save a full nn.Module via torch.save(model, path)."
            )
        model.eval()
        model.to(self.device)
        return model

    def _build_model_from_state_dict(self, state_dict: Mapping[str, object]) -> nn.Module:
        if self._looks_like_resnet_multihead_state_dict(state_dict):
            for backbone in ("resnet18", "resnet34"):
                model = _SiameseResNetMultiHeadDamageModel(backbone=backbone)
                if self._state_dict_shapes_match(model.state_dict(), state_dict):
                    model.load_state_dict(state_dict, strict=True)
                    return model
            raise ValueError(
                "Unsupported multi-head damage checkpoint. "
                "Expected a ResNet-18 or ResNet-34 feature_extractor with trunk/binary/severity/ordinal heads."
            )

        model = _SiameseResNetDamageModel()
        model.load_state_dict(state_dict, strict=True)
        return model

    def _looks_like_resnet_multihead_state_dict(self, state_dict: Mapping[str, object]) -> bool:
        keys = set(state_dict.keys())
        return {
            "trunk.0.weight",
            "trunk.4.weight",
            "binary_head.weight",
            "severity_head.weight",
            "ordinal_head.weight",
        }.issubset(keys)

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

    def preprocess(self, pre_crop: np.ndarray, post_crop: np.ndarray) -> torch.Tensor:
        """
        pre_crop, post_crop: (C, H, W) float32
        Returns model input tensor.

        This project uses a Siamese damage model expecting stacked input:
        (1, 2C, H, W) where channels are concatenated pre+post.
        """
        pre = pre_crop.astype(np.float32)
        post = post_crop.astype(np.float32)

        # Training notebooks load PNG crops as float32 / 255.0, then apply ImageNet norm.
        # Our pipeline may still pass float crops in [0,1] range.
        def to_unit01(x: np.ndarray) -> np.ndarray:
            m = float(np.nanmax(x)) if x.size else 0.0
            if m <= 1.0:
                return np.clip(x, 0.0, 1.0)
            return np.clip(x / 255.0, 0.0, 1.0)

        pre = to_unit01(pre)
        post = to_unit01(post)

        # ImageNet normalization (matches training notebook).
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)[:, None, None]
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)[:, None, None]
        if pre.shape[0] != 3 or post.shape[0] != 3:
            raise ValueError(f"Expected 3-channel RGB crops. Got pre={pre.shape}, post={post.shape}")
        pre = (pre - mean) / std
        post = (post - mean) / std

        combined = np.concatenate([pre, post], axis=0)  # (6, H, W)
        return torch.from_numpy(combined).unsqueeze(0).to(self.device)

    @torch.no_grad()
    def classify(self, pre_crop: np.ndarray, post_crop: np.ndarray) -> int:
        """Tek bina için hasar sınıfı döner (0-3)."""
        x = self.preprocess(pre_crop, post_crop)
        logits = self.model(x)  # (1, num_classes)
        return int(torch.argmax(logits, dim=1).item())

    @torch.no_grad()
    def classify_batch_with_confidence(
        self,
        pre_crops: List[np.ndarray],
        post_crops: List[np.ndarray],
        batch_size: int = 16,
        tta_views: int = 1,
    ) -> List[Tuple[int, float]]:
        """Her bina için (damage_class, max_softmax_confidence)."""
        results: List[Tuple[int, float]] = []
        for i in range(0, len(pre_crops), batch_size):
            batch_pre = pre_crops[i : i + batch_size]
            batch_post = post_crops[i : i + batch_size]
            tensors = [
                self.preprocess(p, q).squeeze(0) for p, q in zip(batch_pre, batch_post)
            ]
            x = torch.stack(tensors).to(self.device)
            if tta_views and tta_views > 1:
                views = [x, torch.flip(x, dims=[-1]), torch.flip(x, dims=[-2])][:tta_views]
                acc = None
                for v in views:
                    logits = self.model(v)
                    p = torch.softmax(logits, dim=1)
                    acc = p if acc is None else acc + p
                probs = acc / len(views)
            else:
                logits = self.model(x)
                probs = torch.softmax(logits, dim=1)
            conf = probs.max(dim=1).values
            preds = torch.argmax(probs, dim=1)
            for p, c in zip(preds.cpu().tolist(), conf.cpu().tolist()):
                results.append((int(p), float(c)))
        return results

    def classify_batch(
        self,
        pre_crops: List[np.ndarray],
        post_crops: List[np.ndarray],
        batch_size: int = 16,
        tta_views: int = 1,
    ) -> List[int]:
        """Tüm binalar için batch inference (sadece sınıf indeksleri)."""
        return [c for c, _ in self.classify_batch_with_confidence(pre_crops, post_crops, batch_size, tta_views)]


class _SiameseResNetDamageModel(nn.Module):
    """
    Matches checkpoints that store:
    - feature_extractor: torchvision ResNet backbone (children 0..8, up to avgpool)
    - classifier: MLP taking concatenated [f_pre, f_post, |diff|, f_pre* f_post] (8192 dims)
    """

    def __init__(self):
        super().__init__()
        resnet = torchvision.models.resnet50(weights=None)
        # conv1..avgpool (exclude fc)
        self.feature_extractor = nn.Sequential(*list(resnet.children())[:-1])
        self.classifier = nn.Sequential(
            nn.Linear(8192, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.5),
            nn.Linear(1024, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.5),
            nn.Linear(256, 4),
        )

    def _encode(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, 3, H, W)
        feats = self.feature_extractor(x)  # (B, 2048, 1, 1)
        return feats.flatten(1)  # (B, 2048)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Pipeline provides (B, 6, H, W): pre+post concatenated
        if x.shape[1] % 2 != 0:
            raise ValueError("Expected even channel count (pre+post).")
        half = x.shape[1] // 2
        pre = x[:, :half]
        post = x[:, half:]
        if pre.shape[1] != 3 or post.shape[1] != 3:
            raise ValueError(
                f"Expected 3-channel pre/post crops. Got pre={pre.shape[1]} post={post.shape[1]}"
            )

        f1 = self._encode(pre)
        f2 = self._encode(post)
        combined = torch.cat([f1, f2, (f1 - f2).abs(), f1 * f2], dim=1)  # (B, 8192)
        return self.classifier(combined)


class _SiameseResNetMultiHeadDamageModel(nn.Module):
    """
    Matches ordinal-loss checkpoints from the training notebooks:
    ResNet-18/34 feature extractor + shared trunk + binary/severity/ordinal heads.

    The pipeline expects four class logits. We convert the model heads into
    probabilities for [no-damage, minor, major, destroyed] and return log-probs
    so existing softmax/argmax inference code keeps working.
    """

    def __init__(self, backbone: str):
        super().__init__()
        if backbone == "resnet18":
            resnet = torchvision.models.resnet18(weights=None)
        elif backbone == "resnet34":
            resnet = torchvision.models.resnet34(weights=None)
        else:
            raise ValueError(f"Unsupported damage backbone: {backbone}")

        self.feature_extractor = nn.Sequential(*list(resnet.children())[:-1])
        self.trunk = nn.Sequential(
            nn.Linear(2048, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.5),
            nn.Linear(512, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
        )
        self.binary_head = nn.Linear(128, 2)
        self.severity_head = nn.Linear(128, 3)
        self.ordinal_head = nn.Linear(128, 2)

    def _encode(self, x: torch.Tensor) -> torch.Tensor:
        feats = self.feature_extractor(x)
        return feats.flatten(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.shape[1] % 2 != 0:
            raise ValueError("Expected even channel count (pre+post).")
        half = x.shape[1] // 2
        pre = x[:, :half]
        post = x[:, half:]
        if pre.shape[1] != 3 or post.shape[1] != 3:
            raise ValueError(
                f"Expected 3-channel pre/post crops. Got pre={pre.shape[1]} post={post.shape[1]}"
            )

        f1 = self._encode(pre)
        f2 = self._encode(post)
        combined = torch.cat([f1, f2, (f1 - f2).abs(), f1 * f2], dim=1)
        z = self.trunk(combined)

        binary_probs = torch.softmax(self.binary_head(z), dim=1)
        severity_probs = torch.softmax(self.severity_head(z), dim=1)

        no_damage = binary_probs[:, 0:1]
        damaged = binary_probs[:, 1:2] * severity_probs
        probs = torch.cat([no_damage, damaged], dim=1)
        return torch.log(probs.clamp_min(1e-8))
