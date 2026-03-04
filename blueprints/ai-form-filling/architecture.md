# AI-Powered Form Filling (SKPDF) Architecture

## System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  CLI (fill/extract/file)  │  Python API  │  FastAPI server     │
├────────────────────────────────────────────────────────────────┤
│                      Session Layer                             │
│  FormSession lifecycle  │  State persistence  │  History        │
├────────────────────────────────────────────────────────────────┤
│                      Pipeline Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Extract  │→│  Map     │→│  Fill    │→│  Write   │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                               │                                │
│                    ┌──────────┴──────────┐                     │
│                    │ Question │ Approval  │                     │
│                    │ Engine   │ Gate      │                     │
│                    └─────────────────────┘                     │
├────────────────────────────────────────────────────────────────┤
│                      Profile Layer                             │
│  CapAuth loader  │  Profile schema  │  Field transforms        │
├────────────────────────────────────────────────────────────────┤
│                      Filing Layer                              │
│  GTD categorizer  │  Metadata sidecars  │  Destination plugins │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Local FS │ │ WebDAV   │ │ GDrive   │ │ IPFS     │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
├────────────────────────────────────────────────────────────────┤
│                      Template Library                          │
│  IRS  │  SSA  │  DMV  │  Medical  │  Financial  │  Custom     │
└────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Form Session State Machine

```
             ┌────────────┐
             │  CREATED   │
             └─────┬──────┘
                   │ load PDF
                   ▼
             ┌────────────┐
             │ EXTRACTING │  Parse fields from PDF
             └─────┬──────┘
                   │ fields extracted
                   ▼
             ┌────────────┐
             │  MAPPING   │  Map fields to profile
             └─────┬──────┘
                   │ mappings resolved
                   ▼
             ┌────────────┐
             │  FILLING   │  Auto-fill non-sensitive
             └─────┬──────┘
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
   ┌──────────┐ ┌────────┐ ┌──────────┐
   │QUESTIONS │ │APPROVAL│ │ COMPLETE │ (no missing/sensitive)
   │ ENGINE   │ │ GATE   │ └────┬─────┘
   └────┬─────┘ └───┬────┘      │
        │ answered   │ approved  │
        └────────────┘           │
                   │             │
                   ▼             │
             ┌────────────┐     │
             │ REVIEWING  │◄────┘
             └─────┬──────┘
                   │ user confirms
                   ▼
             ┌────────────┐
             │  WRITING   │  Write values to PDF
             └─────┬──────┘
                   │ written
                   ▼
             ┌────────────┐
             │   FILING   │  Categorize and file
             └─────┬──────┘
                   │ filed
                   ▼
             ┌────────────┐
             │  COMPLETE  │
             └────────────┘

Error from any state → ERROR → retry or abort
```

### Form Session Implementation

```python
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class SessionState(str, Enum):
    CREATED = "created"
    EXTRACTING = "extracting"
    MAPPING = "mapping"
    FILLING = "filling"
    QUESTIONING = "questioning"
    APPROVING = "approving"
    REVIEWING = "reviewing"
    WRITING = "writing"
    FILING = "filing"
    COMPLETE = "complete"
    ERROR = "error"


class FieldType(str, Enum):
    TEXT = "text"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    DROPDOWN = "dropdown"
    SIGNATURE = "signature"
    DATE = "date"
    NUMBER = "number"


class SensitivityCategory(str, Enum):
    NONE = "none"
    PII = "pii"
    MEDICAL = "medical"
    FINANCIAL = "financial"
    LEGAL = "legal"


class ExtractionMethod(str, Enum):
    ACROFORM = "acroform"
    XFA = "xfa"
    OCR = "ocr"
    TEMPLATE = "template"


class FormField(BaseModel):
    """A single fillable field extracted from a PDF."""

    field_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    page: int = 1
    name: str = ""
    label: str = ""
    type: FieldType = FieldType.TEXT
    required: bool = False
    sensitive: bool = False
    sensitivity_category: SensitivityCategory = SensitivityCategory.NONE
    value: str | None = None
    options: list[str] = Field(default_factory=list)
    position: dict[str, float] = Field(default_factory=dict)
    extraction_method: ExtractionMethod = ExtractionMethod.ACROFORM
    confidence: float = 1.0
    profile_path: str | None = None


class MappingResult(BaseModel):
    """Result of mapping a field to a profile path."""

    field_id: str
    mapped: bool
    profile_path: str | None = None
    confidence: float = 0.0
    strategy: str = ""
    value: Any = None
    sensitive: bool = False


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class FormSession(BaseModel):
    """Stateful session from PDF intake through filling to filing."""

    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pdf_path: str
    state: SessionState = SessionState.CREATED
    fields: list[FormField] = Field(default_factory=list)
    mappings: dict[str, MappingResult] = Field(default_factory=dict)
    approvals: dict[str, ApprovalStatus] = Field(default_factory=dict)
    answers: dict[str, str] = Field(default_factory=dict)
    created: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed: datetime | None = None
    error: str | None = None

    @property
    def unmapped_fields(self) -> list[FormField]:
        """Fields with no profile mapping."""
        return [
            f for f in self.fields
            if f.field_id not in self.mappings
            or not self.mappings[f.field_id].mapped
        ]

    @property
    def sensitive_fields(self) -> list[FormField]:
        """Fields requiring approval."""
        return [f for f in self.fields if f.sensitive]

    @property
    def pending_approvals(self) -> list[FormField]:
        """Sensitive fields awaiting approval."""
        return [
            f for f in self.sensitive_fields
            if self.approvals.get(f.field_id) == ApprovalStatus.PENDING
        ]

    @property
    def fill_progress(self) -> dict:
        """Fill completion statistics."""
        total = len(self.fields)
        filled = sum(1 for f in self.fields if f.value is not None)
        return {
            "total": total,
            "filled": filled,
            "remaining": total - filled,
            "percent": (filled / total * 100) if total > 0 else 0,
        }

    def transition(self, new_state: SessionState) -> None:
        """Validate and perform state transition."""
        valid_transitions = {
            SessionState.CREATED: {SessionState.EXTRACTING},
            SessionState.EXTRACTING: {SessionState.MAPPING, SessionState.ERROR},
            SessionState.MAPPING: {SessionState.FILLING, SessionState.ERROR},
            SessionState.FILLING: {
                SessionState.QUESTIONING,
                SessionState.APPROVING,
                SessionState.REVIEWING,
                SessionState.ERROR,
            },
            SessionState.QUESTIONING: {
                SessionState.APPROVING,
                SessionState.REVIEWING,
                SessionState.ERROR,
            },
            SessionState.APPROVING: {SessionState.REVIEWING, SessionState.ERROR},
            SessionState.REVIEWING: {SessionState.WRITING, SessionState.ERROR},
            SessionState.WRITING: {SessionState.FILING, SessionState.ERROR},
            SessionState.FILING: {SessionState.COMPLETE, SessionState.ERROR},
        }

        allowed = valid_transitions.get(self.state, set())
        if new_state not in allowed:
            raise ValueError(
                f"Invalid transition: {self.state} -> {new_state}. "
                f"Allowed: {allowed}"
            )
        self.state = new_state

        if new_state == SessionState.COMPLETE:
            self.completed = datetime.now(timezone.utc)

    def save(self, path: Path) -> None:
        """Persist session state to disk."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, path: Path) -> "FormSession":
        """Load session state from disk."""
        return cls.model_validate_json(path.read_text())
```

