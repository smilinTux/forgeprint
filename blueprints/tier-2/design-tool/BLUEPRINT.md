# Design Tool Blueprint
> Figma / Penpot / Excalidraw alternative

## Overview
A collaborative vector design tool running in the browser. Supports UI/UX design, prototyping, component systems, auto-layout, and real-time multi-user collaboration on an infinite canvas.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| Figma | 4M+ | Free/$15/$45/$75 | Browser-native, multiplayer |
| Penpot | 300K+ | Free/open-source | Open-source, SVG-native |
| Excalidraw | 1M+ | Free/open-source | Whiteboard-style, hand-drawn |
| Sketch | 1M+ | $12/editor/mo | macOS native, plugins |
| Canva | 170M+ | Free/$13/$30 | Templates, non-designers |

## Core Concepts
- **Infinite Canvas**: Pan/zoom viewport over a 2D coordinate space
- **Scene Graph**: Tree of objects (frames, shapes, text, images, groups, components)
- **Vector Graphics**: Bézier paths, fills, strokes, effects rendered via GPU
- **Components & Instances**: Master components with overridable instances
- **Auto Layout**: Flexbox-like constraint system for responsive frames
- **Prototyping**: Interactive flows with transitions between frames
- **Design Tokens**: Shared colors, typography, spacing as reusable variables
- **Real-time Collaboration**: CRDT-based multiplayer with cursors

## Architecture

```
┌─────────────────────────────────────────────┐
│           Browser (Canvas Engine)            │
│  ┌──────────┬──────────┬──────────────────┐ │
│  │ WebGL/   │ Scene    │ Input Handler    │ │
│  │ WebGPU   │ Graph    │ (mouse/kb/touch) │ │
│  │ Renderer │ (CRDT)   │                  │ │
│  └──────────┴──────────┴──────────────────┘ │
│         ↕ WebSocket (CRDT sync)             │
├─────────────────────────────────────────────┤
│              Collaboration Server            │
│  (CRDT merge, presence, auth, persistence)   │
├─────────────────────────────────────────────┤
│  PostgreSQL │ S3 (assets) │ Redis (presence) │
└─────────────────────────────────────────────┘
```

### Scene Graph Model
```typescript
interface SceneNode {
  id: string;
  type: 'FRAME' | 'RECTANGLE' | 'ELLIPSE' | 'TEXT' | 'PATH' | 'GROUP' | 'COMPONENT' | 'INSTANCE' | 'IMAGE';
  name: string;
  x: number; y: number;
  width: number; height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  children?: SceneNode[];  // for frames, groups, components
  
  // Style
  fills: Paint[];       // solid, gradient, image
  strokes: Paint[];
  strokeWidth: number;
  cornerRadius: number | [number, number, number, number];
  effects: Effect[];    // shadow, blur
  blendMode: string;
  
  // Constraints & Layout
  constraints: { horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'STRETCH'; vertical: ... };
  autoLayout?: { direction: 'HORIZONTAL' | 'VERTICAL'; spacing: number; padding: [t,r,b,l]; align: string; };
  
  // Component-specific
  componentId?: string;     // for instances
  overrides?: Override[];   // instance overrides
}

interface Paint {
  type: 'SOLID' | 'LINEAR_GRADIENT' | 'RADIAL_GRADIENT' | 'IMAGE';
  color?: {r,g,b,a};
  gradientStops?: {position, color}[];
  imageRef?: string;
  scaleMode?: 'FILL' | 'FIT' | 'TILE';
}
```

### Rendering Pipeline
```
Scene Graph → Dirty detection → Build render list (z-order)
  → Batch by shader/texture → GPU draw calls (WebGL2/WebGPU)
  
Optimizations:
- Spatial index (R-tree) for viewport culling
- Level of detail: skip details when zoomed out
- Cached rasterization of complex shapes
- Incremental re-render (only dirty regions)
- Web Workers for path tessellation
```

### Canvas Rendering (WebGL2)
- Quadratic/cubic Bézier curves → tessellated to triangles
- Text: SDF (Signed Distance Field) rendering for crisp text at any zoom
- Images: GPU texture atlas with mipmaps
- Effects: Multi-pass (shadow → blur → composite)
- Export: Re-render to offscreen canvas at target resolution → PNG/SVG/PDF

## API Design
```
# Files (design documents)
GET    /api/v1/files/:id              # File metadata + page list
GET    /api/v1/files/:id/nodes        # Get specific nodes by ID
GET    /api/v1/files/:id/images       # Export nodes as images
GET    /api/v1/files/:id/comments     # Comments on file

# Components
GET    /api/v1/files/:id/components   # List components
GET    /api/v1/teams/:id/components   # Team component library

# Projects
GET    /api/v1/teams/:id/projects
GET    /api/v1/projects/:id/files

# Export
POST   /api/v1/export                 # Export frames as PNG/SVG/PDF
```

## Security
- Per-file permissions (owner, editor, viewer)
- Share links with role (view/edit/comment)
- Asset uploads validated (type, size, dimensions)
- WebSocket auth via JWT
- Rate limiting on export (CPU-intensive)

## Performance Targets
| Metric | Target |
|--------|--------|
| 60fps canvas interaction | 10K objects visible |
| Object selection | < 10ms |
| Undo/redo | < 16ms |
| File open (1000 objects) | < 2s |
| Export PNG (4K) | < 3s |
| Collaboration sync | < 100ms |

## Tech Stack
| Component | Recommended |
|-----------|------------|
| Canvas Renderer | WebGL2 (custom) or PixiJS/Konva |
| Scene Graph CRDT | Yjs + custom bindings |
| Frontend | TypeScript + React (panels) + WebGL (canvas) |
| Backend | Rust (Axum) or Go (Fiber) |
| Storage | PostgreSQL + S3 |
| Export | Skia (via wasm) or server-side headless render |

## MVP Tiers

### Tier 1 — Canvas Editor (3-5 weeks)
- Infinite canvas with pan/zoom
- Basic shapes (rect, ellipse, line, text)
- Selection, move, resize, rotate
- Fill/stroke colors
- Undo/redo
- Export to PNG

### Tier 2 — Design Tool (5-10 weeks)
- Frames with auto-layout
- Pen tool (Bézier paths)
- Typography controls
- Image imports
- Layers panel
- Components (create + instances)
- SVG export

### Tier 3 — Collaboration (10-16 weeks)
- Real-time multiplayer editing
- Comments
- Version history
- Shared component libraries
- Design tokens (variables)
- Prototyping (link frames, transitions)

### Tier 4 — Platform (16-24 weeks)
- Plugin API (like Figma plugins)
- Dev mode (inspect, export CSS/code)
- Handoff specs
- Branching (like git for designs)
- AI features (auto-layout suggestions, generate from text)
