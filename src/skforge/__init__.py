"""SKForge Python Engine — parse blueprints, resolve features, deploy teams.

The Python engine provides programmatic access to SKForge blueprints:
- Parse features.yml and BLUEPRINT.md files
- Resolve feature dependency graphs
- Generate driver.md files with selected features
- Convert blueprints into skcapstone BlueprintManifest for deployment

Quick start:
    from skforge import BlueprintCatalog
    catalog = BlueprintCatalog("/path/to/blueprints")
    bp = catalog.get("sovereign-agent-sdk")
    features = bp.resolve_features(["agent-class", "remember-api"])
    driver = bp.generate_driver(features)
"""

__version__ = "0.1.0"
__author__ = "smilinTux Team"
__license__ = "GPL-3.0-or-later"

from .parser import Feature, FeatureGroup, ForgeBlueprint, parse_features
from .catalog import BlueprintCatalog
from .driver import generate_driver

__all__ = [
    "Feature",
    "FeatureGroup",
    "ForgeBlueprint",
    "BlueprintCatalog",
    "parse_features",
    "generate_driver",
    "__version__",
]
