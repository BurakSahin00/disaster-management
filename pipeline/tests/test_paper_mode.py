"""Paper-mode pipeline: loads a TwoHead (DiffAttention) checkpoint, runs SegFormer or DualHeadUNet TTA +
4-connected components, and writes consistent outputs. Uses a tiny random SegFormer, a random DualHeadUNet
(ConvNeXt-Tiny, no download) and an injected probability map, CPU only."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
import torch
from rasterio.transform import from_origin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import DamageAnalysisPipeline  # noqa: E402
from pipeline import paper_inference as paper  # noqa: E402


def _write(path, arr):
    h, w, _ = arr.shape
    with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=3, dtype="uint8", crs="EPSG:4326",
                       transform=from_origin(30.0, 40.0, 4.5e-6, 4.5e-6)) as d:
        d.write(np.transpose(arr, (2, 0, 1)))


class PaperModeTests(unittest.TestCase):
    def setUp(self):
        from transformers import SegformerConfig, SegformerForSemanticSegmentation, SegformerImageProcessor
        self.tmp = Path(tempfile.mkdtemp())
        rng = np.random.default_rng(0)
        pre = rng.integers(40, 90, (1024, 1024, 3)).astype(np.uint8)
        post = pre.copy()
        pre[100:140, 100:150] = 210; post[100:140, 100:150] = 60      # building 1
        pre[300:330, 400:430] = 210                                     # building 2
        pre[600:602, 600:603] = 210                                     # 6 px component -> not classified
        _write(self.tmp / "pre.tif", pre); _write(self.tmp / "post.tif", post)
        conf = SegformerConfig(num_channels=3, num_encoder_blocks=4, depths=[1, 1, 1, 1], sr_ratios=[8, 4, 2, 1],
                               hidden_sizes=[8, 16, 32, 64], num_attention_heads=[1, 1, 2, 2], decoder_hidden_size=32, num_labels=2)
        SegformerForSemanticSegmentation(conf).save_pretrained(self.tmp / "seg")
        SegformerImageProcessor(size={"height": 512, "width": 512}).save_pretrained(self.tmp / "seg")
        torch.save(paper.TwoHeadSiamese("resnet18", use_diff_attn=True).state_dict(), self.tmp / "final.pt")

    def test_probability_shape_and_range(self):
        pl = DamageAnalysisPipeline(str(self.tmp / "seg"), str(self.tmp / "final.pt"), device="cpu", mode="paper")
        img = paper.percentile_uint8(paper.read_rgb_float(str(self.tmp / "pre.tif")))
        prob = paper.segformer_probability(pl.seg_model._processor, pl.seg_model._hf_model, img, "cpu", pl.cfg)
        self.assertEqual(prob.shape, (1024, 1024))
        self.assertTrue(0.0 <= prob.min() and prob.max() <= 1.0)

    def test_end_to_end_outputs(self):
        pl = DamageAnalysisPipeline(str(self.tmp / "seg"), str(self.tmp / "final.pt"), device="cpu", mode="paper")
        self.assertTrue(pl.dmg_model.has_diff_attn)
        original = paper.segformer_probability
        prob = np.zeros((1024, 1024), np.float32)
        prob[100:140, 100:150] = prob[300:330, 400:430] = prob[600:602, 600:603] = 0.9
        paper.segformer_probability = lambda proc, model, img, dev, cfg: prob
        try:
            pl.run(str(self.tmp / "pre.tif"), str(self.tmp / "post.tif"), str(self.tmp / "out"))
        finally:
            paper.segformer_probability = original
        rep = json.loads((self.tmp / "out" / "report.json").read_text())
        self.assertEqual(rep["timing"]["n_components"], 3)
        self.assertEqual(rep["timing"]["n_classified"], 2)
        self.assertEqual(rep["timing"]["n_small"], 1)
        gj = json.loads((self.tmp / "out" / "buildings.geojson").read_text())
        self.assertEqual(len(gj["features"]), 3)
        small = [f for f in gj["features"] if not f["properties"]["classified"]]
        self.assertEqual(len(small), 1)
        self.assertEqual(small[0]["properties"]["damage_class"], 0)
        with rasterio.open(self.tmp / "out" / "damage_map.tif") as d:
            vals = set(np.unique(d.read(1)).tolist())
        self.assertTrue(vals <= {0, 1, 2, 3, 255})

    def test_cpu_batches_and_nested_output_dir(self):
        pl = DamageAnalysisPipeline(str(self.tmp / "seg"), str(self.tmp / "final.pt"), device="cpu", mode="paper")
        self.assertEqual((pl.cfg["seg_batch"], pl.cfg["cls_batch"]), (1, 16))
        pl2 = DamageAnalysisPipeline(str(self.tmp / "seg"), str(self.tmp / "final.pt"), device="cpu", mode="paper",
                                     paper_cfg={"seg_batch": 4})
        self.assertEqual((pl2.cfg["seg_batch"], pl2.cfg["cls_batch"]), (4, 16))
        img = paper.percentile_uint8(paper.read_rgb_float(str(self.tmp / "pre.tif")))
        p1 = paper.segformer_probability(pl.seg_model._processor, pl.seg_model._hf_model, img, "cpu", pl.cfg)
        p8 = paper.segformer_probability(pl.seg_model._processor, pl.seg_model._hf_model, img, "cpu", dict(pl.cfg, seg_batch=8))
        self.assertLess(float(np.abs(p1 - p8).max()), 1e-5)   # batch size does not change the output
        out = self.tmp / "a" / "b" / "out"
        pl.run(str(self.tmp / "pre.tif"), str(self.tmp / "post.tif"), str(out))
        self.assertTrue((out / "report.json").exists())

    # ------------------------------------------------------------------ DualHeadUNet + ConvNeXt-Tiny
    def _dualhead_ckpt(self):
        torch.manual_seed(0)
        path = self.tmp / "dualhead_best_model.pt"
        torch.save(paper.DualHeadUNet().state_dict(), path)      # same format as best_model.pt (plain state_dict)
        return path

    def test_detects_segmentation_model_type(self):
        self.assertEqual(paper.detect_seg_arch(str(self.tmp / "seg")), "segformer")
        self.assertEqual(paper.detect_seg_arch(str(self._dualhead_ckpt())), "dualhead")
        torch.save({"foo.weight": torch.zeros(1)}, self.tmp / "other.pt")
        with self.assertRaises(ValueError):
            paper.detect_seg_arch(str(self.tmp / "other.pt"))

    def test_dualhead_probability_shape_range_and_flip_equivariance(self):
        seg = paper.DualHeadSegmenter(str(self._dualhead_ckpt()), device="cpu")
        cfg = dict(paper.PAPER_DEFAULTS)
        img = np.random.default_rng(1).integers(0, 256, (640, 640, 3)).astype(np.uint8)
        prob = paper.dualhead_probability(seg.model, img, "cpu", cfg)
        self.assertEqual(prob.shape, (640, 640))
        self.assertTrue(0.0 <= prob.min() and prob.max() <= 1.0)
        # 4-flip TTA + symmetric windows: flipping the input flips the probability map
        prob_h = paper.dualhead_probability(seg.model, img[:, ::-1].copy(), "cpu", cfg)
        np.testing.assert_allclose(prob_h, prob[:, ::-1], atol=1e-5)

    def test_dualhead_end_to_end_outputs(self):
        pl = DamageAnalysisPipeline(str(self._dualhead_ckpt()), str(self.tmp / "final.pt"), device="cpu", mode="paper")
        self.assertEqual(pl.seg_arch, "dualhead")
        self.assertEqual((pl.cfg["seg_batch"], pl.cfg["cls_batch"]), (1, 16))   # CPU batches apply to DualHead too
        original = paper.dualhead_probability
        prob = np.zeros((1024, 1024), np.float32)
        prob[100:140, 100:150] = prob[300:330, 400:430] = prob[600:602, 600:603] = 0.9
        paper.dualhead_probability = lambda model, img, dev, cfg: prob
        try:
            pl.run(str(self.tmp / "pre.tif"), str(self.tmp / "post.tif"), str(self.tmp / "out_dh"))
        finally:
            paper.dualhead_probability = original
        rep = json.loads((self.tmp / "out_dh" / "report.json").read_text())
        self.assertEqual(rep["models"]["segmentation_arch"], "dualhead")
        self.assertEqual(rep["timing"]["seg_model"], "DualHeadUNet + ConvNeXt-Tiny")
        self.assertEqual(rep["timing"]["n_components"], 3)
        self.assertEqual(rep["timing"]["n_classified"], 2)

    def test_segformer_still_selected_for_directory(self):
        pl = DamageAnalysisPipeline(str(self.tmp / "seg"), str(self.tmp / "final.pt"), device="cpu", mode="paper")
        self.assertEqual(pl.seg_arch, "segformer")
        self.assertTrue(pl.seg_model._is_segformer)

    def test_loads_checkpoint_without_diff_attn(self):
        torch.save(paper.TwoHeadSiamese("resnet34", use_diff_attn=False).state_dict(), self.tmp / "old.pt")
        clf = paper.TwoHeadDamageClassifier(str(self.tmp / "old.pt"), device="cpu")
        self.assertFalse(clf.has_diff_attn)
        self.assertEqual(clf.backbone, "resnet34")
        c, cf = clf.classify(torch.zeros(2, 3, 224, 224), torch.zeros(2, 3, 224, 224), n_views=6)
        self.assertEqual(c.shape, (2,))
        self.assertTrue(np.all((cf >= 0) & (cf <= 1)))


if __name__ == "__main__":
    unittest.main()