### Multi-Method PDF Extraction

```python
from abc import ABC, abstractmethod
from pathlib import Path

import pikepdf
import pdfplumber


class Extractor(ABC):
    """Base class for PDF field extractors."""

    name: str = "base"

    @abstractmethod
    def can_extract(self, pdf_path: str) -> bool:
        """Return True if this extractor can handle this PDF."""

    @abstractmethod
    def extract(self, pdf_path: str) -> list[FormField]:
        """Extract form fields from the PDF."""


class AcroFormExtractor(Extractor):
    """Extract interactive AcroForm fields using pikepdf."""

    name = "acroform"

    def can_extract(self, pdf_path: str) -> bool:
        """Check if PDF has AcroForm fields."""
        try:
            pdf = pikepdf.Pdf.open(pdf_path)
            return "/AcroForm" in pdf.Root
        except Exception:
            return False

    def extract(self, pdf_path: str) -> list[FormField]:
        """Extract all AcroForm fields."""
        fields = []
        pdf = pikepdf.Pdf.open(pdf_path)

        if "/AcroForm" not in pdf.Root:
            return fields

        acroform = pdf.Root["/AcroForm"]
        if "/Fields" not in acroform:
            return fields

        for field_obj in acroform["/Fields"]:
            field = self._parse_field(field_obj)
            if field:
                fields.append(field)

        return fields

    def _parse_field(self, field_obj) -> FormField | None:
        """Parse a single AcroForm field object."""
        try:
            field_type = self._detect_type(field_obj)
            name = str(field_obj.get("/T", ""))
            label = str(field_obj.get("/TU", name))  # TU = tooltip/label
            value = str(field_obj.get("/V", "")) if "/V" in field_obj else None

            # Get position from widget annotation
            rect = field_obj.get("/Rect", [0, 0, 0, 0])
            position = {
                "x": float(rect[0]),
                "y": float(rect[1]),
                "width": float(rect[2]) - float(rect[0]),
                "height": float(rect[3]) - float(rect[1]),
            }

            # Detect required fields
            flags = int(field_obj.get("/Ff", 0))
            required = bool(flags & (1 << 1))  # Bit 2 = required

            # Detect options for choice fields
            options = []
            if "/Opt" in field_obj:
                for opt in field_obj["/Opt"]:
                    if isinstance(opt, list):
                        options.append(str(opt[1]))
                    else:
                        options.append(str(opt))

            # Detect sensitivity by field name patterns
            sensitive, category = self._detect_sensitivity(name, label)

            return FormField(
                name=name,
                label=label,
                type=field_type,
                required=required,
                sensitive=sensitive,
                sensitivity_category=category,
                value=value if value and value != "None" else None,
                options=options,
                position=position,
                extraction_method=ExtractionMethod.ACROFORM,
                confidence=1.0,
            )
        except Exception:
            return None

    def _detect_type(self, field_obj) -> FieldType:
        """Determine form field type from PDF field type."""
        ft = str(field_obj.get("/FT", ""))
        if ft == "/Tx":
            return FieldType.TEXT
        elif ft == "/Btn":
            # Check if checkbox or radio
            flags = int(field_obj.get("/Ff", 0))
            if flags & (1 << 15):  # Bit 16 = radio
                return FieldType.RADIO
            return FieldType.CHECKBOX
        elif ft == "/Ch":
            return FieldType.DROPDOWN
        elif ft == "/Sig":
            return FieldType.SIGNATURE
        return FieldType.TEXT

    def _detect_sensitivity(
        self, name: str, label: str
    ) -> tuple[bool, SensitivityCategory]:
        """Detect if a field contains sensitive data."""
        text = f"{name} {label}".lower()

        pii_patterns = ["ssn", "social security", "date of birth", "dob"]
        medical_patterns = [
            "diagnosis", "medication", "allergy", "condition",
            "insurance", "policy number", "group number",
        ]
        financial_patterns = [
            "account number", "routing number", "bank",
            "income", "salary", "wages",
        ]
        legal_patterns = ["signature", "attest", "sworn", "oath"]

        for pattern in pii_patterns:
            if pattern in text:
                return True, SensitivityCategory.PII
        for pattern in medical_patterns:
            if pattern in text:
                return True, SensitivityCategory.MEDICAL
        for pattern in financial_patterns:
            if pattern in text:
                return True, SensitivityCategory.FINANCIAL
        for pattern in legal_patterns:
            if pattern in text:
                return True, SensitivityCategory.LEGAL

        return False, SensitivityCategory.NONE


class OCRExtractor(Extractor):
    """Extract fields from scanned PDFs using Tesseract OCR."""

    name = "ocr"

    def __init__(self, dpi: int = 300, language: str = "eng",
                 confidence_threshold: float = 0.5):
        self.dpi = dpi
        self.language = language
        self.confidence_threshold = confidence_threshold

    def can_extract(self, pdf_path: str) -> bool:
        """Return True for image-based PDFs with no interactive fields."""
        try:
            pdf = pikepdf.Pdf.open(pdf_path)
            has_acroform = "/AcroForm" in pdf.Root
            return not has_acroform
        except Exception:
            return True  # Assume OCR-able if we can't parse

    def extract(self, pdf_path: str) -> list[FormField]:
        """Extract fields via OCR and layout analysis."""
        import pytesseract
        from PIL import Image
        from pdf2image import convert_from_path

        fields = []
        images = convert_from_path(pdf_path, dpi=self.dpi)

        for page_num, image in enumerate(images, start=1):
            # Preprocess
            processed = self._preprocess(image)

            # OCR with bounding boxes
            ocr_data = pytesseract.image_to_data(
                processed,
                lang=self.language,
                output_type=pytesseract.Output.DICT,
            )

            # Find label-field pairs
            page_fields = self._detect_fields(ocr_data, page_num)
            fields.extend(page_fields)

        return fields

    def _preprocess(self, image: "Image") -> "Image":
        """Preprocess scanned image for better OCR."""
        import numpy as np

        # Convert to grayscale
        gray = image.convert("L")

        # Binarize (Otsu's threshold)
        arr = np.array(gray)
        threshold = np.median(arr)
        binary = ((arr > threshold) * 255).astype(np.uint8)

        return Image.fromarray(binary)

    def _detect_fields(self, ocr_data: dict, page: int) -> list[FormField]:
        """Detect form fields from OCR data using layout heuristics."""
        fields = []
        n_items = len(ocr_data["text"])

        for i in range(n_items):
            text = ocr_data["text"][i].strip()
            conf = int(ocr_data["conf"][i])

            if conf < self.confidence_threshold * 100:
                continue

            # Detect label patterns (text ending with ":" or preceding an underline)
            if text.endswith(":") or text.endswith("_"):
                label = text.rstrip(":_").strip()
                if not label:
                    continue

                position = {
                    "x": float(ocr_data["left"][i]),
                    "y": float(ocr_data["top"][i]),
                    "width": float(ocr_data["width"][i]),
                    "height": float(ocr_data["height"][i]),
                }

                sensitive, category = AcroFormExtractor._detect_sensitivity(
                    AcroFormExtractor, label, label
                )

                fields.append(FormField(
                    name=f"ocr_page{page}_{i}",
                    label=label,
                    type=FieldType.TEXT,
                    required=False,
                    sensitive=sensitive,
                    sensitivity_category=category,
                    position=position,
                    extraction_method=ExtractionMethod.OCR,
                    confidence=conf / 100.0,
                    page=page,
                ))

        return fields


class ExtractionPipeline:
    """
    Run multiple extractors in priority order.
    """

    def __init__(self, extractors: list[Extractor] | None = None):
        self.extractors = extractors or [
            AcroFormExtractor(),
            OCRExtractor(),
        ]

    def extract(self, pdf_path: str) -> list[FormField]:
        """Extract fields using the first capable extractor."""
        for extractor in self.extractors:
            if extractor.can_extract(pdf_path):
                fields = extractor.extract(pdf_path)
                if fields:
                    return fields
        return []
```

