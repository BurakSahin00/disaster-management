from __future__ import annotations

import sys
from pathlib import Path

import torch


def inspect(path: Path) -> None:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    print("file:", path.as_posix())
    print("type:", type(ckpt))
    if isinstance(ckpt, dict):
        keys = list(ckpt.keys())
        print("top_level_keys:", keys[:50])
        for k in ["arch", "encoder_name", "model_state_dict"]:
            if k in ckpt:
                v = ckpt[k]
                if k == "model_state_dict" and isinstance(v, dict):
                    print("model_state_dict_keys_sample:", list(v.keys())[:30])
                    print("model_state_dict_len:", len(v))
                else:
                    print(f"{k}:", v)
        sd = ckpt.get("state_dict", ckpt)
        if isinstance(sd, dict):
            ks = list(sd.keys())
            print("state_dict_sample:", ks[:30])
            print("state_dict_tail:", ks[-20:])
            print("state_dict_len:", len(ks))
            # show a couple shapes for inference
            shown = 0
            for k in ks:
                v = sd[k]
                if hasattr(v, "shape"):
                    print("param:", k, "shape:", tuple(v.shape))
                    shown += 1
                if shown >= 8:
                    break
            for k in ks:
                if not k.startswith("classifier."):
                    continue
                v = sd[k]
                if hasattr(v, "shape"):
                    print("classifier_param:", k, "shape:", tuple(v.shape))
    print("-" * 60)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python pipeline/tests/inspect_ckpt.py <path1> [path2...]")
        return 2
    for arg in sys.argv[1:]:
        inspect(Path(arg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

