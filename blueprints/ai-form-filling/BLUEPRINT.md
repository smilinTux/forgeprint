# AI-Powered Form Filling (SKPDF) Blueprint

## Overview & Purpose

SKPDF provides intelligent PDF extraction, form filling, and document management integrated with CapAuth sovereign profiles and GTD filing. Given any PDF form -- interactive AcroForm, XFA, or scanned paper -- SKPDF extracts fields, maps them to the user's sovereign profile, auto-fills known values, conversationally asks for missing data, writes the completed PDF, and files it into a GTD-organized document hierarchy. The user approves sensitive fields before they are written. No data leaves the local machine unless the user explicitly chooses a remote filing destination.

### Core Responsibilities
- **Field Extraction**: Detect and extract form fields from AcroForms, XFA, and OCR-scanned documents
- **Profile Mapping**: Map extracted fields to CapAuth sovereign profile data paths
- **Auto-Fill Engine**: Populate known fields from profile data without user intervention
- **Question Flow**: Conversationally ask for missing or ambiguous field values
- **Sensitive Field Gating**: Require explicit approval before writing SSN, medical, financial data
- **PDF Writing**: Write filled values back to PDF preserving original formatting
- **GTD Filing**: Automatically categorize and file completed documents
- **Template Library**: Pre-mapped field definitions for common government and medical forms
- **Metadata Sidecars**: Generate `.meta.yml` companion files tracking fill history and sources

## Core Concepts

### 1. Form Session

**Definition**: A stateful workflow from PDF intake through filling to filing. Tracks all fields, mappings, approvals, and user responses.

```
FormSession {
    session_id: UUID v4
    pdf_path: Path to source PDF
    state: extracting | mapping | filling | reviewing | writing | filing | complete | error
    pages: List[Page]
    fields: List[FormField]
    profile: ProfileSnapshot (frozen at session start)
    mappings: Map<field_id, ProfilePath | UserInput | Skipped>
    approvals: Map<field_id, approved | pending | denied>
    questions: List[Question] (unanswered)
    answers: Map<field_id, UserAnswer>
    metadata: SessionMetadata
    created: ISO-8601 timestamp
    completed: ISO-8601 timestamp | None
}
```

### 2. Form Field

**Definition**: A single fillable element extracted from the PDF.

```
FormField {
    field_id: UUID
    page: Integer (1-indexed)
    name: Original field name from PDF (may be opaque)
    label: Human-readable label (extracted or inferred)
    type: text | checkbox | radio | dropdown | signature | date | number
    required: Boolean
    sensitive: Boolean (SSN, medical, financial)
    sensitivity_category: pii | medical | financial | legal | none
    value: Current value (None if empty)
    options: List[String] (for dropdown/radio)
    position: {x, y, width, height} (PDF coordinates)
    extraction_method: acroform | xfa | ocr | template
    confidence: Float (0.0-1.0, OCR confidence)
    profile_path: Mapped profile data path (None if unmapped)
}
```

### 3. Profile Data

**Definition**: The user's sovereign profile sourced from CapAuth, organized by domain.

```
Profile {
    identity: {
        full_name: String
        first_name: String
        middle_name: String
        last_name: String
        suffix: String
        date_of_birth: Date
        ssn: String (sensitive, gated)
        gender: String
        marital_status: String
    }
    contact: {
        email: String
        phone: String
        address: {
            street: String
            street2: String
            city: String
            state: String
            zip: String
            country: String
        }
    }
    employment: {
        employer: String
        title: String
        income: Decimal (sensitive, gated)
        start_date: Date
    }
    medical: {
        insurance_provider: String (sensitive, gated)
        policy_number: String (sensitive, gated)
        group_number: String (sensitive, gated)
        primary_physician: String
        allergies: List[String]
        medications: List[String]
        conditions: List[String]
    }
    financial: {
        bank_name: String (sensitive, gated)
        routing_number: String (sensitive, gated)
        account_number: String (sensitive, gated)
        tax_filing_status: String
    }
    vehicles: List[{
        make: String
        model: String
        year: Integer
        vin: String
        plate: String
    }]
    dependents: List[{
        name: String
        relationship: String
        date_of_birth: Date
        ssn: String (sensitive, gated)
    }]
}
```

### 4. Field Mapper

**Definition**: The engine that resolves form field labels to profile data paths using layered matching strategies.