### Field Mapping Pipeline

```python
from abc import ABC, abstractmethod
from typing import Any

from Levenshtein import ratio as levenshtein_ratio


class MappingStrategy(ABC):
    """Base class for field-to-profile mapping strategies."""

    name: str = "base"
    priority: int = 0  # Lower = tried first

    @abstractmethod
    def match(self, field: FormField, profile: dict,
              profile_paths: dict[str, str]) -> MappingResult:
        """Attempt to match a field to a profile path."""


class TemplateMatcher(MappingStrategy):
    """Match fields using pre-defined form templates."""

    name = "template"
    priority = 0

    def __init__(self, templates: "TemplateRegistry"):
        self.templates = templates

    def match(self, field: FormField, profile: dict,
              profile_paths: dict[str, str]) -> MappingResult:
        """Look up field in template mappings."""
        template = self.templates.current_template
        if template is None:
            return MappingResult(field_id=field.field_id, mapped=False)

        for mapping in template.get("field_mappings", []):
            if mapping["pdf_field"] == field.name:
                path = mapping["profile_path"]
                value = _resolve_path(profile, path)
                return MappingResult(
                    field_id=field.field_id,
                    mapped=True,
                    profile_path=path,
                    confidence=1.0,
                    strategy="template",
                    value=value,
                    sensitive=mapping.get("sensitive", False),
                )

        return MappingResult(field_id=field.field_id, mapped=False)


class ExactMatcher(MappingStrategy):
    """Match field labels exactly to profile path labels."""

    name = "exact"
    priority = 1

    def match(self, field: FormField, profile: dict,
              profile_paths: dict[str, str]) -> MappingResult:
        """Exact case-insensitive label match."""
        label_lower = field.label.lower().strip()

        for path, path_label in profile_paths.items():
            if label_lower == path_label.lower():
                value = _resolve_path(profile, path)
                return MappingResult(
                    field_id=field.field_id,
                    mapped=True,
                    profile_path=path,
                    confidence=0.95,
                    strategy="exact",
                    value=value,
                    sensitive=field.sensitive,
                )

        return MappingResult(field_id=field.field_id, mapped=False)


class FuzzyMatcher(MappingStrategy):
    """Match field labels using Levenshtein fuzzy matching."""

    name = "fuzzy"
    priority = 2

    def __init__(self, threshold: float = 0.75):
        self.threshold = threshold

    def match(self, field: FormField, profile: dict,
              profile_paths: dict[str, str]) -> MappingResult:
        """Fuzzy match with configurable threshold."""
        label_lower = field.label.lower().strip()
        best_match = None
        best_score = 0.0

        for path, path_label in profile_paths.items():
            score = levenshtein_ratio(label_lower, path_label.lower())
            if score > best_score and score >= self.threshold:
                best_score = score
                best_match = path

        if best_match:
            value = _resolve_path(profile, best_match)
            return MappingResult(
                field_id=field.field_id,
                mapped=True,
                profile_path=best_match,
                confidence=best_score,
                strategy="fuzzy",
                value=value,
                sensitive=field.sensitive,
            )

        return MappingResult(field_id=field.field_id, mapped=False)


class SemanticMatcher(MappingStrategy):
    """Match fields using LLM-assisted semantic comparison."""

    name = "semantic"
    priority = 3

    def __init__(self, model: str = "local", threshold: float = 0.80):
        self.model = model
        self.threshold = threshold

    def match(self, field: FormField, profile: dict,
              profile_paths: dict[str, str]) -> MappingResult:
        """Semantic matching via local LLM or disabled."""
        if self.model == "none":
            return MappingResult(field_id=field.field_id, mapped=False)

        # Build prompt for LLM
        candidates = list(profile_paths.items())[:20]  # Limit candidates
        prompt = self._build_prompt(field.label, candidates)

        # Call local LLM (Ollama)
        result = self._call_local_llm(prompt)
        if result and result["confidence"] >= self.threshold:
            path = result["profile_path"]
            value = _resolve_path(profile, path)
            return MappingResult(
                field_id=field.field_id,
                mapped=True,
                profile_path=path,
                confidence=result["confidence"],
                strategy="semantic",
                value=value,
                sensitive=field.sensitive,
            )

        return MappingResult(field_id=field.field_id, mapped=False)

    def _build_prompt(self, label: str,
                      candidates: list[tuple[str, str]]) -> str:
        """Build matching prompt for LLM."""
        candidate_lines = "\n".join(
            f"  - {path}: {desc}" for path, desc in candidates
        )
        return (
            f"Given the form field label: \"{label}\"\n"
            f"Which of these profile paths is the best match?\n"
            f"{candidate_lines}\n"
            f"Respond with JSON: {{\"profile_path\": \"...\", \"confidence\": 0.0-1.0}}\n"
            f"If none match, respond: {{\"profile_path\": null, \"confidence\": 0.0}}"
        )

    def _call_local_llm(self, prompt: str) -> dict | None:
        """Call local Ollama instance."""
        import json
        try:
            import httpx
            resp = httpx.post(
                "http://localhost:11434/api/generate",
                json={"model": "llama3.2", "prompt": prompt, "stream": False},
                timeout=30.0,
            )
            if resp.status_code == 200:
                text = resp.json().get("response", "")
                return json.loads(text)
        except Exception:
            return None


class FieldMappingPipeline:
    """
    Chain mapping strategies in priority order.
    First strategy to match above confidence threshold wins.
    """

    def __init__(self, strategies: list[MappingStrategy] | None = None):
        self.strategies = sorted(
            strategies or [ExactMatcher(), FuzzyMatcher()],
            key=lambda s: s.priority,
        )

    def map_fields(
        self,
        fields: list[FormField],
        profile: dict,
        profile_paths: dict[str, str],
    ) -> dict[str, MappingResult]:
        """Map all fields to profile paths."""
        results = {}
        for field in fields:
            for strategy in self.strategies:
                result = strategy.match(field, profile, profile_paths)
                if result.mapped:
                    results[field.field_id] = result
                    break
            else:
                results[field.field_id] = MappingResult(
                    field_id=field.field_id, mapped=False
                )
        return results


def _resolve_path(profile: dict, path: str) -> Any:
    """Resolve a dotted path like 'identity.full_name' against a dict."""
    parts = path.split(".")
    current = profile
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current
```

