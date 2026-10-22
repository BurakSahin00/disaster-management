import argparse
from pipeline import DamageAnalysisPipeline


def main():
    parser = argparse.ArgumentParser(description="Bina Hasar Analizi Pipeline")
    parser.add_argument("--pre", required=True, help="Afet öncesi TIFF yolu")
    parser.add_argument("--post", required=True, help="Afet sonrası TIFF yolu")
    parser.add_argument("--seg-model", required=True, help="Segmentasyon modeli: HuggingFace dizini (SegFormer) veya .pth dosyası")
    parser.add_argument("--dmg-model", required=True, help="Hasar sınıflandırma modeli (.pth)")
    parser.add_argument("--output", default="outputs", help="Çıktı klasörü")
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--overlap", type=int, default=64)
    parser.add_argument("--device", default=None, help="cuda veya cpu")
    parser.add_argument("--mode", default="paper", choices=["paper", "legacy"],
                        help="paper: makalede değerlendirilen boru hattı (varsayılan); legacy: eski platform hattı")
    parser.add_argument("--stride", type=int, default=None, help="[paper] SegFormer pencere adımı (varsayılan 256)")
    parser.add_argument("--no-seg-tta", action="store_true", help="[paper] SegFormer 4-flip TTA'yı kapat")
    parser.add_argument("--cls-views", type=int, default=None, help="[paper] sınıflandırıcı TTA görünüm sayısı (varsayılan 6)")
    parser.add_argument("--min-component-px", type=int, default=None, help="[paper] sınıflandırılmayacak küçük bileşen eşiği (varsayılan 10)")
    parser.add_argument("--seg-batch", type=int, default=None, help="[paper] SegFormer pencere batch'i (varsayılan GPU 8, CPU 1)")
    parser.add_argument("--cls-batch", type=int, default=None, help="[paper] sınıflandırıcı batch'i (varsayılan GPU 64, CPU 16)")
    args = parser.parse_args()

    pipeline = DamageAnalysisPipeline(
        seg_model_path=args.seg_model,
        dmg_model_path=args.dmg_model,
        tile_size=args.tile_size,
        overlap=args.overlap,
        device=args.device,
        mode=args.mode,
        paper_cfg={
            "stride": args.stride,
            "seg_tta": False if args.no_seg_tta else None,
            "cls_views": args.cls_views,
            "min_component_px": args.min_component_px,
            "seg_batch": args.seg_batch,
            "cls_batch": args.cls_batch,
        },
    )
    pipeline.run(args.pre, args.post, args.output)


if __name__ == "__main__":
    main()
