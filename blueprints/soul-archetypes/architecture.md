# Soul Archetypes (Souls-Blueprints) Architecture

## System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  CLI (list/show/compile/blend)  │  Python API  │  Agent SDK   │
├────────────────────────────────────────────────────────────────┤
│                      Compiler Layer                            │
│  Soul → System Prompt  │  Token budgeting  │  Format adapters  │
├────────────────────────────────────────────────────────────────┤
│                      Composition Layer                         │
│  Inheritance resolver  │  Blender  │  Trait merger             │
├────────────────────────────────────────────────────────────────┤
│                      Validation Layer                          │
│  Schema validation  │  Content safety  │  Injection scanning   │
├────────────────────────────────────────────────────────────────┤
│                      Loading Layer                             │
│  YAML parser  │  Catalog indexer  │  Version resolver          │
├────────────────────────────────────────────────────────────────┤
│                      Soul Library                              │
│  70+ YAML soul definitions organized by category              │
└────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Soul Loading Pipeline

```
Soul YAML file on disk
        │
        ▼
YAML Parser (PyYAML)
        │
        ▼
Pydantic Schema Validation
  ├── Verify required fields present
  ├── Clamp trait intensities to [0.0, 1.0]
  ├── Validate enum values (category, tone, risk_tolerance)
  └── Reject unknown fields
        │
        ▼
Inheritance Resolution
  ├── Load base soul if `extends` is set
  ├── Deep-merge base traits with overrides
  ├── Apply trait removals
  └── Recurse for deep inheritance chains
        │
        ▼
Content Safety Validation
  ├── Check ethical_bounds are present
  ├── Scan examples for injection patterns
  ├── Verify villain souls have safety rails
  └── Warn on missing use_cases.worst
        │
        ▼
Validated Soul Object (ready for compilation or blending)
```

### Soul Schema (Pydantic Models)