```
FieldMapper {
    strategies: [
        TemplateMatch,     # Exact form fingerprint match (fastest, most accurate)
        ExactLabelMatch,   # Field label == profile path label
        FuzzyLabelMatch,   # Levenshtein distance < threshold
        SemanticMatch,     # LLM-assisted meaning comparison
    ]

    map(field: FormField, profile: Profile) -> MappingResult {
        for strategy in strategies:
            result = strategy.match(field, profile)
            if result.confidence > threshold:
                return result
        return MappingResult(mapped=False, reason="no match found")
    }

    MappingResult {
        mapped: Boolean
        profile_path: String (e.g., "identity.full_name")
        confidence: Float (0.0-1.0)
        strategy: String (which strategy matched)
        value: The resolved value from profile
        sensitive: Boolean
    }
}
```

### 5. Question Engine

**Definition**: Generates conversational questions for fields that could not be auto-filled.

```
QuestionEngine {
    pending_fields: List[FormField] (unmapped or low-confidence)

    generate_questions(fields) -> List[Question]:
        Group related fields (e.g., all address fields together)
        Order by page number, then position
        Format as natural language questions

    Question {
        field_ids: List[field_id] (may cover multiple related fields)
        text: Natural language question
        hint: Contextual help text
        required: Boolean
        input_type: text | choice | date | confirm
        choices: List[String] (for choice type)
    }
}
```

### 6. GTD Filer

**Definition**: Automatic document categorization and filing into a GTD directory structure.

```
GTDFiler {
    root: Path to GTD document root (~/Documents)
    naming: Template for filenames ("{date}_{description}_{source}")

    file(session: FormSession) -> FilingResult:
        category = classify(session)  # medical, tax, legal, insurance, etc.
        action = determine_action(session)  # reference, action, archive
        dest = build_path(root, action, category, year)
        copy filled PDF to dest
        write metadata sidecar (.meta.yml)
        return FilingResult(path=dest, metadata_path=...)

    GTD Structure:
        ~/Documents/
          @Inbox/                  # Unprocessed
          @Action/
            Next-Actions/          # Needs immediate follow-up
            Waiting-For/           # Sent, awaiting response
          @Reference/
            Medical/2026/          # Categorized by type + year
            Tax/2026/
            Legal/2026/
            Insurance/2026/
            Government/2026/
            Financial/2026/
          @Projects/
            house-purchase/        # Active multi-document projects
            tax-2025/
          @Archive/                # Completed, rarely accessed
}
```

## Architecture Patterns

### 1. Pipeline Architecture

```
PDF Input
    |
    v
┌─────────────────────┐
│  PDF Parser          │  pikepdf + pdfplumber + Tesseract
│  - Detect form type  │
│  - Extract fields    │
│  - OCR if needed     │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  Field Mapper        │  Template > Exact > Fuzzy > Semantic
│  - Match to profile  │
│  - Score confidence  │
│  - Flag sensitive    │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  Auto-Fill Engine    │  Write high-confidence mappings
│  - Apply values      │
│  - Skip sensitive    │
│  - Track sources     │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  Question Engine     │  Ask for missing values
│  - Group fields      │
│  - Natural language  │
│  - Validate answers  │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  Approval Gate       │  Sensitive field review
│  - Show SSN, medical │
│  - Require confirm   │
│  - Audit log entry   │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  PDF Writer          │  reportlab + pikepdf
│  - Write values      │
│  - Flatten if needed │
│  - Preserve format   │
└─────────┬───────────┘
          |
          v
┌─────────────────────┐
│  GTD Filer           │  Categorize + file + metadata
│  - Classify document │
│  - Build path        │
│  - Write sidecar     │
└─────────────────────┘
```

**Benefits:**
- Each stage independently testable
- Pipeline can be paused/resumed at any stage
- Stages can run in parallel where independent (extraction + profile load)

**Limitations:**
- OCR stage can be slow for large scanned documents
- LLM-based semantic matching adds latency and cost

### 2. Form Fingerprinting

```
PDF loaded
    |
    v
Compute fingerprint:
  hash(page_count + field_count + field_names_sorted + page_dimensions)
    |
    v
Lookup in template library:
  ├── HIT: Load pre-defined field mappings (instant, 100% confidence)
  │         e.g., IRS Form W-4 -> known field-to-profile map
  │
  └── MISS: Fall through to generic extraction pipeline
             (fuzzy + semantic matching)
```

**Benefits:**
- Instant recognition of known government/medical forms
- Community-contributed template library grows over time
- Zero LLM cost for recognized forms

**Limitations:**
- Form revisions require template updates
- Slight layout changes can break fingerprint match

### 3. Sensitive Field Approval Gate

