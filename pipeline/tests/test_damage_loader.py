import tempfile
import unittest
from pathlib import Path
import sys

import torch
import torch.nn as nn
import torchvision

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.damage import DamageClassifier


class ResNet34MultiHeadFixture(nn.Module):
    def __init__(self):
        super().__init__()
        resnet = torchvision.models.resnet34(weights=None)
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


class DamageLoaderTests(unittest.TestCase):
    def test_loads_raw_resnet34_multihead_state_dict(self):
        model = ResNet34MultiHeadFixture()

        with tempfile.TemporaryDirectory() as tmp:
            checkpoint_path = Path(tmp) / "damage.pth"
            torch.save(model.state_dict(), checkpoint_path)

            loaded = DamageClassifier(str(checkpoint_path), device="cpu")
            loaded.model.eval()
            logits = loaded.model(torch.zeros((2, 6, 224, 224), dtype=torch.float32))

        self.assertEqual(tuple(logits.shape), (2, 4))


if __name__ == "__main__":
    unittest.main()