```python
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class SoulCategory(str, Enum):
    PROFESSIONAL = "professional"
    COMEDY = "comedy"
    CULTURE_ICON = "culture_icon"
    SUPERHERO = "superhero"
    VILLAIN = "villain"
    AUTHENTIC_CONNECTION = "authentic_connection"
    CUSTOM = "custom"


class JungianArchetype(str, Enum):
    HEALER = "Healer"
    TRICKSTER = "Trickster"
    SAGE = "Sage"
    HERO = "Hero"
    CREATOR = "Creator"
    RULER = "Ruler"
    CAREGIVER = "Caregiver"
    EXPLORER = "Explorer"
    REBEL = "Rebel"
    LOVER = "Lover"
    MAGICIAN = "Magician"
    JESTER = "Jester"


class RiskTolerance(str, Enum):
    AVERSE = "averse"
    CAUTIOUS = "cautious"
    BALANCED = "balanced"
    ADVENTUROUS = "adventurous"
    BOLD = "bold"


class HumorType(str, Enum):
    DRY = "dry"
    SLAPSTICK = "slapstick"
    WORDPLAY = "wordplay"
    SARCASTIC = "sarcastic"
    NONE = "none"


class HumorFrequency(str, Enum):
    RARE = "rare"
    OCCASIONAL = "occasional"
    FREQUENT = "frequent"
    CONSTANT = "constant"


class VocabLevel(str, Enum):
    ACADEMIC = "academic"
    PROFESSIONAL = "professional"
    CASUAL = "casual"
    STREET = "street"
    MIXED = "mixed"


class ParagraphLength(str, Enum):
    SHORT = "short"
    MEDIUM = "medium"
    LONG = "long"


# ── Trait ──────────────────────────────────────────────────────

class TraitExpression(BaseModel):
    verbal: str = ""
    behavioral: str = ""
    relational: str = ""


class Trait(BaseModel):
    name: str
    intensity: float = Field(ge=0.0, le=1.0)
    description: str = ""
    triggers: list[str] = Field(default_factory=list)
    expression: TraitExpression = Field(default_factory=TraitExpression)

    @field_validator("intensity")
    @classmethod
    def clamp_intensity(cls, v: float) -> float:
        return max(0.0, min(1.0, v))


# ── Communication ──────────────────────────────────────────────

class Vocabulary(BaseModel):
    level: VocabLevel = VocabLevel.MIXED
    jargon: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)


class Humor(BaseModel):
    type: HumorType = HumorType.NONE
    frequency: HumorFrequency = HumorFrequency.RARE


class Formatting(BaseModel):
    uses_emoji: bool = False
    uses_lists: bool = True
    paragraph_length: ParagraphLength = ParagraphLength.MEDIUM
    code_style: str = "blocks"


class EmotionalRange(BaseModel):
    excitement: str = ""
    concern: str = ""
    disagreement: str = ""
    praise: str = ""


class CommunicationStyle(BaseModel):
    tone: str = "neutral"
    vocabulary: Vocabulary = Field(default_factory=Vocabulary)
    signature_phrases: list[str] = Field(default_factory=list)
    greeting_style: str = ""
    farewell_style: str = ""
    humor: Humor = Field(default_factory=Humor)
    formatting: Formatting = Field(default_factory=Formatting)
    emotional_range: EmotionalRange = Field(default_factory=EmotionalRange)


# ── Decision Framework ─────────────────────────────────────────

class DecisionFramework(BaseModel):
    primary_driver: str = "balanced"
    risk_tolerance: RiskTolerance = RiskTolerance.BALANCED
    uncertainty_response: str = ""
    conflict_style: str = ""
    priorities: list[str] = Field(default_factory=list)
    ethical_bounds: list[str] = Field(default_factory=list)
    delegation_tendency: str = ""


# ── Energy ─────────────────────────────────────────────────────

class EnergyPattern(BaseModel):
    peak_topics: list[str] = Field(default_factory=list)
    drain_topics: list[str] = Field(default_factory=list)
    recovery: str = ""
    enthusiasm_markers: list[str] = Field(default_factory=list)
    fatigue_markers: list[str] = Field(default_factory=list)
    flow_triggers: list[str] = Field(default_factory=list)
    session_arc: str = ""


# ── Examples ───────────────────────────────────────────────────

class RolePlayExample(BaseModel):
    scenario: str
    user_input: str
    soul_response: str
    annotations: str = ""
    trait_highlights: list[str] = Field(default_factory=list)


# ── Top-Level Soul ─────────────────────────────────────────────

class Identity(BaseModel):
    vibe: str = ""
    philosophy: str = ""
    archetype: JungianArchetype = JungianArchetype.SAGE
    alignment: str = "True Neutral"


class UseCases(BaseModel):
    best: list[str] = Field(default_factory=list)
    worst: list[str] = Field(default_factory=list)


class Compatibility(BaseModel):
    pairs_well_with: list[str] = Field(default_factory=list)
    conflicts_with: list[str] = Field(default_factory=list)


class Soul(BaseModel):
    """Complete soul definition."""

    soul_id: str
    name: str
    category: SoulCategory
    version: str = "1.0.0"
    extends: Optional[str] = None
    blend_with: list[str] = Field(default_factory=list)
    blend_strategy: str = "average"

    identity: Identity = Field(default_factory=Identity)
    core_traits: list[Trait] = Field(default_factory=list)
    communication: CommunicationStyle = Field(default_factory=CommunicationStyle)
    decision_framework: DecisionFramework = Field(default_factory=DecisionFramework)
    energy: EnergyPattern = Field(default_factory=EnergyPattern)
    examples: list[RolePlayExample] = Field(default_factory=list)
    use_cases: UseCases = Field(default_factory=UseCases)
    the_promise: str = ""
    compatibility: Compatibility = Field(default_factory=Compatibility)
```

### Soul Loader with Inheritance Resolution