```
Auto-fill encounters sensitive field:
    |
    v
Check sensitivity_category:
  ├── pii (SSN, DOB)
  ├── medical (conditions, medications)
  ├── financial (account numbers, income)
  └── legal (signatures, attestations)
    |
    v
Approval flow:
  1. Display field name + mapped value (masked: ***-**-1234)
  2. Show source: "From CapAuth profile: identity.ssn"
  3. Require explicit "approve" or "deny"
  4. Log approval with timestamp + session_id
  5. Only write to PDF after approval
```

**Benefits:**
- User maintains sovereignty over sensitive data
- Audit trail for compliance (HIPAA, PCI)
- Prevents accidental exposure of sensitive values

**Limitations:**
- Adds friction to the filling workflow
- Users may fatigue on forms with many sensitive fields

## Data Flow Diagrams

### Complete Form Fill Flow

```
User provides PDF
        |
        v
Parse PDF:
  pikepdf.open(pdf_path) -> PDF object
  pdfplumber.open(pdf_path) -> page layouts
        |
        v
Detect form type:
  ├── Has AcroForm fields -> extract_acroform()
  ├── Has XFA data -> extract_xfa()
  └── No interactive fields -> ocr_extract()
        |
        v
Load CapAuth profile:
  capauth.load_profile(fingerprint) -> Profile
        |
        v
Map fields to profile:
  for each field:
    ├── template_match(field, templates) -> HIT? use it
    ├── exact_match(field.label, profile_paths) -> HIT? use it
    ├── fuzzy_match(field.label, profile_paths) -> HIT? use it
    └── semantic_match(field.label, profile_paths) -> HIT? use it
        |
        v
Auto-fill non-sensitive fields:
  for each mapped field where sensitive == False:
    field.value = profile[mapping.profile_path]
        |
        v
Generate questions for unmapped fields:
  question_engine.generate(unmapped_fields) -> questions
        |
        v
Present questions to user (CLI, API, or chat):
  for each question:
    answer = prompt_user(question)
    field.value = answer
        |
        v
Approval gate for sensitive fields:
  for each sensitive mapped field:
    show_masked_value(field)
    if user.approves():
        field.value = profile[mapping.profile_path]
    else:
        field.value = None  # or ask for manual input
        |
        v
Write filled PDF:
  pdf_writer.write(pdf, fields) -> filled_pdf_path
        |
        v
File to GTD:
  gtd_filer.file(session) -> {pdf_path, meta_path}
        |
        v
Generate metadata sidecar:
  write_sidecar(session) -> .meta.yml
```

### OCR Extraction Flow

```
Scanned PDF page (image)
        |
        v
Pre-process:
  ├── Deskew (correct rotation)
  ├── Denoise (remove artifacts)
  ├── Binarize (black/white threshold)
  └── DPI normalize (to 300 DPI)
        |
        v
Tesseract OCR:
  pytesseract.image_to_data(image, output_type=Output.DICT)
  -> text + bounding boxes + confidence scores
        |
        v
Field detection:
  ├── Find label patterns: "Name:", "DOB:", "Address"
  ├── Find fillable regions: underlines, boxes, blank spaces
  ├── Pair labels with nearest fill region
  └── Create FormField objects with position and label
        |
        v
Confidence filtering:
  ├── confidence > 0.8 -> auto-map
  ├── 0.5 < confidence < 0.8 -> map with review flag
  └── confidence < 0.5 -> skip, ask user
```

## Configuration Model

```yaml
# ~/.skpdf/config.yml

profile:
  source: capauth
  fingerprint: "CCBE9306410CF8CD5E393D6DEC31663B95230684"
  sensitive_require_approval: true
  approval_timeout: 300          # Seconds before approval request expires

extraction:
  methods:
    - acroform
    - xfa
    - ocr
  ocr_engine: tesseract
  ocr_dpi: 300
  ocr_language: eng
  ocr_confidence_threshold: 0.5
  template_library: "~/.skpdf/templates/"

mapping:
  strategies:
    - template
    - exact
    - fuzzy
    - semantic
  fuzzy_threshold: 0.75
  semantic_model: "local"        # "local" (ollama) or "none"
  semantic_threshold: 0.80

filling:
  auto_fill_non_sensitive: true
  auto_fill_sensitive: false     # Always require approval
  flatten_after_fill: false      # Flatten form fields (makes non-editable)
  preserve_original: true        # Keep unfilled copy

filing:
  gtd_root: "~/Documents"
  naming: "{date}_{form_type}_{description}"
  auto_categorize: true
  metadata_sidecars: true
  destinations:
    - type: local
      path: "~/Documents"
    - type: nextcloud
      url: "https://cloud.example.com"
      folder: "/Documents/Forms/"
    # - type: gdrive
    #   folder_id: "..."
    # - type: email
    #   to: "records@example.com"
    # - type: ipfs
    #   pin: true

logging:
  level: info
  file: "~/.skpdf/logs/skpdf.log"
  audit_log: "~/.skpdf/logs/audit.log"    # Sensitive field access log
  max_size: 50MB
  rotate: 7
```