### Auto-Fill Engine with Approval Gate

```python
import logging
from datetime import datetime, timezone
from typing import Callable

logger = logging.getLogger(__name__)


class AutoFillEngine:
    """
    Populate form fields from mapped profile data.
    Non-sensitive fields are filled automatically.
    Sensitive fields require explicit approval.
    """

    def __init__(
        self,
        auto_fill_sensitive: bool = False,
        approval_callback: Callable | None = None,
    ):
        self.auto_fill_sensitive = auto_fill_sensitive
        self.approval_callback = approval_callback
        self._audit_log: list[dict] = []

    def fill(self, session: FormSession) -> FormSession:
        """
        Auto-fill all mapped fields.

        Non-sensitive fields with high confidence are filled immediately.
        Sensitive fields are queued for approval.
        """
        for field in session.fields:
            mapping = session.mappings.get(field.field_id)
            if not mapping or not mapping.mapped:
                continue

            if field.sensitive and not self.auto_fill_sensitive:
                # Queue for approval
                session.approvals[field.field_id] = ApprovalStatus.PENDING
                self._log_audit(
                    "queued_for_approval",
                    field,
                    mapping,
                    session.session_id,
                )
            else:
                # Auto-fill
                field.value = self._apply_value(field, mapping)
                field.profile_path = mapping.profile_path
                self._log_audit(
                    "auto_filled",
                    field,
                    mapping,
                    session.session_id,
                )

        return session

    def process_approval(
        self,
        session: FormSession,
        field_id: str,
        approved: bool,
    ) -> FormSession:
        """
        Process approval for a sensitive field.
        """
        field = next(
            (f for f in session.fields if f.field_id == field_id), None
        )
        if field is None:
            raise ValueError(f"Field {field_id} not found")

        mapping = session.mappings.get(field_id)
        if mapping is None:
            raise ValueError(f"No mapping for field {field_id}")

        if approved:
            session.approvals[field_id] = ApprovalStatus.APPROVED
            field.value = self._apply_value(field, mapping)
            field.profile_path = mapping.profile_path
            self._log_audit(
                "approved_and_filled",
                field,
                mapping,
                session.session_id,
            )
        else:
            session.approvals[field_id] = ApprovalStatus.DENIED
            self._log_audit(
                "denied",
                field,
                mapping,
                session.session_id,
            )

        return session

    def _apply_value(self, field: FormField, mapping: MappingResult) -> str:
        """Apply the mapped value, with type-appropriate formatting."""
        value = mapping.value
        if value is None:
            return ""

        # Type-specific transforms
        if field.type == FieldType.DATE:
            return self._format_date(value)
        elif field.type == FieldType.CHECKBOX:
            return "Yes" if value else "Off"
        elif field.type == FieldType.NUMBER:
            return str(value)
        else:
            return str(value)

    def _format_date(self, value: Any) -> str:
        """Format a date value for PDF field."""
        if isinstance(value, datetime):
            return value.strftime("%m/%d/%Y")
        if isinstance(value, str):
            return value
        return str(value)

    def _log_audit(
        self,
        action: str,
        field: FormField,
        mapping: MappingResult,
        session_id: str,
    ) -> None:
        """Log an audit entry for sensitive field operations."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_id": session_id,
            "action": action,
            "field_name": field.name,
            "field_label": field.label,
            "sensitive": field.sensitive,
            "sensitivity_category": field.sensitivity_category.value,
            "profile_path": mapping.profile_path,
            "strategy": mapping.strategy,
            "confidence": mapping.confidence,
            # NEVER log the actual value for sensitive fields
            "value_logged": not field.sensitive,
        }
        self._audit_log.append(entry)
        logger.info(f"Audit: {action} field={field.label} session={session_id}")

    @property
    def audit_log(self) -> list[dict]:
        """Return audit trail."""
        return list(self._audit_log)


def mask_value(value: str, sensitivity: SensitivityCategory) -> str:
    """
    Mask a sensitive value for display.

    Examples:
      SSN: "123-45-6789" -> "***-**-6789"
      Account: "9876543210" -> "******3210"
      Name: kept as-is (PII but not critical)
    """
    if sensitivity == SensitivityCategory.PII and len(value) >= 4:
        # Show last 4 digits
        return "*" * (len(value) - 4) + value[-4:]
    elif sensitivity == SensitivityCategory.FINANCIAL and len(value) >= 4:
        return "*" * (len(value) - 4) + value[-4:]
    elif sensitivity == SensitivityCategory.MEDICAL:
        return "[MEDICAL DATA]"
    return value
```