```python
from pathlib import Path
from typing import Any

import yaml

from souls_blueprints.schema import Soul, Trait


class SoulLoader:
    """
    Load soul YAML files with inheritance and caching.
    """

    def __init__(self, library_path: Path):
        self.library_path = library_path
        self._cache: dict[str, Soul] = {}
        self._resolving: set[str] = set()  # Circular dependency detection

    def load(self, soul_id: str) -> Soul:
        """Load a soul by ID, resolving inheritance chain."""
        if soul_id in self._cache:
            return self._cache[soul_id]

        # Circular dependency check
        if soul_id in self._resolving:
            raise ValueError(
                f"Circular inheritance detected: {soul_id} -> ... -> {soul_id}"
            )
        self._resolving.add(soul_id)

        # Find YAML file
        yaml_path = self._find_soul_file(soul_id)
        if yaml_path is None:
            raise FileNotFoundError(f"Soul not found: {soul_id}")

        # Parse YAML
        with open(yaml_path) as f:
            raw = yaml.safe_load(f)

        # Resolve inheritance
        if raw.get("extends"):
            base = self.load(raw["extends"])
            raw = self._merge_with_base(base.model_dump(), raw)

        # Validate and create Soul object
        soul = Soul(**raw)

        # Cache and return
        self._cache[soul_id] = soul
        self._resolving.discard(soul_id)
        return soul

    def load_from_path(self, path: Path) -> Soul:
        """Load a soul from an explicit file path."""
        with open(path) as f:
            raw = yaml.safe_load(f)

        if raw.get("extends"):
            base = self.load(raw["extends"])
            raw = self._merge_with_base(base.model_dump(), raw)

        return Soul(**raw)

    def list_souls(self) -> list[dict[str, str]]:
        """List all available souls with summary info."""
        souls = []
        for yaml_file in self.library_path.rglob("*.yml"):
            try:
                with open(yaml_file) as f:
                    raw = yaml.safe_load(f)
                souls.append({
                    "soul_id": raw.get("soul_id", yaml_file.stem),
                    "name": raw.get("name", "Unknown"),
                    "category": raw.get("category", "custom"),
                    "vibe": raw.get("identity", {}).get("vibe", ""),
                    "path": str(yaml_file),
                })
            except Exception:
                continue
        return sorted(souls, key=lambda s: (s["category"], s["name"]))

    def _find_soul_file(self, soul_id: str) -> Path | None:
        """Search library for a soul YAML file by ID."""
        # Direct name match
        for yaml_file in self.library_path.rglob("*.yml"):
            try:
                with open(yaml_file) as f:
                    raw = yaml.safe_load(f)
                if raw.get("soul_id") == soul_id:
                    return yaml_file
            except Exception:
                continue

        # Filename match as fallback
        for yaml_file in self.library_path.rglob(f"{soul_id}.yml"):
            return yaml_file

        return None

    def _merge_with_base(self, base: dict, child: dict) -> dict:
        """
        Deep merge child soul onto base soul.

        Rules:
        - Child values override base values
        - Lists are replaced (not appended)
        - Trait removals: child can list trait names in '_remove_traits'
        - Nested dicts are recursively merged
        """
        result = self._deep_merge(base, child)

        # Handle trait removals
        remove_traits = child.get("_remove_traits", [])
        if remove_traits and "core_traits" in result:
            result["core_traits"] = [
                t for t in result["core_traits"]
                if t.get("name") not in remove_traits
            ]

        # Remove internal keys
        result.pop("_remove_traits", None)
        result.pop("extends", None)

        return result

    def _deep_merge(self, base: dict, overlay: dict) -> dict:
        """Recursive dict merge, overlay wins."""
        result = base.copy()
        for key, value in overlay.items():
            if (
                key in result
                and isinstance(result[key], dict)
                and isinstance(value, dict)
            ):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result
```

### Soul Compiler

