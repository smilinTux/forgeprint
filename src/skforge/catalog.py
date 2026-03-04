"""BlueprintCatalog — discovers and indexes SKForge blueprints.

Scans a blueprints directory tree for categories containing
features.yml files, providing lookup, listing, and search.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .parser import ForgeBlueprint, load_blueprint

logger = logging.getLogger("skforge.catalog")

# Directories to skip during category discovery.
_SKIP_DIRS = {"TEMPLATE", "__pycache__", ".git", "node_modules"}


class BlueprintCatalog:
    """Read-only index of SKForge blueprints on disk.

    Args:
        blueprints_dir: Path to the top-level blueprints/ directory.

    Usage::

        catalog = BlueprintCatalog("/path/to/skforge/blueprints")
        for name in catalog.list():
            bp = catalog.get(name)
            print(bp.name, len(bp.all_features), "features")
    """

    def __init__(self, blueprints_dir: str | Path) -> None:
        self._root = Path(blueprints_dir)
        self._cache: dict[str, ForgeBlueprint] = {}
        self._categories: Optional[list[str]] = None

    def _discover(self) -> list[str]:
        """Discover category directories containing features.yml."""
        if not self._root.is_dir():
            return []
        cats: list[str] = []
        for child in sorted(self._root.iterdir()):
            if not child.is_dir() or child.name in _SKIP_DIRS:
                continue
            if (child / "features.yml").exists():
                cats.append(child.name)
        return cats

    def list(self) -> list[str]:
        """List all available blueprint category slugs.

        Returns:
            Sorted list of category directory names.
        """
        if self._categories is None:
            self._categories = self._discover()
        return list(self._categories)

    def get(self, slug: str) -> ForgeBlueprint:
        """Load a blueprint by its category slug.

        Args:
            slug: Category directory name (e.g. "sovereign-agent-sdk").

        Returns:
            ForgeBlueprint with features and optional BLUEPRINT.md content.

        Raises:
            KeyError: If slug not found in catalog.
            FileNotFoundError: If features.yml missing.
            ValueError: If YAML is invalid.
        """
        if slug not in self.list():
            raise KeyError(f"Blueprint not found: {slug}")
        if slug not in self._cache:
            bp_dir = self._root / slug
            self._cache[slug] = load_blueprint(bp_dir)
        return self._cache[slug]

    def search(self, query: str) -> list[str]:
        """Search blueprints by name or description.

        Performs case-insensitive substring match against
        blueprint name, slug, and description.

        Args:
            query: Search string.

        Returns:
            List of matching category slugs.
        """
        q = query.lower()
        matches: list[str] = []
        for slug in self.list():
            if q in slug.lower():
                matches.append(slug)
                continue
            try:
                bp = self.get(slug)
                if q in bp.name.lower() or q in bp.description.lower():
                    matches.append(slug)
            except Exception:
                continue
        return matches

    def count(self) -> int:
        """Return the number of available blueprints."""
        return len(self.list())

    def summary(self) -> list[dict]:
        """Return a summary of all blueprints.

        Returns:
            List of dicts with slug, name, feature_count, and group_count.
        """
        result: list[dict] = []
        for slug in self.list():
            try:
                bp = self.get(slug)
                result.append({
                    "slug": slug,
                    "name": bp.name,
                    "feature_count": len(bp.all_features),
                    "group_count": len(bp.groups),
                })
            except Exception as exc:
                result.append({
                    "slug": slug,
                    "name": slug,
                    "feature_count": 0,
                    "group_count": 0,
                    "error": str(exc),
                })
        return result

    def reload(self) -> None:
        """Clear caches and re-discover blueprints."""
        self._cache.clear()
        self._categories = None
