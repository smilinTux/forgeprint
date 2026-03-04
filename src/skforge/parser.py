"""SKForge blueprint parser — loads features.yml and BLUEPRINT.md.

Parses the structured YAML feature catalogs used by SKForge blueprints
into Pydantic models with dependency resolution support.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger("skforge.parser")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class Feature(BaseModel):
    """A single feature from a blueprint's features.yml."""

    name: str
    description: str = ""
    complexity: str = "medium"
    default: bool = False
    dependencies: list[str] = Field(default_factory=list)


class FeatureGroup(BaseModel):
    """A group of related features."""

    name: str
    description: str = ""
    features: list[Feature] = Field(default_factory=list)


class ForgeDependencies(BaseModel):
    """Dependency declarations from features.yml."""

    runtime: list[str] = Field(default_factory=list)
    optional: list[str] = Field(default_factory=list)
    development: list[str] = Field(default_factory=list)


class ForgeBlueprint(BaseModel):
    """A parsed SKForge blueprint with features and metadata."""

    name: str
    slug: str
    version: str = "1.0.0"
    description: str = ""
    groups: list[FeatureGroup] = Field(default_factory=list)
    dependencies: ForgeDependencies = Field(default_factory=ForgeDependencies)
    blueprint_md: str = ""

    @property
    def all_features(self) -> list[Feature]:
        """Flatten all features from all groups."""
        return [f for g in self.groups for f in g.features]

    @property
    def feature_map(self) -> dict[str, Feature]:
        """Map feature name to Feature object."""
        return {f.name: f for f in self.all_features}

    @property
    def default_features(self) -> list[str]:
        """Names of features that are enabled by default."""
        return [f.name for f in self.all_features if f.default]

    def resolve_features(self, selected: list[str]) -> list[str]:
        """Resolve selected features with their transitive dependencies.

        Args:
            selected: List of feature names to enable.

        Returns:
            Sorted list of all features (selected + dependencies).

        Raises:
            ValueError: If a selected feature doesn't exist.
        """
        fmap = self.feature_map
        for name in selected:
            if name not in fmap:
                raise ValueError(f"Unknown feature: {name}")

        resolved: set[str] = set()
        stack = list(selected)

        while stack:
            name = stack.pop()
            if name in resolved:
                continue
            resolved.add(name)
            feat = fmap.get(name)
            if feat:
                for dep in feat.dependencies:
                    if dep not in resolved and dep in fmap:
                        stack.append(dep)

        return sorted(resolved)

    def dependency_graph(self) -> dict[str, list[str]]:
        """Return the feature dependency graph.

        Returns:
            Dict mapping feature name to list of dependency names.
        """
        return {f.name: list(f.dependencies) for f in self.all_features}


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_features(path: Path) -> ForgeBlueprint:
    """Parse a features.yml file into a ForgeBlueprint.

    Args:
        path: Path to features.yml.

    Returns:
        ForgeBlueprint with all groups and features.

    Raises:
        FileNotFoundError: If file doesn't exist.
        ValueError: If YAML is invalid.
    """
    if not path.exists():
        raise FileNotFoundError(f"Features file not found: {path}")

    raw = path.read_text(encoding="utf-8")
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML in {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Expected YAML mapping in {path}")

    name = data.get("name", path.parent.name)
    slug = _slugify(path.parent.name)
    version = data.get("version", "1.0.0")
    description = data.get("description", "")

    groups: list[FeatureGroup] = []
    for group_data in data.get("groups", []):
        features: list[Feature] = []
        for feat_data in group_data.get("features", []):
            features.append(Feature(
                name=feat_data.get("name", ""),
                description=feat_data.get("description", ""),
                complexity=str(feat_data.get("complexity", "medium")),
                default=feat_data.get("default", False),
                dependencies=feat_data.get("dependencies", []),
            ))
        groups.append(FeatureGroup(
            name=group_data.get("name", ""),
            description=group_data.get("description", ""),
            features=features,
        ))

    deps_data = data.get("dependencies", {})
    deps = ForgeDependencies(
        runtime=_normalize_dep_list(deps_data.get("runtime", [])),
        optional=_normalize_dep_list(deps_data.get("optional", [])),
        development=_normalize_dep_list(deps_data.get("development", [])),
    )

    return ForgeBlueprint(
        name=name,
        slug=slug,
        version=version,
        description=description,
        groups=groups,
        dependencies=deps,
    )


def load_blueprint(blueprint_dir: Path) -> ForgeBlueprint:
    """Load a complete blueprint from its directory.

    Reads features.yml and BLUEPRINT.md if present.

    Args:
        blueprint_dir: Directory containing BLUEPRINT.md and features.yml.

    Returns:
        ForgeBlueprint with features and markdown content.

    Raises:
        FileNotFoundError: If features.yml doesn't exist.
    """
    features_path = blueprint_dir / "features.yml"
    bp = parse_features(features_path)

    md_path = blueprint_dir / "BLUEPRINT.md"
    if md_path.exists():
        bp.blueprint_md = md_path.read_text(encoding="utf-8")

    return bp


def _normalize_dep_list(items: list) -> list[str]:
    """Normalize dependency entries to plain strings.

    Handles two YAML formats:
      - Plain string: "pydantic>=2.0"
      - Dict: {pydantic: ">=2.0"} → "pydantic>=2.0"
    """
    result: list[str] = []
    for item in items:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            for pkg, version in item.items():
                result.append(f"{pkg}{version}")
        else:
            result.append(str(item))
    return result


def _slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    import re

    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug.strip("-")
