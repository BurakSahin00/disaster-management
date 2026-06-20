import argparse
from pipeline import DamageAnalysisPipeline


def main():
    parser = argparse.ArgumentParser(description="Bina Hasar Analizi Pipeline")
    parser.add_argument("--pre", required=True, help="Afet öncesi TIFF yolu")
    parser.add_argument("--post", required=True, help="Afet sonrası TIFF yolu")
    parser.add_argument("--seg-model", required=True, help="Segmentasyon modeli (.pth)")
    parser.add_argument("--dmg-model", required=True, help="Hasar sınıflandırma modeli (.pth)")
    parser.add_argument("--output", default="outputs", help="Çıktı klasörü")
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--overlap", type=int, default=64)
    parser.add_argument("--device", default=None, help="cuda veya cpu")
    args = parser.parse_args()

    pipeline = DamageAnalysisPipeline(
        seg_model_path=args.seg_model,
        dmg_model_path=args.dmg_model,
        tile_size=args.tile_size,
        overlap=args.overlap,
        device=args.device,
    )
    pipeline.run(args.pre, args.post, args.output)


if __name__ == "__main__":
    main()