### Question Engine

```python
from dataclasses import dataclass, field


@dataclass
class Question:
    """A question for the user about unmapped fields."""
    field_ids: list[str]
    text: str
    hint: str = ""
    required: bool = False
    input_type: str = "text"  # text, choice, date, confirm
    choices: list[str] = field(default_factory=list)


class QuestionEngine:
    """
    Generate natural-language questions for unmapped fields.
    Groups related fields and orders by page/position.
    """

    # Field groups that should be asked together
    FIELD_GROUPS = {
        "address": ["street", "city", "state", "zip", "country"],
        "name": ["first", "middle", "last", "suffix"],
        "phone": ["phone", "cell", "mobile", "telephone"],
        "employer": ["employer", "company", "occupation", "title"],
    }

    def generate(self, session: FormSession) -> list[Question]:
        """Generate questions for all unmapped fields."""
        unmapped = session.unmapped_fields
        if not unmapped:
            return []

        # Group related fields
        groups = self._group_fields(unmapped)

        # Generate a question per group
        questions = []
        for group_name, fields in groups.items():
            question = self._make_question(group_name, fields)
            questions.append(question)

        # Sort by page number, then position
        questions.sort(
            key=lambda q: min(
                self._field_sort_key(f, session)
                for fid in q.field_ids
                for f in session.fields
                if f.field_id == fid
            )
        )

        return questions

    def _group_fields(
        self, fields: list[FormField]
    ) -> dict[str, list[FormField]]:
        """Group related fields together."""
        groups: dict[str, list[FormField]] = {}
        assigned = set()

        # Try to match known groups
        for group_name, keywords in self.FIELD_GROUPS.items():
            group_fields = []
            for field in fields:
                label_lower = field.label.lower()
                if any(kw in label_lower for kw in keywords):
                    group_fields.append(field)
                    assigned.add(field.field_id)
            if group_fields:
                groups[group_name] = group_fields

        # Remaining fields are individual questions
        for field in fields:
            if field.field_id not in assigned:
                groups[field.field_id] = [field]

        return groups

    def _make_question(
        self, group_name: str, fields: list[FormField]
    ) -> Question:
        """Create a question from a group of fields."""
        field_ids = [f.field_id for f in fields]

        if len(fields) == 1:
            f = fields[0]
            text = f"What is your {f.label.lower().rstrip(':')}?"
            return Question(
                field_ids=field_ids,
                text=text,
                hint=f"For form field: {f.name}",
                required=f.required,
                input_type=self._input_type(f),
                choices=f.options,
            )

        # Multi-field question
        labels = [f.label.lower().rstrip(":") for f in fields]
        text = f"Please provide your {group_name}: {', '.join(labels)}"
        return Question(
            field_ids=field_ids,
            text=text,
            hint=f"Covers {len(fields)} related fields",
            required=any(f.required for f in fields),
            input_type="text",
        )

    def _input_type(self, field: FormField) -> str:
        """Determine question input type from field type."""
        type_map = {
            FieldType.TEXT: "text",
            FieldType.CHECKBOX: "confirm",
            FieldType.RADIO: "choice",
            FieldType.DROPDOWN: "choice",
            FieldType.DATE: "date",
            FieldType.NUMBER: "text",
            FieldType.SIGNATURE: "text",
        }
        return type_map.get(field.type, "text")

    def _field_sort_key(self, field: FormField, session: FormSession):
        """Sort key: (page, y_position, x_position)."""
        return (
            field.page,
            field.position.get("y", 0),
            field.position.get("x", 0),
        )
```

