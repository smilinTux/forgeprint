"""Driver generator — produces driver.md from selected features.

A driver.md is a focused specification that tells an AI code generator
exactly which features to implement and in what order.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from .parser import ForgeBlueprint


def generate_driver(
    blueprint: ForgeBlueprint,
    selected: Optional[list[str]] = None,
) -> str:
    """Generate a driver.md document from a blueprint and selected features.

    If no features are selected, uses the blueprint's default features.
    Dependencies are automatically resolved and included.

    Args:
        blueprint: The parsed ForgeBlueprint.
        selected: Feature names to enable. Defaults to blueprint defaults.

    Returns:
        Markdown string for driver.md.
    """
    if selected is None:
        selected = blueprint.default_features

    resolved = blueprint.resolve_features(selected)
    fmap = blueprint.feature_map

    lines: list[str] = []

    # Header
    lines.append(f"# {blueprint.name} — Driver")
    lines.append("")
    lines.append(f"**Generated**: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"**Blueprint**: {blueprint.slug} v{blueprint.version}")
    lines.append(f"**Features**: {len(resolved)} selected")
    lines.append("")

    if blueprint.description:
        lines.append(f"> {blueprint.description}")
        lines.append("")

    # Selected features grouped by their original group
    lines.append("## Selected Features")
    lines.append("")

    for group in blueprint.groups:
        group_features = [f for f in group.features if f.name in resolved]
        if not group_features:
            continue

        lines.append(f"### {group.name}")
        if group.description:
            lines.append(f"_{group.description}_")
        lines.append("")

        for feat in group_features:
            marker = "x" if feat.name in selected else " "
            dep_note = ""
            if feat.name not in selected and feat.name in resolved:
                dep_note = " *(dependency)*"
            lines.append(f"- [{marker}] **{feat.name}** — {feat.description}{dep_note}")
            if feat.dependencies:
                deps_str = ", ".join(f"`{d}`" for d in feat.dependencies)
                lines.append(f"  - Depends on: {deps_str}")
        lines.append("")

    # Dependency summary
    deps = blueprint.dependencies
    has_deps = deps.runtime or deps.optional or deps.development
    if has_deps:
        lines.append("## Dependencies")
        lines.append("")
        if deps.runtime:
            lines.append("**Runtime:**")
            for d in deps.runtime:
                lines.append(f"- {d}")
            lines.append("")
        if deps.optional:
            lines.append("**Optional:**")
            for d in deps.optional:
                lines.append(f"- {d}")
            lines.append("")
        if deps.development:
            lines.append("**Development:**")
            for d in deps.development:
                lines.append(f"- {d}")
            lines.append("")

    # Implementation order
    lines.append("## Implementation Order")
    lines.append("")
    lines.append("Features sorted with dependencies first:")
    lines.append("")

    ordered = _topo_sort(resolved, blueprint.dependency_graph())
    for i, name in enumerate(ordered, 1):
        feat = fmap.get(name)
        if feat:
            lines.append(f"{i}. `{name}` ({feat.complexity})")

    lines.append("")
    return "\n".join(lines)


def _topo_sort(features: list[str], graph: dict[str, list[str]]) -> list[str]:
    """Topological sort of features by dependency order.

    Features with no dependencies come first.
    Falls back to alphabetical for ties.
    """
    feature_set = set(features)
    in_degree: dict[str, int] = {f: 0 for f in features}

    for feat in features:
        for dep in graph.get(feat, []):
            if dep in feature_set:
                in_degree[feat] = in_degree.get(feat, 0) + 1

    queue = sorted([f for f in features if in_degree[f] == 0])
    result: list[str] = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for feat in features:
            if node in graph.get(feat, []) and feat not in result:
                in_degree[feat] -= 1
                if in_degree[feat] == 0:
                    queue.append(feat)
                    queue.sort()

    # Any remaining features (cycles) go at the end
    for f in sorted(features):
        if f not in result:
            result.append(f)

    return result
