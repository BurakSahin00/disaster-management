from __future__ import annotations

import os


def ensure_proj_data() -> None:
    """
    Work around Windows PROJ database conflicts (e.g., PostGIS shipping an incompatible proj.db).

    Strategy: prefer pyproj's bundled data directory by setting PROJ_LIB if it's not already set.
    """
    if os.environ.get("PROJ_LIB"):
        return
    try:
        import pyproj.datadir  # type: ignore

        os.environ["PROJ_LIB"] = pyproj.datadir.get_data_dir()
        # Avoid network access in projection routines.
        os.environ.setdefault("PROJ_NETWORK", "OFF")
    except Exception:
        # If pyproj isn't available, keep default behavior.
        return