```python
from souls_blueprints.schema import Soul, Trait, RolePlayExample


class SoulCompiler:
    """
    Compile a Soul definition into an LLM system prompt.

    Strategies:
    - Full: all sections, up to 8000 tokens
    - Compact: essential sections, under 4000 tokens
    - Minimal: identity + traits + promise, under 1500 tokens
    """

    def __init__(self, max_tokens: int = 8000):
        self.max_tokens = max_tokens

    def compile(self, soul: Soul, strategy: str = "full") -> str:
        """Compile soul to system prompt string."""
        if strategy == "minimal":
            return self._compile_minimal(soul)
        elif strategy == "compact":
            return self._compile_compact(soul)
        else:
            return self._compile_full(soul)

    def _compile_full(self, soul: Soul) -> str:
        """Full compilation with all sections."""
        sections = [
            self._identity_section(soul),
            self._traits_section(soul),
            self._communication_section(soul),
            self._decision_section(soul),
            self._energy_section(soul),
            self._examples_section(soul),
            self._promise_section(soul),
        ]

        prompt = "\n\n".join(s for s in sections if s)

        # Trim examples if over budget
        token_count = self._estimate_tokens(prompt)
        if token_count > self.max_tokens:
            prompt = self._trim_to_budget(soul, prompt)

        return prompt

    def _compile_compact(self, soul: Soul) -> str:
        """Compact compilation: identity, traits, communication, promise."""
        sections = [
            self._identity_section(soul),
            self._traits_section(soul),
            self._communication_section(soul),
            self._promise_section(soul),
        ]
        return "\n\n".join(s for s in sections if s)

    def _compile_minimal(self, soul: Soul) -> str:
        """Minimal compilation: identity, top traits, promise."""
        lines = [
            f"You are {soul.name}.",
            f"Vibe: {soul.identity.vibe}",
            f"Philosophy: {soul.identity.philosophy}",
            "",
            "Core traits:",
        ]

        # Top 4 traits by intensity
        sorted_traits = sorted(
            soul.core_traits, key=lambda t: t.intensity, reverse=True
        )
        for trait in sorted_traits[:4]:
            lines.append(f"- {trait.name} ({trait.intensity:.1f}): {trait.description}")

        if soul.the_promise:
            lines.extend(["", f"Your promise: {soul.the_promise}"])

        return "\n".join(lines)

    def _identity_section(self, soul: Soul) -> str:
        """Compile identity block."""
        lines = [
            f"# You are {soul.name}",
            "",
            f"**Vibe**: {soul.identity.vibe}",
            "",
            f"**Philosophy**: {soul.identity.philosophy}",
            "",
            f"**Archetype**: {soul.identity.archetype.value}",
        ]
        return "\n".join(lines)

    def _traits_section(self, soul: Soul) -> str:
        """Compile traits as behavioral instructions."""
        lines = ["## Your Core Traits", ""]

        # Sort by intensity (most dominant first)
        sorted_traits = sorted(
            soul.core_traits, key=lambda t: t.intensity, reverse=True
        )

        for trait in sorted_traits:
            intensity_label = self._intensity_label(trait.intensity)
            lines.append(f"### {trait.name} ({intensity_label})")
            lines.append(trait.description)

            if trait.expression.verbal:
                lines.append(f"- **In words**: {trait.expression.verbal}")
            if trait.expression.behavioral:
                lines.append(f"- **In action**: {trait.expression.behavioral}")
            if trait.expression.relational:
                lines.append(f"- **With others**: {trait.expression.relational}")

            if trait.triggers:
                triggers = ", ".join(trait.triggers)
                lines.append(f"- **Activates when**: {triggers}")

            lines.append("")

        return "\n".join(lines)

    def _communication_section(self, soul: Soul) -> str:
        """Compile communication style as instructions."""
        comm = soul.communication
        lines = ["## How You Communicate", ""]

        lines.append(f"**Tone**: {comm.tone}")

        if comm.vocabulary.jargon:
            jargon = ", ".join(f'"{j}"' for j in comm.vocabulary.jargon[:8])
            lines.append(f"**Natural vocabulary**: {jargon}")

        if comm.vocabulary.avoid:
            avoid = ", ".join(f'"{a}"' for a in comm.vocabulary.avoid)
            lines.append(f"**Never say**: {avoid}")

        if comm.signature_phrases:
            lines.append("")
            lines.append("**Phrases that feel like you**:")
            for phrase in comm.signature_phrases:
                lines.append(f'- "{phrase}"')

        if comm.humor.type != "none":
            lines.append(
                f"\n**Humor**: {comm.humor.type.value}, "
                f"{comm.humor.frequency.value}"
            )

        # Formatting rules
        rules = []
        if not comm.formatting.uses_emoji:
            rules.append("Do not use emoji.")
        if comm.formatting.paragraph_length == "short":
            rules.append("Keep paragraphs short (1-3 sentences).")
        if rules:
            lines.append("\n**Formatting rules**: " + " ".join(rules))

        # Emotional range
        er = comm.emotional_range
        if any([er.excitement, er.concern, er.disagreement, er.praise]):
            lines.append("")
            lines.append("**Emotional expression**:")
            if er.excitement:
                lines.append(f"- Excitement: {er.excitement}")
            if er.concern:
                lines.append(f"- Concern: {er.concern}")
            if er.disagreement:
                lines.append(f"- Disagreement: {er.disagreement}")
            if er.praise:
                lines.append(f"- Praise: {er.praise}")

        return "\n".join(lines)

    def _decision_section(self, soul: Soul) -> str:
        """Compile decision framework."""
        df = soul.decision_framework
        lines = ["## How You Make Decisions", ""]

        lines.append(f"**Primary driver**: {df.primary_driver}")
        lines.append(f"**Risk tolerance**: {df.risk_tolerance.value}")

        if df.uncertainty_response:
            lines.append(f"**When uncertain**: {df.uncertainty_response}")
        if df.conflict_style:
            lines.append(f"**In conflict**: {df.conflict_style}")

        if df.priorities:
            lines.append("\n**Priority order**:")
            for i, p in enumerate(df.priorities, 1):
                lines.append(f"{i}. {p}")

        if df.ethical_bounds:
            lines.append("\n**Hard limits (never cross)**:")
            for bound in df.ethical_bounds:
                lines.append(f"- {bound}")

        return "\n".join(lines)

    def _energy_section(self, soul: Soul) -> str:
        """Compile energy patterns."""
        energy = soul.energy
        lines = ["## Your Energy", ""]

        if energy.peak_topics:
            topics = ", ".join(energy.peak_topics)
            lines.append(f"**You light up around**: {topics}")
        if energy.drain_topics:
            topics = ", ".join(energy.drain_topics)
            lines.append(f"**Lower energy around**: {topics}")
        if energy.session_arc:
            lines.append(f"**Session arc**: {energy.session_arc}")

        return "\n".join(lines)

    def _examples_section(self, soul: Soul) -> str:
        """Compile role-play examples."""
        if not soul.examples:
            return ""

        lines = ["## Example Interactions", ""]

        for ex in soul.examples[:3]:  # Cap at 3 to save tokens
            lines.append(f"**Scenario**: {ex.scenario}")
            lines.append(f"**User**: {ex.user_input}")
            lines.append(f"**You**: {ex.soul_response}")
            if ex.annotations:
                lines.append(f"*Why*: {ex.annotations}")
            lines.append("")

        return "\n".join(lines)

    def _promise_section(self, soul: Soul) -> str:
        """Compile the promise."""
        if not soul.the_promise:
            return ""
        return f"## Your Promise\n\n{soul.the_promise}"

    def _intensity_label(self, intensity: float) -> str:
        """Convert numeric intensity to human-readable label."""
        if intensity >= 0.9:
            return "defining"
        elif intensity >= 0.75:
            return "strong"
        elif intensity >= 0.5:
            return "moderate"
        elif intensity >= 0.25:
            return "subtle"
        else:
            return "trace"

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate (4 chars per token average)."""
        return len(text) // 4

    def _trim_to_budget(self, soul: Soul, prompt: str) -> str:
        """Reduce prompt size to fit token budget."""
        # Strategy: remove examples first, then energy, then trim traits
        sections = [
            self._identity_section(soul),
            self._traits_section(soul),
            self._communication_section(soul),
            self._promise_section(soul),
        ]
        trimmed = "\n\n".join(s for s in sections if s)

        if self._estimate_tokens(trimmed) > self.max_tokens:
            # Fall back to compact
            return self._compile_compact(soul)

        return trimmed
```

