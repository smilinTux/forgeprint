"""Tests for SKForge Python engine — parser, catalog, and driver."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest
import yaml

from skforge.parser import (
    Feature,
    FeatureGroup,
    ForgeDependencies,
    ForgeBlueprint,
    parse_features,
    load_blueprint,
)
from skforge.catalog import BlueprintCatalog
from skforge.driver import generate_driver, _topo_sort


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_FEATURES_YAML = dedent("""\
    name: Test Blueprint
    version: "1.0.0"
    description: A test blueprint.
    groups:
      - name: Core
        description: Core features
        features:
          - name: feature-a
            description: The first feature
            complexity: low
            default: true
          - name: feature-b
            description: The second feature
            complexity: medium
            default: false
            dependencies: [feature-a]
""")

FULL_FEATURES_YAML = dedent("""\
    name: Full Blueprint
    version: "2.0.0"
    description: A comprehensive blueprint for testing.
    groups:
      - name: Foundation
        description: Base layer
        features:
          - name: core
            description: Core functionality
            complexity: high
            default: true
          - name: config
            description: Configuration system
            complexity: medium
            default: true
            dependencies: [core]
          - name: logging
            description: Structured logging
            complexity: low
            default: true
            dependencies: [core]
      - name: Networking
        description: Network capabilities
        features:
          - name: http-client
            description: HTTP client
            complexity: medium
            default: false
            dependencies: [core, config]
          - name: websocket
            description: WebSocket support
            complexity: high
            default: false
            dependencies: [http-client]
          - name: p2p
            description: Peer-to-peer transport
            complexity: high
            default: false
            dependencies: [http-client, config]
      - name: Storage
        description: Data persistence
        features:
          - name: sqlite
            description: SQLite backend
            complexity: low
            default: true
            dependencies: [core]
          - name: redis
            description: Redis cache
            complexity: medium
            default: false
            dependencies: [core, config]
    dependencies:
      runtime:
        - pydantic>=2.0
        - httpx>=0.25
      optional:
        - redis>=5.0
      development:
        - pytest>=7.0