## Security Considerations

### 1. Sensitive Data Protection
- SSN, medical, and financial fields NEVER auto-filled without explicit approval
- Approval requires interactive confirmation (no batch auto-approve)
- Audit log records every sensitive field access with timestamp and session
- Masked display by default (***-**-1234) until user explicitly reveals

### 2. Data Sovereignty
- All processing happens locally -- no cloud API calls for extraction or filling
- OCR runs locally via Tesseract (no image upload to third parties)
- Semantic matching can use local LLM (Ollama) or be disabled entirely
- Profile data sourced from CapAuth local keyring only

### 3. PDF Security
- Signed PDFs: warn user if form fields are in a signed document
- Encrypted PDFs: decrypt with user-provided password, re-encrypt after fill
- Malicious PDFs: sandbox PDF parsing (no JavaScript execution)
- Integrity: SHA-256 checksum of original and filled PDF in metadata sidecar

### 4. Filing Security
- Remote filing destinations authenticated via CapAuth tokens
- Files encrypted in transit (TLS for WebDAV/Nextcloud, IPFS encryption)
- Optional GPG encryption of filed PDFs at rest
- Metadata sidecars contain no sensitive field values (only field names and sources)

### 5. Audit Compliance
- HIPAA: medical form fills logged with access timestamp and user identity
- PCI-DSS: financial fields masked in all logs and UI
- SOX: audit trail of every field modification in session
- Retention: audit logs retained per configuration (default 7 years)

## Performance Targets

| Metric | Target |
|--------|--------|
| AcroForm field extraction | < 500ms (50-field form) |
| XFA field extraction | < 1s (complex XFA) |
| OCR extraction (single page, 300 DPI) | < 3s |
| OCR extraction (10 pages, 300 DPI) | < 20s |
| Template fingerprint lookup | < 5ms |
| Exact + fuzzy field mapping (50 fields) | < 100ms |
| Semantic field mapping (50 fields, local LLM) | < 10s |
| PDF writing (50 filled fields) | < 1s |
| GTD filing (local) | < 100ms |
| GTD filing (Nextcloud WebDAV) | < 2s |
| Metadata sidecar generation | < 50ms |
| Memory footprint (idle) | < 50MB |
| Memory footprint (large PDF, OCR active) | < 500MB |

## Extension Points

### Custom Extraction Method

```python
from skpdf.extraction import Extractor, FormField

class CustomExtractor(Extractor):
    """Extract fields from a custom document format."""

    name = "custom"

    def can_extract(self, pdf_path: str) -> bool:
        """Return True if this extractor handles this PDF."""
        return has_custom_markers(pdf_path)

    def extract(self, pdf_path: str) -> list[FormField]:
        """Extract form fields from the PDF."""
        fields = []
        # Custom extraction logic
        return fields
```

### Custom Filing Destination

```python
from skpdf.filing import FilingDestination, FilingResult

class IPFSDestination(FilingDestination):
    """File documents to IPFS."""

    name = "ipfs"

    def file(self, pdf_path: str, metadata: dict) -> FilingResult:
        """Upload PDF to IPFS and return CID."""
        cid = ipfs_client.add(pdf_path, pin=True)
        return FilingResult(
            destination="ipfs",
            path=f"ipfs://{cid}",
            success=True,
        )
```

### Custom Field Mapping Strategy

```python
from skpdf.mapping import MappingStrategy, MappingResult

class RegexMapper(MappingStrategy):
    """Map fields using regex patterns against profile paths."""

    name = "regex"
    priority = 2  # After template, before fuzzy

    def match(self, field: FormField, profile: dict) -> MappingResult:
        """Attempt to match field label to profile path."""
        for path, pattern in self.patterns.items():
            if re.match(pattern, field.label, re.IGNORECASE):
                return MappingResult(
                    mapped=True,
                    profile_path=path,
                    confidence=0.85,
                    strategy="regex",
                )
        return MappingResult(mapped=False)
```

### Template Contribution