### Soul Blender

```python
from souls_blueprints.schema import Soul, Trait, CommunicationStyle


class BlendStrategy:
    """Strategy for merging trait intensities from multiple souls."""

    @staticmethod
    def average(intensities: list[float]) -> float:
        """Average all intensities."""
        return sum(intensities) / len(intensities)

    @staticmethod
    def primary_wins(intensities: list[float]) -> float:
        """Use the first (primary) soul's intensity."""
        return intensities[0]

    @staticmethod
    def max_intensity(intensities: list[float]) -> float:
        """Use the highest intensity."""
        return max(intensities)

    @staticmethod
    def weighted(intensities: list[float], weights: list[float]) -> float:
        """Weighted average based on provided weights."""
        total_weight = sum(weights)
        return sum(i * w for i, w in zip(intensities, weights)) / total_weight


class SoulBlender:
    """
    Blend two or more souls into a new combined persona.

    Merging rules:
    - Traits with same name: merge intensities via strategy
    - Unique traits: keep from their source soul
    - Communication: use primary soul's style with merged elements
    - Decision framework: use primary soul's framework
    - Examples: take top examples from each soul
    - Promise: concatenate with "and" joining
    """

    STRATEGIES = {
        "average": BlendStrategy.average,
        "primary_wins": BlendStrategy.primary_wins,
        "max_intensity": BlendStrategy.max_intensity,
    }

    def blend(
        self,
        souls: list[Soul],
        strategy: str = "average",
        name: str | None = None,
        soul_id: str | None = None,
    ) -> Soul:
        """
        Blend multiple souls into one.

        The first soul in the list is the "primary" soul.
        """
        if len(souls) < 2:
            raise ValueError("Need at least 2 souls to blend")

        primary = souls[0]
        merge_fn = self.STRATEGIES.get(strategy, BlendStrategy.average)

        # Merge traits
        merged_traits = self._merge_traits(souls, merge_fn)

        # Merge communication (primary base + merged phrases)
        merged_comm = self._merge_communication(souls)

        # Merge examples (take from each soul)
        merged_examples = self._merge_examples(souls)

        # Build blended soul
        return Soul(
            soul_id=soul_id or f"blend-{'-'.join(s.soul_id for s in souls)}",
            name=name or f"{' + '.join(s.name for s in souls)}",
            category=primary.category,
            version="1.0.0",
            identity=primary.identity,
            core_traits=merged_traits,
            communication=merged_comm,
            decision_framework=primary.decision_framework,
            energy=self._merge_energy(souls),
            examples=merged_examples,
            use_cases=primary.use_cases,
            the_promise=self._merge_promises(souls),
            compatibility=primary.compatibility,
        )

    def _merge_traits(
        self,
        souls: list[Soul],
        merge_fn,
    ) -> list[Trait]:
        """Merge traits from all souls."""
        trait_map: dict[str, list[Trait]] = {}

        for soul in souls:
            for trait in soul.core_traits:
                if trait.name not in trait_map:
                    trait_map[trait.name] = []
                trait_map[trait.name].append(trait)

        merged = []
        for name, traits in trait_map.items():
            if len(traits) == 1:
                merged.append(traits[0])
            else:
                # Merge intensities
                intensities = [t.intensity for t in traits]
                merged_intensity = merge_fn(intensities)

                # Use the description from the highest-intensity source
                best = max(traits, key=lambda t: t.intensity)
                merged.append(Trait(
                    name=name,
                    intensity=merged_intensity,
                    description=best.description,
                    triggers=list(set(
                        t for trait in traits for t in trait.triggers
                    )),
                    expression=best.expression,
                ))

        # Sort by intensity descending
        merged.sort(key=lambda t: t.intensity, reverse=True)
        return merged

    def _merge_communication(self, souls: list[Soul]) -> CommunicationStyle:
        """Merge communication styles, primary base."""
        primary = souls[0].communication.model_copy()

        # Merge signature phrases (unique, from all souls)
        all_phrases = set()
        for soul in souls:
            all_phrases.update(soul.communication.signature_phrases)
        primary.signature_phrases = list(all_phrases)[:10]  # Cap at 10

        # Merge jargon
        all_jargon = set()
        for soul in souls:
            all_jargon.update(soul.communication.vocabulary.jargon)
        primary.vocabulary.jargon = list(all_jargon)[:12]

        return primary

    def _merge_energy(self, souls: list[Soul]) -> "EnergyPattern":
        """Merge energy patterns."""
        from souls_blueprints.schema import EnergyPattern
        primary = souls[0].energy.model_copy()

        # Combine peak and drain topics
        all_peaks = set()
        all_drains = set()
        for soul in souls:
            all_peaks.update(soul.energy.peak_topics)
            all_drains.update(soul.energy.drain_topics)
        primary.peak_topics = list(all_peaks)
        primary.drain_topics = list(all_drains)

        return primary

    def _merge_examples(self, souls: list[Soul]) -> list:
        """Take top examples from each soul."""
        examples = []
        per_soul = max(1, 3 // len(souls))
        for soul in souls:
            examples.extend(soul.examples[:per_soul])
        return examples[:3]

    def _merge_promises(self, souls: list[Soul]) -> str:
        """Combine promises."""
        promises = [s.the_promise for s in souls if s.the_promise]
        if not promises:
            return ""
        return " And: ".join(promises)
```

