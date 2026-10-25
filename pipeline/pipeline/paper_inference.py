"""
Paper (SAUCIS revision) inference path.

Reproduces exactly the end-to-end pipeline evaluated in the paper
(`02_end_to_end_eval` notebook / `e2e_lib.py` in the revision workspace):

  Stage 1  Building segmentation on the pre-disaster image, one of
             - SegFormer (MiT-B4): Hugging Face model directory; softmax(channel 1)
             - DualHeadUNet + ConvNeXt-Tiny: `best_model.pt` state_dict of the revision runs
               (07_seg_sfrecipe); sigmoid of the building head (the boundary head is used only in training)
           The model type is detected from --seg-model (directory -> SegFormer, DualHead state_dict -> DualHead).
           - global percentile (2-98) contrast stretch -> uint8
           - sliding window 512 px, stride 256 px, 4-flip TTA (id, h, v, hv)
           - building probability averaged over flips and overlapping windows
           - building mask = probability >= 0.5
  Stage 2  building instances
           - scipy.ndimage.label with 4-connectivity
           - components smaller than 10 px are not classified and are labelled no-damage
           - bounding box + 48 px padding, crops from globally min-max stretched pre/post images,
             resized to 224 x 224 (bilinear), ImageNet normalisation
  Stage 3  TwoHead Siamese ResNet (DiffAttention gate, trunk 2048->512->128)
           - embedding-level 6-view TTA (identity, h-flip, v-flip, rot 90/180/270)
           - binary head decides damaged / not damaged; severity = 0.5 * softmax(CE head)
             + 0.5 * CORN probabilities; final class = argmax over severity if damaged
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
import rasterio
import rasterio.features
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision
from affine import Affine
from scipy import ndimage
from shapely.geometry import Polygon, shape

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

PAPER_DEFAULTS = dict(
    tile=512,
    stride=256,
    seg_tta=True,
    seg_threshold=0.5,
    seg_batch=8,
    min_component_px=10,
    connectivity=4,
    pad=48,
    crop_size=224,
    cls_views=6,
    cls_batch=64,
)

# Batch sizes do not change the outputs (eval mode); they only set peak memory. On CPU, seg_batch=8 needs a
# single 1.6 GB decoder tensor for MiT-B4, so smaller batches are used unless set explicitly.
CPU_BATCH = dict(seg_batch=1, cls_batch=16)


# --------------------------------------------------------------------------- image reading
def read_rgb_float(path: str) -> np.ndarray:
    """First three bands (or repeated single band) as float32 HWC."""
    with rasterio.open(path) as src:
        arr = src.read()
    arr = arr[:3] if arr.shape[0] >= 3 else np.repeat(arr, 3, axis=0)
    return np.transpose(arr, (1, 2, 0)).astype(np.float32)


def percentile_uint8(arr: np.ndarray) -> np.ndarray:
    """SegFormer input: global 2-98 percentile stretch (as in segmentation training)."""
    p2, p98 = np.percentile(arr, (2, 98))
    return (np.clip((arr - p2) / (p98 - p2 + 1e-6), 0, 1) * 255).astype(np.uint8)


def minmax_uint8(arr: np.ndarray) -> np.ndarray:
    """Classifier crops: global min-max stretch over all bands (as in the crop dataset)."""
    mn, mx = float(arr.min()), float(arr.max())
    a = (arr - mn) / (mx - mn) if mx > mn else np.zeros_like(arr)
    return (a * 255).clip(0, 255).astype(np.uint8)


# --------------------------------------------------------------------------- stage 1
@torch.no_grad()
def segformer_probability(processor, model, img_u8: np.ndarray, device: str, cfg: dict) -> np.ndarray:
    """Building probability map (H, W) with sliding window + 4-flip TTA."""
    T, S = cfg["tile"], cfg["stride"]
    H, W = img_u8.shape[:2]
    th, tw = min(T, H), min(T, W)
    ys = sorted(set(list(range(0, max(H - T, 0) + 1, S)) + [max(H - T, 0)]))
    xs = sorted(set(list(range(0, max(W - T, 0) + 1, S)) + [max(W - T, 0)]))
    coords = [(y, x) for y in ys for x in xs]
    flips = [None, [3], [2], [2, 3]] if cfg["seg_tta"] else [None]
    p_sum = np.zeros((H, W), np.float32)
    wsum = np.zeros((H, W), np.float32)
    B = max(1, int(cfg["seg_batch"]))
    for i in range(0, len(coords), B):
        chunk = coords[i:i + B]
        pix = processor([img_u8[y:y + th, x:x + tw] for y, x in chunk], return_tensors="pt")["pixel_values"].to(device)
        acc = torch.zeros(len(chunk), th, tw, device=device)
        for dims in flips:
            x_in = torch.flip(pix, dims=dims) if dims else pix
            lg = model(pixel_values=x_in).logits
            lg = F.interpolate(lg, size=(th, tw), mode="bilinear", align_corners=False)
            if dims:
                lg = torch.flip(lg, dims=dims)
            acc += torch.softmax(lg.float(), dim=1)[:, 1]
        acc = (acc / len(flips)).cpu().numpy()
        for k, (y, x) in enumerate(chunk):
            p_sum[y:y + th, x:x + tw] += acc[k]
            wsum[y:y + th, x:x + tw] += 1.0
    return p_sum / np.maximum(wsum, 1e-6)


# --------------------------------------------------------------------------- stage 1, DualHeadUNet
SEG_ARCH_NAMES = {"segformer": "SegFormer (MiT-B4)", "dualhead": "DualHeadUNet + ConvNeXt-Tiny"}


class DualHeadUNet(nn.Module):
    """Same layout as `DualHeadUNet` in the segmentation training code (07_seg_sfrecipe):
    an smp U-Net whose segmentation head is the building head, plus a boundary head on the decoder output.
    encoder_weights=None: all weights come from the checkpoint (strict loading), nothing is downloaded."""

    def __init__(self, encoder_name: str = "tu-convnext_tiny"):
        super().__init__()
        import segmentation_models_pytorch as smp
        self.base = smp.Unet(encoder_name=encoder_name, encoder_weights=None, in_channels=3, classes=1)
        dec_ch = self.base.segmentation_head[0].in_channels
        self.building_head = self.base.segmentation_head
        self.boundary_head = nn.Sequential(
            nn.Conv2d(dec_ch, dec_ch, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(dec_ch, 1, kernel_size=1),
        )

    def forward(self, x):
        feats = self.base.encoder(x)
        try:
            dec = self.base.decoder(feats)          # segmentation-models-pytorch >= 0.5 (as in training)
        except TypeError:
            dec = self.base.decoder(*feats)         # older segmentation-models-pytorch
        return self.building_head(dec), self.boundary_head(dec)


def _unwrap_state_dict(obj):
    if isinstance(obj, nn.Module):
        return obj.state_dict()
    if isinstance(obj, dict):
        for k in ("model_state_dict", "state_dict"):
            if isinstance(obj.get(k), dict):
                return obj[k]
    return obj


def is_dualhead_state_dict(state_dict) -> bool:
    if not isinstance(state_dict, dict):
        return False
    keys = [k for k in state_dict if isinstance(k, str)]
    return any(k.startswith("boundary_head.") for k in keys) and any(k.startswith("base.encoder.") for k in keys)


def detect_seg_arch(model_path: str) -> str:
    """'segformer' for a Hugging Face model directory, 'dualhead' for a DualHeadUNet state_dict."""
    import os
    if os.path.isdir(model_path):
        return "segformer"
    sd = _unwrap_state_dict(torch.load(model_path, map_location="cpu", weights_only=False))
    if is_dualhead_state_dict(sd):
        return "dualhead"
    raise ValueError(f"{model_path}: unknown segmentation model. Expected a SegFormer directory "
                     "or a DualHeadUNet + ConvNeXt-Tiny state_dict (best_model.pt).")


class DualHeadSegmenter:
    """Loads a DualHeadUNet + ConvNeXt-Tiny checkpoint (strict) for paper-mode inference."""

    arch = "dualhead"
    name = SEG_ARCH_NAMES["dualhead"]

    def __init__(self, model_path: str, device: Optional[str] = None, encoder_name: str = "tu-convnext_tiny"):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        sd = _unwrap_state_dict(torch.load(model_path, map_location="cpu", weights_only=False))
        if not is_dualhead_state_dict(sd):
            raise ValueError(f"{model_path}: not a DualHeadUNet state_dict (expected base.encoder.* and boundary_head.* keys).")
        m = DualHeadUNet(encoder_name)
        m.load_state_dict(sd, strict=True)          # fails if a single layer differs from the training model
        self.model = m.to(self.device).eval()


@torch.no_grad()
def dualhead_probability(model: nn.Module, img_u8: np.ndarray, device: str, cfg: dict) -> np.ndarray:
    """Building probability map (H, W) with sliding window + 4-flip TTA; same windows, normalisation
    (ImageNet, x/255) and averaging as the evaluation code (`seg_alt_lib.scene_prob`)."""
    T, S = cfg["tile"], cfg["stride"]
    H, W = img_u8.shape[:2]
    th, tw = min(T, H), min(T, W)
    ys = sorted(set(list(range(0, max(H - T, 0) + 1, S)) + [max(H - T, 0)]))
    xs = sorted(set(list(range(0, max(W - T, 0) + 1, S)) + [max(W - T, 0)]))
    coords = [(y, x) for y in ys for x in xs]
    flips = [None, [3], [2], [2, 3]] if cfg["seg_tta"] else [None]
    p_sum = np.zeros((H, W), np.float32)
    wsum = np.zeros((H, W), np.float32)
    B = max(1, int(cfg["seg_batch"]))
    for i in range(0, len(coords), B):
        chunk = coords[i:i + B]
        tiles = np.stack([img_u8[y:y + th, x:x + tw] for y, x in chunk]).astype(np.float32)
        tiles = (tiles / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        imgs = torch.from_numpy(np.ascontiguousarray(tiles.transpose(0, 3, 1, 2))).to(device)
        acc = torch.zeros(len(chunk), th, tw, device=device)
        for dims in flips:
            x_in = torch.flip(imgs, dims=dims) if dims else imgs
            lg = model(x_in)[0]                                         # building head
            lg = F.interpolate(lg, size=(th, tw), mode="bilinear", align_corners=False)
            if dims:
                lg = torch.flip(lg, dims=dims)
            acc += torch.sigmoid(lg.float())[:, 0]
        acc = (acc / len(flips)).cpu().numpy()
        for k, (y, x) in enumerate(chunk):
            p_sum[y:y + th, x:x + tw] += acc[k]
            wsum[y:y + th, x:x + tw] += 1.0
    return p_sum / np.maximum(wsum, 1e-6)


# --------------------------------------------------------------------------- stage 2
_STRUCT = {4: ndimage.generate_binary_structure(2, 1), 8: ndimage.generate_binary_structure(2, 2)}


def extract_components(mask: np.ndarray, cfg: dict):
    """Returns labeled array, number of components, boxes/ids of classifiable components and ids of small ones."""
    labeled, n = ndimage.label(mask, structure=_STRUCT[cfg["connectivity"]])
    areas = np.bincount(labeled.ravel(), minlength=n + 1)
    H, W = mask.shape
    P = cfg["pad"]
    boxes, ids, small = [], [], []
    for cid, sl in enumerate(ndimage.find_objects(labeled), start=1):
        if sl is None:
            continue
        if areas[cid] < cfg["min_component_px"]:
            small.append(cid)
            continue
        boxes.append((max(0, sl[0].start - P), min(H, sl[0].stop + P), max(0, sl[1].start - P), min(W, sl[1].stop + P)))
        ids.append(cid)
    return labeled, n, boxes, ids, small


def component_polygons(labeled: np.ndarray, connectivity: int = 4) -> Dict[int, Polygon]:
    """One polygon per component in pixel coordinates (x = column, y = row); holes are kept."""
    polys: Dict[int, Polygon] = {}
    for geom, value in rasterio.features.shapes(labeled.astype(np.int32), mask=labeled > 0,
                                                connectivity=connectivity, transform=Affine.identity()):
        cid = int(value)
        g = shape(geom)
        if cid in polys:  # should not happen with matching connectivity; keep the larger part
            if g.area <= polys[cid].area:
                continue
        polys[cid] = g
    return polys


def make_crop_tensor(img_u8: np.ndarray, box: Tuple[int, int, int, int], size: int) -> torch.Tensor:
    y0, y1, x0, x1 = box
    crop = np.ascontiguousarray(img_u8[y0:y1, x0:x1])
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_LINEAR)
    x = (crop.astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    return torch.from_numpy(np.ascontiguousarray(x.transpose(2, 0, 1)))


# --------------------------------------------------------------------------- stage 3
class _DiffAttention(nn.Module):
    def __init__(self, dim: int, reduction: int = 4):
        super().__init__()
        self.gate = nn.Sequential(nn.Linear(dim, dim // reduction), nn.ReLU(inplace=True),
                                  nn.Linear(dim // reduction, dim), nn.Sigmoid())

    def forward(self, diff):
        return self.gate(diff) * diff


class TwoHeadSiamese(nn.Module):
    """Same layout as `classifier_lib.SiameseNet(head_mode='twohead')` used for training."""

    def __init__(self, backbone: str = "resnet34", use_diff_attn: bool = True):
        super().__init__()
        bb = getattr(torchvision.models, backbone)(weights=None)
        feat_dim = bb.fc.in_features
        self.feature_extractor = nn.Sequential(*list(bb.children())[:-1])
        self.diff_attn = _DiffAttention(feat_dim) if use_diff_attn else nn.Identity()
        self.trunk = nn.Sequential(
            nn.Linear(feat_dim * 4, 512), nn.BatchNorm1d(512), nn.ReLU(inplace=True), nn.Dropout(0.5),
            nn.Linear(512, 128), nn.BatchNorm1d(128), nn.ReLU(inplace=True), nn.Dropout(0.5))
        self.binary_head = nn.Linear(128, 2)
        self.severity_head = nn.Linear(128, 3)
        self.ordinal_head = nn.Linear(128, 2)

    def trunk_features(self, pre, post):
        fp = self.feature_extractor(pre).flatten(1)
        fq = self.feature_extractor(post).flatten(1)
        diff = self.diff_attn((fp - fq).abs())
        return self.trunk(torch.cat([fp, fq, diff, fp * fq], dim=1))


TTA_VIEWS = [
    lambda p, q: (p, q),
    lambda p, q: (torch.flip(p, [-1]), torch.flip(q, [-1])),
    lambda p, q: (torch.flip(p, [-2]), torch.flip(q, [-2])),
    lambda p, q: (torch.rot90(p, 1, [-2, -1]), torch.rot90(q, 1, [-2, -1])),
    lambda p, q: (torch.rot90(p, 2, [-2, -1]), torch.rot90(q, 2, [-2, -1])),
    lambda p, q: (torch.rot90(p, 3, [-2, -1]), torch.rot90(q, 3, [-2, -1])),
]


def _corn_class_probs(ord_logits: torch.Tensor) -> torch.Tensor:
    p = torch.sigmoid(ord_logits)
    B = p.size(0)
    p_gt = torch.cat([torch.ones(B, 1, device=p.device), p, torch.zeros(B, 1, device=p.device)], dim=1)
    return p_gt[:, :-1] - p_gt[:, 1:]


def is_twohead_state_dict(state_dict) -> bool:
    keys = set(state_dict.keys())
    return {"trunk.0.weight", "binary_head.weight", "severity_head.weight", "ordinal_head.weight"}.issubset(keys) \
        and any(k.startswith("feature_extractor.") for k in keys)


class TwoHeadDamageClassifier:
    """Loads a TwoHead state_dict (e.g. `final.pt` from the revision runs) and classifies crop pairs."""

    def __init__(self, model_path: str, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        obj = torch.load(model_path, map_location="cpu", weights_only=False)
        if isinstance(obj, nn.Module):
            obj = obj.state_dict()
        sd = obj.get("state_dict", obj.get("model_state_dict", obj)) if isinstance(obj, dict) else obj
        if not is_twohead_state_dict(sd):
            raise ValueError("Not a TwoHead state_dict (expected feature_extractor/trunk/binary/severity/ordinal heads).")
        use_diff = any(k.startswith("diff_attn.") for k in sd)
        trunk_in = sd["trunk.0.weight"].shape[1]
        backbone = {2048: None, 8192: "resnet50"}.get(trunk_in)
        last = None
        for cand in ([backbone] if backbone else ["resnet34", "resnet18"]):
            m = TwoHeadSiamese(cand, use_diff_attn=use_diff)
            try:
                m.load_state_dict(sd, strict=True)
                last = None
                self.backbone = cand
                break
            except RuntimeError as e:
                last = e
        if last is not None:
            raise last
        self.model = m.to(self.device).eval()
        self.has_diff_attn = use_diff

    @torch.no_grad()
    def classify(self, pre_t: torch.Tensor, post_t: torch.Tensor, n_views: int = 6) -> Tuple[np.ndarray, np.ndarray]:
        """pre_t/post_t: (B,3,224,224). Returns classes (0-3) and confidence of the chosen class."""
        p = pre_t.to(self.device)
        q = post_t.to(self.device)
        use_amp = self.device.startswith("cuda")
        with torch.autocast(device_type="cuda", enabled=use_amp):
            if n_views == 1:
                h = self.model.trunk_features(p, q)
            else:
                h = None
                for fn in TTA_VIEWS[:n_views]:
                    a, b = fn(p, q)
                    e = self.model.trunk_features(a, b).float()
                    h = e if h is None else h + e
                h = h / n_views
            lb = self.model.binary_head(h).float()
            ls = self.model.severity_head(h).float()
            lo = self.model.ordinal_head(h).float()
        pa = F.softmax(lb, dim=1)
        p_ce = F.softmax(ls, dim=1)
        p_ord = _corn_class_probs(lo).clamp(min=0)
        p_ord = p_ord / p_ord.sum(dim=1, keepdim=True).clamp(min=1e-8)
        pb = 0.5 * p_ce + 0.5 * p_ord
        bin_pred = pa.argmax(dim=1)
        sev_idx = pb.argmax(dim=1)
        final = torch.where(bin_pred == 0, torch.zeros_like(bin_pred), sev_idx + 1)
        conf_damaged = pa[:, 1] * pb.gather(1, sev_idx[:, None]).squeeze(1)
        conf = torch.where(bin_pred == 0, pa[:, 0], conf_damaged)
        return final.cpu().numpy().astype(int), conf.cpu().numpy().astype(float)


def classify_components(clf: TwoHeadDamageClassifier, pre_u8: np.ndarray, post_u8: np.ndarray,
                        boxes: Sequence[Tuple[int, int, int, int]], cfg: dict) -> Tuple[np.ndarray, np.ndarray, float, float]:
    """Returns classes, confidences, crop time (s), classification time (s)."""
    import time
    classes, confs = [], []
    crop_s = cls_s = 0.0
    B = cfg["cls_batch"]
    for i in range(0, len(boxes), B):
        t = time.perf_counter()
        pre_t = torch.stack([make_crop_tensor(pre_u8, b, cfg["crop_size"]) for b in boxes[i:i + B]])
        post_t = torch.stack([make_crop_tensor(post_u8, b, cfg["crop_size"]) for b in boxes[i:i + B]])
        crop_s += time.perf_counter() - t
        t = time.perf_counter()
        c, cf = clf.classify(pre_t, post_t, cfg["cls_views"])
        if clf.device.startswith("cuda"):
            torch.cuda.synchronize()
        cls_s += time.perf_counter() - t
        classes.append(c); confs.append(cf)
    if not classes:
        return np.zeros(0, int), np.zeros(0, float), crop_s, cls_s
    return np.concatenate(classes), np.concatenate(confs), crop_s, cls_s