### PDF Writer

```python
import hashlib
from pathlib import Path

import pikepdf
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


class PDFWriter:
    """Write filled values back to PDF preserving original formatting."""

    def __init__(self, preserve_original: bool = True,
                 flatten: bool = False):
        self.preserve_original = preserve_original
        self.flatten = flatten

    def write(self, session: FormSession, output_path: str) -> dict:
        """
        Write all filled field values to the PDF.

        Returns metadata dict with checksums.
        """
        pdf_path = session.pdf_path
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        # Preserve original
        if self.preserve_original:
            original_copy = output.parent / f"original_{output.name}"
            import shutil
            shutil.copy2(pdf_path, original_copy)

        # Determine write method based on extraction method
        extraction_methods = set(f.extraction_method for f in session.fields)

        if ExtractionMethod.ACROFORM in extraction_methods:
            self._write_acroform(pdf_path, session, str(output))
        elif ExtractionMethod.OCR in extraction_methods:
            self._write_overlay(pdf_path, session, str(output))
        else:
            self._write_acroform(pdf_path, session, str(output))

        # Compute checksums
        original_hash = self._sha256(pdf_path)
        filled_hash = self._sha256(str(output))

        return {
            "original_checksum": original_hash,
            "filled_checksum": filled_hash,
            "output_path": str(output),
            "fields_written": sum(
                1 for f in session.fields if f.value is not None
            ),
        }

    def _write_acroform(self, pdf_path: str, session: FormSession,
                        output_path: str) -> None:
        """Write values to AcroForm fields."""
        pdf = pikepdf.Pdf.open(pdf_path)

        if "/AcroForm" not in pdf.Root:
            pdf.save(output_path)
            return

        # Build value map
        value_map = {
            f.name: f.value
            for f in session.fields
            if f.value is not None and f.name
        }

        # Set field values
        for field_obj in pdf.Root["/AcroForm"].get("/Fields", []):
            name = str(field_obj.get("/T", ""))
            if name in value_map:
                field_obj["/V"] = pikepdf.String(value_map[name])
                # Remove appearance to force reader to regenerate
                if "/AP" in field_obj:
                    del field_obj["/AP"]

        # Flatten if requested
        if self.flatten:
            pdf.Root["/AcroForm"]["/NeedAppearances"] = pikepdf.Name("/true")

        pdf.save(output_path)

    def _write_overlay(self, pdf_path: str, session: FormSession,
                       output_path: str) -> None:
        """Overlay text on scanned PDFs at field positions."""
        # Create overlay PDF with reportlab
        from io import BytesIO

        overlay_buffer = BytesIO()
        c = canvas.Canvas(overlay_buffer, pagesize=letter)

        # Group fields by page
        pages: dict[int, list[FormField]] = {}
        for field in session.fields:
            if field.value is not None:
                pages.setdefault(field.page, []).append(field)

        for page_num in sorted(pages.keys()):
            if page_num > 1:
                c.showPage()
            for field in pages[page_num]:
                x = field.position.get("x", 0)
                y = field.position.get("y", 0)
                c.setFont("Helvetica", 10)
                c.drawString(x, y, field.value)

        c.save()
        overlay_buffer.seek(0)

        # Merge overlay with original
        original = pikepdf.Pdf.open(pdf_path)
        overlay = pikepdf.Pdf.open(overlay_buffer)

        for i, page in enumerate(original.pages):
            if i + 1 in pages:
                overlay_page = overlay.pages[
                    sorted(pages.keys()).index(i + 1)
                ]
                page.add_overlay(overlay_page)

        original.save(output_path)

    def _sha256(self, path: str) -> str:
        """Compute SHA-256 checksum of a file."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return f"sha256:{h.hexdigest()}"
```

### GTD Filer with Metadata Sidecars