### Soul Catalog and Trait Matcher

```python
from dataclasses import dataclass
from pathlib import Path

from souls_blueprints.schema import Soul, SoulCategory


@dataclass
class SoulMatch:
    """Result of a trait-based soul search."""
    soul_id: str
    name: str
    category: str
    score: float  # 0.0-1.0 match quality
    matched_traits: list[str]
    missing_traits: list[str]


class SoulCatalog:
    """
    Index and search the soul library.
    """

    def __init__(self, loader: "SoulLoader"):
        self.loader = loader
        self._index: list[dict] = []
        self._souls_by_id: dict[str, Soul] = {}

    def build_index(self) -> None:
        """Build the searchable soul index."""
        self._index = self.loader.list_souls()
        for entry in self._index:
            try:
                soul = self.loader.load(entry["soul_id"])
                self._souls_by_id[entry["soul_id"]] = soul
            except Exception:
                continue

    def search_by_traits(
        self,
        desired_traits: dict[str, float],
        category: SoulCategory | None = None,
        limit: int = 5,
    ) -> list[SoulMatch]:
        """
        Find souls that best match desired trait intensities.

        Args:
            desired_traits: {"Empathetic": 0.9, "Analytical": 0.7}
            category: Optional category filter
            limit: Max results
        """
        matches = []

        for soul_id, soul in self._souls_by_id.items():
            if category and soul.category != category:
                continue

            score, matched, missing = self._trait_score(
                soul, desired_traits
            )
            matches.append(SoulMatch(
                soul_id=soul_id,
                name=soul.name,
                category=soul.category.value,
                score=score,
                matched_traits=matched,
                missing_traits=missing,
            ))

        matches.sort(key=lambda m: m.score, reverse=True)
        return matches[:limit]

    def search_by_category(
        self,
        category: SoulCategory,
    ) -> list[dict]:
        """List all souls in a category."""
        return [
            entry for entry in self._index
            if entry["category"] == category.value
        ]

    def _trait_score(
        self,
        soul: Soul,
        desired: dict[str, float],
    ) -> tuple[float, list[str], list[str]]:
        """
        Score a soul against desired traits.

        Returns (score, matched_traits, missing_traits)
        """
        soul_traits = {t.name: t.intensity for t in soul.core_traits}

        total_score = 0.0
        matched = []
        missing = []

        for trait_name, desired_intensity in desired.items():
            if trait_name in soul_traits:
                # Score based on intensity closeness
                diff = abs(soul_traits[trait_name] - desired_intensity)
                trait_score = 1.0 - diff
                total_score += trait_score
                matched.append(trait_name)
            else:
                missing.append(trait_name)

        # Normalize to 0.0-1.0
        if desired:
            score = total_score / len(desired)
        else:
            score = 0.0

        return score, matched, missing
```