```yaml
# templates/irs-w4-2026.yml

form_id: "irs-w4-2026"
name: "IRS Form W-4 (2026)"
fingerprint: "sha256:abc123..."
pages: 4

field_mappings:
  - pdf_field: "f1_01"
    label: "First name and middle initial"
    profile_path: "identity.first_name"
    transform: "append_middle_initial"
  - pdf_field: "f1_02"
    label: "Last name"
    profile_path: "identity.last_name"
  - pdf_field: "f1_03"
    label: "Social security number"
    profile_path: "identity.ssn"
    sensitive: true
  - pdf_field: "f1_04"
    label: "Address"
    profile_path: "contact.address.street"
  - pdf_field: "f1_05"
    label: "City or town, state, and ZIP code"
    profile_path: "contact.address"
    transform: "city_state_zip"
```

## Implementation Architecture

### Core Components

```
skpdf/
  __init__.py               # Package entry, version
  cli.py                    # Click CLI (fill, extract, file, template, status)
  session.py                # FormSession lifecycle management
  extraction/
    __init__.py
    base.py                 # Extractor ABC
    acroform.py             # AcroForm field extraction (pikepdf)
    xfa.py                  # XFA XML extraction
    ocr.py                  # Tesseract OCR extraction (pdfplumber + pytesseract)
    preprocessor.py         # Image preprocessing (deskew, denoise, binarize)
  mapping/
    __init__.py
    base.py                 # MappingStrategy ABC
    template.py             # Template fingerprint matcher
    exact.py                # Exact label match
    fuzzy.py                # Levenshtein fuzzy match
    semantic.py             # LLM-assisted semantic match
    pipeline.py             # Strategy chain orchestrator
  filling/
    __init__.py
    engine.py               # Auto-fill engine
    approval.py             # Sensitive field approval gate
    questions.py            # Question engine for missing fields
  writing/
    __init__.py
    writer.py               # PDF value writer (pikepdf + reportlab)
    overlay.py              # Text overlay for non-interactive PDFs
  filing/
    __init__.py
    base.py                 # FilingDestination ABC
    gtd.py                  # GTD categorizer and filer
    local.py                # Local filesystem destination
    webdav.py               # WebDAV/Nextcloud destination
    gdrive.py               # Google Drive destination
    email.py                # Email destination
    ipfs.py                 # IPFS destination
    metadata.py             # .meta.yml sidecar generator
  templates/
    __init__.py
    registry.py             # Template fingerprint registry
    irs/                    # IRS form templates (W-4, W-9, 1040, etc.)
    ssa/                    # Social Security Administration forms
    dmv/                    # DMV forms (state-specific)
    medical/                # Medical intake forms
  profile/
    __init__.py
    capauth.py              # CapAuth profile loader
    schema.py               # Profile Pydantic models
  config.py                 # YAML config loader
```

### Data Structures

```
~/.skpdf/
  config.yml                        # Global configuration
  logs/
    skpdf.log                       # Runtime logs
    audit.log                       # Sensitive field access audit
  templates/
    irs-w4-2026.yml                 # Form templates
    irs-w9-2026.yml
    ssa-ss5.yml
    custom/                         # User-defined templates
  sessions/
    <session_id>/
      original.pdf                  # Untouched source PDF
      filled.pdf                    # Completed PDF
      session.json                  # Session state snapshot
      .meta.yml                     # Metadata sidecar

~/Documents/                        # GTD filing root
  @Inbox/
  @Action/
    Next-Actions/
    Waiting-For/
  @Reference/
    Medical/2026/
      2026-02-27_intake-form_dr-smith.pdf
      2026-02-27_intake-form_dr-smith.meta.yml
    Tax/2026/
    Legal/2026/
  @Projects/
  @Archive/
```

### Metadata Sidecar Format

```yaml
# 2026-02-27_intake-form_dr-smith.meta.yml

document:
  original_filename: "patient_intake_form.pdf"
  form_type: "medical_intake"
  pages: 3
  fields_total: 42
  fields_filled: 38
  fields_skipped: 4

session:
  session_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  started: "2026-02-27T10:30:00Z"
  completed: "2026-02-27T10:35:22Z"
  profile_source: "capauth"

extraction:
  method: "acroform"
  template_used: "medical-intake-v2"

filling:
  auto_filled: 30
  user_answered: 6
  sensitive_approved: 2
  sensitive_denied: 0
  skipped: 4

filing:
  destination: "local"
  category: "Medical"
  gtd_action: "@Reference"
  path: "~/Documents/@Reference/Medical/2026/"

checksums:
  original: "sha256:abc123..."
  filled: "sha256:def456..."
```