```python
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml


CATEGORY_KEYWORDS = {
    "Medical": ["patient", "medical", "health", "insurance", "hipaa",
                "physician", "diagnosis", "prescription"],
    "Tax": ["irs", "tax", "w-4", "w-9", "1040", "1099", "w-2",
            "income", "deduction"],
    "Legal": ["legal", "court", "attorney", "contract", "agreement",
              "affidavit", "notarize"],
    "Insurance": ["insurance", "policy", "claim", "coverage", "premium",
                  "deductible", "beneficiary"],
    "Government": ["government", "federal", "state", "dmv", "ssa",
                   "social security", "passport", "visa"],
    "Financial": ["bank", "account", "loan", "mortgage", "credit",
                  "investment", "retirement"],
}


class GTDFiler:
    """
    Categorize and file completed PDFs into GTD directory structure.
    """

    def __init__(self, gtd_root: str, naming_template: str,
                 auto_categorize: bool = True,
                 write_sidecars: bool = True):
        self.gtd_root = Path(gtd_root).expanduser()
        self.naming_template = naming_template
        self.auto_categorize = auto_categorize
        self.write_sidecars = write_sidecars
        self._ensure_gtd_structure()

    def file(self, session: FormSession, filled_pdf_path: str) -> dict:
        """
        Categorize and file a completed PDF.

        Returns filing result with destination path and metadata path.
        """
        # Determine category
        category = self._classify(session) if self.auto_categorize else "General"

        # Determine GTD action
        action = self._determine_action(session)

        # Build destination path
        year = datetime.now().strftime("%Y")
        date_str = datetime.now().strftime("%Y-%m-%d")

        # Generate filename
        description = self._generate_description(session)
        filename = self.naming_template.format(
            date=date_str,
            form_type=category.lower(),
            description=description,
        )
        if not filename.endswith(".pdf"):
            filename += ".pdf"

        # Build full path
        dest_dir = self.gtd_root / action / category / year
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / filename

        # Copy filed PDF
        shutil.copy2(filled_pdf_path, dest_path)

        # Write metadata sidecar
        meta_path = None
        if self.write_sidecars:
            meta_path = self._write_sidecar(session, dest_path, category, action)

        return {
            "destination": str(dest_path),
            "metadata": str(meta_path) if meta_path else None,
            "category": category,
            "action": action,
            "filename": filename,
        }

    def _classify(self, session: FormSession) -> str:
        """Classify document category from field labels and content."""
        # Build text corpus from field labels
        text = " ".join(
            f"{f.label} {f.name}" for f in session.fields
        ).lower()

        # Score each category
        scores: dict[str, int] = {}
        for category, keywords in CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                scores[category] = score

        if scores:
            return max(scores, key=scores.get)
        return "General"

    def _determine_action(self, session: FormSession) -> str:
        """Determine GTD action category."""
        # If there are unfilled required fields, it needs action
        unfilled_required = [
            f for f in session.fields
            if f.required and f.value is None
        ]
        if unfilled_required:
            return "@Action/Next-Actions"

        # If it's a completed form, file as reference
        return "@Reference"

    def _generate_description(self, session: FormSession) -> str:
        """Generate a short description from form content."""
        # Use the first few field labels as description
        labels = [f.label for f in session.fields[:3] if f.label]
        if labels:
            desc = "-".join(labels[:2]).lower()
            # Clean for filename
            desc = "".join(c if c.isalnum() or c == "-" else "_" for c in desc)
            return desc[:50]
        return "form"

    def _write_sidecar(
        self,
        session: FormSession,
        pdf_path: Path,
        category: str,
        action: str,
    ) -> Path:
        """Write .meta.yml sidecar file."""
        meta_path = pdf_path.with_suffix(".meta.yml")

        # Count statistics
        auto_filled = sum(
            1 for f in session.fields
            if f.value and f.field_id in session.mappings
            and session.mappings[f.field_id].mapped
            and not f.sensitive
        )
        user_answered = len(session.answers)
        sensitive_approved = sum(
            1 for status in session.approvals.values()
            if status == ApprovalStatus.APPROVED
        )
        sensitive_denied = sum(
            1 for status in session.approvals.values()
            if status == ApprovalStatus.DENIED
        )
        skipped = sum(1 for f in session.fields if f.value is None)

        sidecar = {
            "document": {
                "original_filename": Path(session.pdf_path).name,
                "form_type": category.lower(),
                "pages": max((f.page for f in session.fields), default=1),
                "fields_total": len(session.fields),
                "fields_filled": len(session.fields) - skipped,
                "fields_skipped": skipped,
            },
            "session": {
                "session_id": session.session_id,
                "started": session.created.isoformat(),
                "completed": session.completed.isoformat()
                if session.completed else None,
                "profile_source": "capauth",
            },
            "extraction": {
                "methods": list(set(
                    f.extraction_method.value for f in session.fields
                )),
            },
            "filling": {
                "auto_filled": auto_filled,
                "user_answered": user_answered,
                "sensitive_approved": sensitive_approved,
                "sensitive_denied": sensitive_denied,
                "skipped": skipped,
            },
            "filing": {
                "destination": "local",
                "category": category,
                "gtd_action": action,
                "path": str(pdf_path.parent),
            },
        }

        with open(meta_path, "w") as f:
            yaml.dump(sidecar, f, default_flow_style=False, sort_keys=False)

        return meta_path

    def _ensure_gtd_structure(self) -> None:
        """Create GTD directory structure if it doesn't exist."""
        dirs = [
            "@Inbox",
            "@Action/Next-Actions",
            "@Action/Waiting-For",
            "@Reference",
            "@Projects",
            "@Archive",
        ]
        for d in dirs:
            (self.gtd_root / d).mkdir(parents=True, exist_ok=True)
```

### Template Registry with Fingerprinting

