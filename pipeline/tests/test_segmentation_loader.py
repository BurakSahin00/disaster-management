import tempfile
import unittest
from pathlib import Path
import sys

import segmentation_models_pytorch as smp
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.segmentation import SegmentationModel


class SegmentationLoaderTests(unittest.TestCase):
    def test_loads_raw_smp_unet_state_dict_without_metadata(self):
        model = smp.Unet(
            encoder_name="efficientnet-b0",
            encoder_weights=None,
            in_channels=3,
            classes=1,
            activation=None,
        )

        with tempfile.TemporaryDirectory() as tmp:
            checkpoint_path = Path(tmp) / "segmentation.pth"
            torch.save(model.state_dict(), checkpoint_path)

            loaded = SegmentationModel(str(checkpoint_path), device="cpu")

        self.assertIsInstance(loaded.model, torch.nn.Module)


if __name__ == "__main__":
    unittest.main()