""")


@pytest.fixture
def features_file(tmp_path: Path) -> Path:
    p = tmp_path / "test-bp" / "features.yml"
    p.parent.mkdir()
    p.write_text(MINIMAL_FEATURES_YAML)
    return p


@pytest.fixture
def full_features_file(tmp_path: Path) -> Path:
    p = tmp_path / "full-bp" / "features.yml"
    p.parent.mkdir()
    p.write_text(FULL_FEATURES_YAML)
    return p


@pytest.fixture
def blueprint_dir(tmp_path: Path) -> Path:
    bp_dir = tmp_path / "my-blueprint"
    bp_dir.mkdir()
    (bp_dir / "features.yml").write_text(MINIMAL_FEATURES_YAML)
    (bp_dir / "BLUEPRINT.md").write_text("# My Blueprint\n\nA test blueprint.\n")
    return bp_dir


@pytest.fixture
def catalog_dir(tmp_path: Path) -> Path:
    """Create a mock blueprints directory with multiple categories."""
    root = tmp_path / "blueprints"
    root.mkdir()

    for name in ("alpha", "beta", "gamma"):
        cat_dir = root / name
        cat_dir.mkdir()
        content = dedent(f"""\
            name: {name.title()} Blueprint
            version: "1.0.0"
            description: The {name} blueprint.
            groups:
              - name: Core
                features:
                  - name: {name}-core
                    description: Core of {name}
                    complexity: low
                    default: true
        """)
        (cat_dir / "features.yml").write_text(content)

    # Add a TEMPLATE dir that should be skipped
    (root / "TEMPLATE").mkdir()
    (root / "TEMPLATE" / "features.yml").write_text("name: Template\ngroups: []\n")

    # Add a dir without features.yml (should be skipped)
    (root / "no-features").mkdir()

    # Add a non-directory file (should be skipped)
    (root / "LICENSE").write_text("GPL-3.0")

    return root


# ---------------------------------------------------------------------------
# Parser — Models
# ---------------------------------------------------------------------------


class TestModels:
    def test_feature_defaults(self) -> None:
        f = Feature(name="test")
        assert f.description == ""
        assert f.complexity == "medium"
        assert f.default is False
        assert f.dependencies == []

    def test_feature_group_defaults(self) -> None:
        g = FeatureGroup(name="group")
        assert g.features == []

    def test_forge_dependencies_defaults(self) -> None:
        d = ForgeDependencies()
        assert d.runtime == []
        assert d.optional == []
        assert d.development == []

    def test_blueprint_all_features(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[
                FeatureGroup(name="a", features=[
                    Feature(name="f1"), Feature(name="f2"),
                ]),
                FeatureGroup(name="b", features=[
                    Feature(name="f3"),
                ]),
            ],
        )
        assert [f.name for f in bp.all_features] == ["f1", "f2", "f3"]

    def test_blueprint_feature_map(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="alpha"), Feature(name="beta"),
            ])],
        )
        assert set(bp.feature_map.keys()) == {"alpha", "beta"}

    def test_blueprint_default_features(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="on", default=True),
                Feature(name="off", default=False),
                Feature(name="also-on", default=True),
            ])],
        )
        assert bp.default_features == ["on", "also-on"]


# ---------------------------------------------------------------------------
# Parser — Feature Resolution
# ---------------------------------------------------------------------------


class TestFeatureResolution:
    def test_resolve_no_deps(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="a"), Feature(name="b"),
            ])],
        )
        assert bp.resolve_features(["a"]) == ["a"]

    def test_resolve_with_deps(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="base"),
                Feature(name="mid", dependencies=["base"]),
                Feature(name="top", dependencies=["mid"]),
            ])],
        )
        resolved = bp.resolve_features(["top"])
        assert set(resolved) == {"base", "mid", "top"}

    def test_resolve_transitive(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="a"),
                Feature(name="b", dependencies=["a"]),
                Feature(name="c", dependencies=["b"]),
                Feature(name="d", dependencies=["c"]),
            ])],
        )
        resolved = bp.resolve_features(["d"])
        assert set(resolved) == {"a", "b", "c", "d"}

    def test_resolve_unknown_feature_raises(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[Feature(name="a")])],
        )
        with pytest.raises(ValueError, match="Unknown feature"):
            bp.resolve_features(["nonexistent"])

    def test_resolve_diamond_deps(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="root"),
                Feature(name="left", dependencies=["root"]),
                Feature(name="right", dependencies=["root"]),
                Feature(name="top", dependencies=["left", "right"]),
            ])],
        )
        resolved = bp.resolve_features(["top"])
        assert set(resolved) == {"root", "left", "right", "top"}

    def test_dependency_graph(self) -> None:
        bp = ForgeBlueprint(
            name="test", slug="test",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="a", dependencies=["b", "c"]),
                Feature(name="b"),
                Feature(name="c", dependencies=["b"]),
            ])],
        )
        graph = bp.dependency_graph()
        assert graph == {"a": ["b", "c"], "b": [], "c": ["b"]}


# ---------------------------------------------------------------------------
# Parser — File Parsing
# ---------------------------------------------------------------------------


class TestParsing:
    def test_parse_minimal(self, features_file: Path) -> None:
        bp = parse_features(features_file)
        assert bp.name == "Test Blueprint"
        assert bp.slug == "test-bp"
        assert bp.version == "1.0.0"
        assert len(bp.groups) == 1
        assert len(bp.all_features) == 2

    def test_parse_full(self, full_features_file: Path) -> None:
        bp = parse_features(full_features_file)
        assert bp.name == "Full Blueprint"
        assert bp.version == "2.0.0"
        assert len(bp.groups) == 3
        assert len(bp.all_features) == 8
        assert bp.dependencies.runtime == ["pydantic>=2.0", "httpx>=0.25"]
        assert bp.dependencies.optional == ["redis>=5.0"]
        assert bp.dependencies.development == ["pytest>=7.0"]

    def test_parse_feature_details(self, features_file: Path) -> None:
        bp = parse_features(features_file)
        fmap = bp.feature_map
        fa = fmap["feature-a"]
        assert fa.complexity == "low"
        assert fa.default is True
        assert fa.dependencies == []

        fb = fmap["feature-b"]
        assert fb.complexity == "medium"
        assert fb.default is False
        assert fb.dependencies == ["feature-a"]

    def test_parse_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            parse_features(tmp_path / "nope.yml")

    def test_parse_invalid_yaml(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad" / "features.yml"
        bad.parent.mkdir()
        bad.write_text(":\n  - :\n    bad: [")
        with pytest.raises(ValueError, match="Invalid YAML"):
            parse_features(bad)

    def test_parse_non_mapping(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad" / "features.yml"
        bad.parent.mkdir()
        bad.write_text("- just a list\n- not a mapping\n")
        with pytest.raises(ValueError, match="Expected YAML mapping"):
            parse_features(bad)

    def test_load_blueprint_with_md(self, blueprint_dir: Path) -> None:
        bp = load_blueprint(blueprint_dir)
        assert "# My Blueprint" in bp.blueprint_md

    def test_load_blueprint_without_md(self, tmp_path: Path) -> None:
        bp_dir = tmp_path / "no-md"
        bp_dir.mkdir()
        (bp_dir / "features.yml").write_text(MINIMAL_FEATURES_YAML)
        bp = load_blueprint(bp_dir)
        assert bp.blueprint_md == ""

    def test_slug_from_dirname(self, tmp_path: Path) -> None:
        bp_dir = tmp_path / "My_Cool Blueprint"
        bp_dir.mkdir()
        (bp_dir / "features.yml").write_text(MINIMAL_FEATURES_YAML)
        bp = parse_features(bp_dir / "features.yml")
        assert bp.slug == "my-cool-blueprint"


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


class TestCatalog:
    def test_list(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        names = catalog.list()
        assert names == ["alpha", "beta", "gamma"]
        assert "TEMPLATE" not in names
        assert "no-features" not in names
        assert "LICENSE" not in names

    def test_get(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        bp = catalog.get("alpha")
        assert bp.name == "Alpha Blueprint"
        assert len(bp.all_features) == 1
        assert bp.all_features[0].name == "alpha-core"

    def test_get_caches(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        bp1 = catalog.get("beta")
        bp2 = catalog.get("beta")
        assert bp1 is bp2

    def test_get_missing_raises(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        with pytest.raises(KeyError, match="Blueprint not found"):
            catalog.get("nonexistent")

    def test_search_by_slug(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.search("alpha") == ["alpha"]

    def test_search_by_name(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.search("Beta Blueprint") == ["beta"]

    def test_search_by_description(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        results = catalog.search("gamma")
        assert "gamma" in results

    def test_search_case_insensitive(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.search("ALPHA") == ["alpha"]

    def test_search_no_results(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.search("zzz-nothing") == []

    def test_count(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.count() == 3

    def test_summary(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        summaries = catalog.summary()
        assert len(summaries) == 3
        alpha_s = next(s for s in summaries if s["slug"] == "alpha")
        assert alpha_s["name"] == "Alpha Blueprint"
        assert alpha_s["feature_count"] == 1

    def test_reload(self, catalog_dir: Path) -> None:
        catalog = BlueprintCatalog(catalog_dir)
        assert catalog.count() == 3

        # Add a new blueprint
        new_dir = catalog_dir / "delta"
        new_dir.mkdir()
        (new_dir / "features.yml").write_text(
            "name: Delta\ngroups:\n  - name: Core\n    features:\n"
            "      - name: delta-core\n        description: Delta core\n"
        )
        catalog.reload()
        assert catalog.count() == 4
        assert "delta" in catalog.list()

    def test_empty_dir(self, tmp_path: Path) -> None:
        catalog = BlueprintCatalog(tmp_path / "empty")
        assert catalog.list() == []
        assert catalog.count() == 0


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


class TestDriver:
    @pytest.fixture
    def blueprint(self) -> ForgeBlueprint:
        return ForgeBlueprint(
            name="Test Project",
            slug="test-project",
            version="1.0.0",
            description="A test project for driver generation.",
            groups=[
                FeatureGroup(name="Foundation", description="Base layer", features=[
                    Feature(name="core", description="Core system", complexity="high", default=True),
                    Feature(name="config", description="Config loader", complexity="medium",
                            default=True, dependencies=["core"]),
                ]),
                FeatureGroup(name="Extras", description="Optional extras", features=[
                    Feature(name="plugin-api", description="Plugin system", complexity="high",
                            default=False, dependencies=["core", "config"]),
                    Feature(name="telemetry", description="Usage tracking", complexity="low",
                            default=False, dependencies=["core"]),
                ]),
            ],
            dependencies=ForgeDependencies(
                runtime=["pydantic>=2.0"],
                development=["pytest>=7.0"],
            ),
        )

    def test_generate_defaults(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint)
        assert "# Test Project — Driver" in driver
        assert "test-project v1.0.0" in driver
        assert "**core**" in driver
        assert "**config**" in driver
        # Plugin-api is not default, should not appear
        assert "plugin-api" not in driver

    def test_generate_selected(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint, selected=["plugin-api"])
        assert "**plugin-api**" in driver
        # Dependencies should be resolved
        assert "**core**" in driver
        assert "**config**" in driver

    def test_generate_includes_description(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint)
        assert "A test project for driver generation." in driver

    def test_generate_includes_deps(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint)
        assert "pydantic>=2.0" in driver
        assert "pytest>=7.0" in driver

    def test_generate_implementation_order(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint, selected=["plugin-api"])
        assert "Implementation Order" in driver
        # core should come before config, config before plugin-api
        lines = driver.split("\n")
        order_lines = [l for l in lines if l.startswith(("1.", "2.", "3."))]
        assert len(order_lines) == 3
        assert "`core`" in order_lines[0]
        assert "`config`" in order_lines[1]
        assert "`plugin-api`" in order_lines[2]

    def test_generate_no_deps_section_when_empty(self) -> None:
        bp = ForgeBlueprint(
            name="Minimal", slug="minimal",
            groups=[FeatureGroup(name="g", features=[
                Feature(name="only", default=True),
            ])],
        )
        driver = generate_driver(bp)
        assert "## Dependencies" not in driver

    def test_dependency_marker(self, blueprint: ForgeBlueprint) -> None:
        driver = generate_driver(blueprint, selected=["plugin-api"])
        # core and config are dependencies, not directly selected
        assert "*(dependency)*" in driver


# ---------------------------------------------------------------------------
# Topo Sort
# ---------------------------------------------------------------------------


class TestTopoSort:
    def test_linear_chain(self) -> None:
        result = _topo_sort(
            ["a", "b", "c"],
            {"a": [], "b": ["a"], "c": ["b"]},
        )
        assert result == ["a", "b", "c"]

    def test_diamond(self) -> None:
        result = _topo_sort(
            ["root", "left", "right", "top"],
            {"root": [], "left": ["root"], "right": ["root"], "top": ["left", "right"]},
        )
        assert result.index("root") < result.index("left")
        assert result.index("root") < result.index("right")
        assert result.index("left") < result.index("top")
        assert result.index("right") < result.index("top")

    def test_no_deps(self) -> None:
        result = _topo_sort(["c", "a", "b"], {"a": [], "b": [], "c": []})
        assert result == ["a", "b", "c"]  # alphabetical

    def test_single(self) -> None:
        result = _topo_sort(["x"], {"x": []})
        assert result == ["x"]

    def test_empty(self) -> None:
        result = _topo_sort([], {})
        assert result == []


# ---------------------------------------------------------------------------
# Integration — Real Blueprints
# ---------------------------------------------------------------------------


SKFORGE_ROOT = Path(__file__).resolve().parent.parent


class TestRealBlueprints:
    """Integration tests against the actual blueprints/ directory."""

    @pytest.fixture
    def real_blueprints_dir(self) -> Path:
        bp_dir = SKFORGE_ROOT / "blueprints"
        if not bp_dir.is_dir():
            pytest.skip("blueprints/ directory not found")
        return bp_dir

    def test_catalog_discovers_all(self, real_blueprints_dir: Path) -> None:
        catalog = BlueprintCatalog(real_blueprints_dir)
        names = catalog.list()
        assert len(names) >= 25
        assert "sovereign-agent-sdk" in names
        assert "TEMPLATE" not in names

    def test_parse_sovereign_agent_sdk(self, real_blueprints_dir: Path) -> None:
        catalog = BlueprintCatalog(real_blueprints_dir)
        bp = catalog.get("sovereign-agent-sdk")
        assert bp.name == "Sovereign Agent SDK (SKSovereign-Agent)"
        assert len(bp.all_features) >= 50
        assert len(bp.groups) >= 10

    def test_resolve_real_features(self, real_blueprints_dir: Path) -> None:
        catalog = BlueprintCatalog(real_blueprints_dir)
        bp = catalog.get("sovereign-agent-sdk")
        resolved = bp.resolve_features(["agent-class"])
        assert "agent-class" in resolved

    def test_generate_real_driver(self, real_blueprints_dir: Path) -> None:
        catalog = BlueprintCatalog(real_blueprints_dir)
        bp = catalog.get("sovereign-agent-sdk")
        driver = generate_driver(bp, selected=["agent-class", "lazy-subsystem-loading"])
        assert "# Sovereign Agent SDK" in driver
        assert "agent-class" in driver

    def test_all_blueprints_parse(self, real_blueprints_dir: Path) -> None:
        """Every blueprint in the catalog should parse without error."""
        catalog = BlueprintCatalog(real_blueprints_dir)
        failures: list[str] = []
        for slug in catalog.list():
            try:
                bp = catalog.get(slug)
                assert bp.name
            except Exception as exc:
                failures.append(f"{slug}: {exc}")
        assert failures == [], f"Failed blueprints:\n" + "\n".join(failures)