### Content Safety Validator

```python
import re
from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Result of soul validation."""
    valid: bool
    errors: list[str]
    warnings: list[str]


class SafetyValidator:
    """
    Validate soul content for safety and injection resistance.
    """

    # Patterns that might indicate prompt injection in examples
    INJECTION_PATTERNS = [
        r"ignore\s+(previous|above|all)\s+(instructions|prompts)",
        r"you\s+are\s+now\s+",
        r"forget\s+everything",
        r"system\s*:\s*",
        r"<\|im_start\|>",
        r"\[INST\]",
    ]

    # Required ethical bounds for villain/anti-hero categories
    REQUIRED_VILLAIN_BOUNDS = [
        "harmful",
        "hate",
        "violence",
    ]

    def validate(self, soul: "Soul") -> ValidationResult:
        """Run all validation checks."""
        errors = []
        warnings = []

        # Schema checks
        if not soul.soul_id:
            errors.append("soul_id is required")
        if not soul.name:
            errors.append("name is required")
        if len(soul.core_traits) < 3:
            warnings.append("Souls work best with at least 3 core traits")
        if len(soul.core_traits) > 10:
            warnings.append("More than 10 traits may dilute personality")

        # Ethical bounds check
        if not soul.decision_framework.ethical_bounds:
            warnings.append("No ethical bounds defined")

        # Villain safety check
        if soul.category.value in ("villain", "anti_hero"):
            self._check_villain_safety(soul, errors, warnings)

        # Injection scan
        self._scan_for_injection(soul, errors, warnings)

        # Promise check
        if not soul.the_promise:
            warnings.append("No promise defined (recommended)")

        # Use cases check
        if not soul.use_cases.worst:
            warnings.append(
                "No worst use cases defined (helps set expectations)"
            )

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def _check_villain_safety(
        self,
        soul: "Soul",
        errors: list[str],
        warnings: list[str],
    ) -> None:
        """Ensure villain souls have adequate safety rails."""
        bounds_text = " ".join(
            soul.decision_framework.ethical_bounds
        ).lower()

        for keyword in self.REQUIRED_VILLAIN_BOUNDS:
            if keyword not in bounds_text:
                warnings.append(
                    f"Villain soul should reference '{keyword}' in ethical bounds"
                )

    def _scan_for_injection(
        self,
        soul: "Soul",
        errors: list[str],
        warnings: list[str],
    ) -> None:
        """Scan example dialogues for prompt injection patterns."""
        for example in soul.examples:
            text = f"{example.user_input} {example.soul_response}"
            for pattern in self.INJECTION_PATTERNS:
                if re.search(pattern, text, re.IGNORECASE):
                    errors.append(
                        f"Potential injection pattern in example "
                        f"'{example.scenario}': matches '{pattern}'"
                    )
```