```python
import hashlib
from pathlib import Path

import pikepdf
import yaml


class TemplateRegistry:
    """
    Registry of pre-mapped form templates.
    Uses PDF fingerprinting for instant form recognition.
    """

    def __init__(self, templates_dir: str):
        self.templates_dir = Path(templates_dir)
        self._templates: dict[str, dict] = {}
        self.current_template: dict | None = None
        self._load_templates()

    def _load_templates(self) -> None:
        """Load all template YAML files."""
        if not self.templates_dir.exists():
            return

        for yml_file in self.templates_dir.rglob("*.yml"):
            try:
                with open(yml_file) as f:
                    template = yaml.safe_load(f)
                fp = template.get("fingerprint", "")
                self._templates[fp] = template
            except Exception:
                continue

    def fingerprint(self, pdf_path: str) -> str:
        """
        Compute a form fingerprint from PDF metadata.

        Fingerprint = SHA-256(page_count + field_count + sorted_field_names + page_dims)
        """
        pdf = pikepdf.Pdf.open(pdf_path)

        page_count = len(pdf.pages)

        # Get field names
        field_names = []
        if "/AcroForm" in pdf.Root and "/Fields" in pdf.Root["/AcroForm"]:
            for field in pdf.Root["/AcroForm"]["/Fields"]:
                name = str(field.get("/T", ""))
                if name:
                    field_names.append(name)
        field_names.sort()
        field_count = len(field_names)

        # Page dimensions
        dims = []
        for page in pdf.pages:
            mediabox = page.get("/MediaBox", [0, 0, 612, 792])
            dims.append(f"{float(mediabox[2])}x{float(mediabox[3])}")

        # Build fingerprint string
        fp_input = f"{page_count}|{field_count}|{'|'.join(field_names)}|{'|'.join(dims)}"
        fp_hash = hashlib.sha256(fp_input.encode()).hexdigest()

        return f"sha256:{fp_hash}"

    def match(self, pdf_path: str) -> dict | None:
        """
        Try to match a PDF against known templates.

        Returns template dict or None.
        """
        fp = self.fingerprint(pdf_path)
        template = self._templates.get(fp)
        if template:
            self.current_template = template
        return template

    def register(self, template: dict) -> None:
        """Register a new template."""
        fp = template.get("fingerprint", "")
        self._templates[fp] = template

        # Save to disk
        form_id = template.get("form_id", "unknown")
        path = self.templates_dir / f"{form_id}.yml"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            yaml.dump(template, f, default_flow_style=False, sort_keys=False)
```

## Performance Optimization Strategies

### Extraction Caching

```
Cache chain:
  1. Template fingerprint match → instant (< 5ms)
  2. Previously extracted fields cached by PDF hash → skip extraction
  3. OCR results cached per page image hash → skip re-OCR
  4. Mapping results cached by (field_label, profile_version) → skip re-mapping
```

### Parallel OCR

```python
from concurrent.futures import ThreadPoolExecutor


def parallel_ocr_pages(images: list, dpi: int, language: str,
                       max_workers: int = 4) -> list:
    """OCR multiple pages in parallel."""
    import pytesseract

    def ocr_page(args):
        page_num, image = args
        return page_num, pytesseract.image_to_data(
            image, lang=language, output_type=pytesseract.Output.DICT
        )

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(ocr_page, enumerate(images, 1)))

    results.sort(key=lambda r: r[0])
    return results
```

## Deployment Patterns

### CLI Workflow

```bash
# Extract and show fields without filling
skpdf extract tax-form.pdf

# Full interactive fill flow
skpdf fill tax-form.pdf

# Fill with specific profile
skpdf fill medical-intake.pdf --profile ~/.capauth/profiles/medical.yml

# File an already-filled PDF
skpdf file completed-w4.pdf --category Tax --action @Reference

# Create a template from a filled form
skpdf template w4-2026-filled.pdf --name "IRS W-4 2026"

# Batch process
skpdf fill *.pdf --batch --output ./filled/
```

### FastAPI Service

```python
from fastapi import FastAPI, UploadFile, File
from skpdf.session import FormSession

app = FastAPI(title="SKPDF Form Filling API")

@app.post("/extract")
async def extract_fields(file: UploadFile = File(...)):
    """Extract form fields from uploaded PDF."""
    # Save temp file, extract, return fields
    ...

@app.post("/fill/{session_id}")
async def fill_form(session_id: str, answers: dict):
    """Submit answers for a fill session."""
    ...

@app.get("/session/{session_id}/status")
async def session_status(session_id: str):
    """Get fill progress for a session."""
    ...
```

## Security Architecture

### Data Flow Security

```
┌─────────────────────────────────────────────────────────────┐
│ Trust Boundary: Local Machine                               │
│                                                             │
│  PDF Input ──> Sandboxed Parser (no JS execution)           │
│       │                                                     │
│       ▼                                                     │
│  Field Extraction (local, no network)                       │
│       │                                                     │
│       ▼                                                     │
│  Profile Load (CapAuth keyring, local)                      │
│       │                                                     │
│       ▼                                                     │
│  Mapping (local LLM optional, never sends PII)              │
│       │                                                     │
│       ▼                                                     │
│  Approval Gate (interactive, user confirms)                 │
│       │                                                     │
│       ▼                                                     │
│  PDF Write (local)                                          │
│       │                                                     │
│       ▼                                                     │
│  Filing ── local: stays on disk                             │
│          ── remote: TLS + CapAuth token                     │
│                                                             │
│  Audit Log: append-only, sensitive values NEVER logged      │
└─────────────────────────────────────────────────────────────┘
```

### Compliance Matrix

```
┌──────────────────────────────────────────────────────────────┐
│ Standard    │ Requirement            │ SKPDF Implementation  │
├─────────────┼────────────────────────┼───────────────────────┤
│ HIPAA       │ Access logging         │ Audit trail per field │
│             │ Minimum necessary      │ Approval gate         │
│             │ Encryption at rest     │ Optional GPG encrypt  │
├─────────────┼────────────────────────┼───────────────────────┤
│ PCI-DSS     │ Mask card data         │ Financial masking     │
│             │ Access controls        │ Approval required     │
│             │ Audit trail            │ Full audit log        │
├─────────────┼────────────────────────┼───────────────────────┤
│ SOX         │ Audit trail            │ Append-only log       │
│             │ Data integrity         │ SHA-256 checksums     │
│             │ Retention              │ Configurable (7yr)    │
├─────────────┼────────────────────────┼───────────────────────┤
│ GDPR        │ Data minimization      │ Profile-only sources  │
│             │ Right to erasure       │ Session delete API    │
│             │ Processing records     │ Metadata sidecars     │
└──────────────────────────────────────────────────────────────┘
```
