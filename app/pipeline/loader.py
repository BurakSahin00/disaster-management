import numpy as np
import rasterio
from rasterio.windows import Window
from typing import Generator, Tuple


class TiffLoader:
    def __init__(self, tile_size: int = 512, overlap: int = 64):
        self.tile_size = tile_size
        self.overlap = overlap
        self.stride = tile_size - overlap

    def load_metadata(self, path: str) -> dict:
        with rasterio.open(path) as src:
            return {
                "width": src.width,
                "height": src.height,
                "count": src.count,
                "crs": src.crs,
                "transform": src.transform,
                "dtype": src.dtypes[0],
            }

    def read_full(self, path: str) -> np.ndarray:
        """Küçük dosyalar için tamamını oku. Shape: (C, H, W)"""
        with rasterio.open(path) as src:
            return src.read()

    def tiles(self, path: str) -> Generator[Tuple[np.ndarray, Window], None, None]:
        """Büyük TIFF'i tile'lara bölerek yield eder. Her tile: (array, window)"""
        with rasterio.open(path) as src:
            h, w = src.height, src.width
            for row_off in range(0, h, self.stride):
                for col_off in range(0, w, self.stride):
                    # Sınır taşmasını önle
                    win_h = min(self.tile_size, h - row_off)
                    win_w = min(self.tile_size, w - col_off)
                    window = Window(col_off, row_off, win_w, win_h)
                    tile = src.read(window=window)  # (C, H, W)

                    # Eksik boyutları pad et
                    if win_h < self.tile_size or win_w < self.tile_size:
                        pad_h = self.tile_size - win_h
                        pad_w = self.tile_size - win_w
                        tile = np.pad(tile, ((0, 0), (0, pad_h), (0, pad_w)))

                    yield tile, window

    def stitch_masks(self, shape: Tuple[int, int], tiles_with_windows) -> np.ndarray:
        """
        Tile mask'lerini tam görüntü boyutuna birleştirir.
        Overlap bölgelerinde merkez crop kullanır (blending yok).
        """
        full_mask = np.zeros(shape, dtype=np.float32)
        count_map = np.zeros(shape, dtype=np.float32)
        half_ov = self.overlap // 2

        for mask, window in tiles_with_windows:
            r, c = window.row_off, window.col_off
            h, w = window.height, window.width

            # Overlap kenarlarını kırp (kenar tile'lar hariç)
            r_start = half_ov if r > 0 else 0
            c_start = half_ov if c > 0 else 0
            r_end = h - half_ov if r + self.tile_size < shape[0] else h
            c_end = w - half_ov if c + self.tile_size < shape[1] else w

            full_mask[r + r_start:r + r_end, c + c_start:c + c_end] += mask[r_start:r_end, c_start:c_end]
            count_map[r + r_start:r + r_end, c + c_start:c + c_end] += 1

        count_map = np.maximum(count_map, 1)
        return full_mask / count_map