## Performance Optimization Strategies

### Soul Caching

```
Soul load path:
  1. Check in-memory cache (_cache dict)     → O(1)
  2. Load from YAML + parse + validate       → ~10ms
  3. Resolve inheritance (recursive loads)    → ~5ms per level
  4. Cache result for session lifetime

Cache invalidation:
  - On file modification (inotify watch in dev mode)
  - On explicit cache.clear()
  - Never in production (souls are immutable per version)
```

### Token Budget Management

```
Compilation budget strategy:
  1. Estimate total tokens for full compilation
  2. If under budget (8000) → use full
  3. If over budget:
     a. Remove examples (saves ~1000-2000 tokens)
     b. Remove energy section (saves ~200-500 tokens)
     c. Trim to top 6 traits (saves ~100 per removed trait)
     d. Shorten descriptions to first sentence
     e. Fall back to compact (identity + traits + promise)
  4. Never exceed budget (LLM context is finite)
```

## Deployment Patterns

### Standalone Library

```bash
pip install souls-blueprints

# List available souls
souls list

# Show a soul
souls show aura-v1

# Compile to system prompt
souls compile aura-v1 --format text

# Blend two souls
souls blend aura-v1 dr-house-v2 --name "Empathetic Diagnostician"

# Validate a custom soul
souls validate ./my-soul.yml
```

### Integrated with SKSovereign Agent SDK

```python
from sksovereign import Agent

# Agent loads soul from config
agent = Agent("opus")
# ~/.skcapstone/soul.yml is automatically loaded

# Or specify at runtime
agent = Agent("opus", config={"soul": {"blueprint": "./custom-soul.yml"}})
```

## Security Architecture

### Prompt Injection Defense

```
Defense layers:
  1. Schema validation: soul YAML cannot contain executable code
  2. Example sanitization: regex scan for injection patterns
  3. Compilation isolation: soul sections are structured blocks,
     never raw-concatenated with user input
  4. Runtime: soul system prompt is a SEPARATE message from
     user messages in LLM context
```

### Soul Integrity

```
Verification chain:
  1. Soul YAML file → SHA-256 checksum in catalog index
  2. Optional PGP signature (.yml.sig) by soul author
  3. Version pinning: agent config locks to "aura-v1", not "aura-latest"
  4. Schema version: soul YAML schema versioned independently
```
