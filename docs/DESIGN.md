# VeriCare AI - Design System Specification

## 1. Design Direction & Philosophy

VeriCare AI is a dense, calm, rigorous clinical verification tool designed for healthcare practitioners, verifiers, and administrators. Its design mirrors high-utility clinical EHR environments and precise engineering tools (e.g., Linear, Bloomberg Terminal ergonomics) rather than marketing websites or consumer apps.

### Core Principles
- **Clarity over Flash**: Zero glassmorphism, zero purple/blue decorative gradients, zero glowing drop shadows, zero ambient animations.
- **Data Density**: High row density, minimal vertical whitespace wastage, sticky table headers, hairline 1px dividers.
- **Max Radius 6px**: Tight, professional corners (`rounded-sm` = 2px, `rounded` = 4px, `rounded-md` = 6px). No `rounded-2xl` or `rounded-3xl`.
- **Clinical Sobriety**: No emojis. Icons are strictly functional, monochrome, and 16x16px (`w-4 h-4`).
- **Precision Copy**: Plain sentence-case with concrete numbers and states (e.g., "3 records awaiting review", "Drug interaction check failed: Warfarin + Aspirin"). Never "Welcome back!", "Unlock AI powers", or placeholder latin.
- **Safety Transparency**: Every mock or synthetic artifact is explicitly labeled with a persistent notice.

---

## 2. Color Palette & Semantic Tokens

### Accent Color: Deep Teal
Single focused accent used exclusively for primary action triggers, active navigation markers, and verified system states.
- `teal-900`: `#0a3738` (Deep contrast text / active selection)
- `teal-800`: `#0d4849` (Primary button hover)
- `teal-700`: `#0f5959` (Primary brand accent / standard interactive)
- `teal-600`: `#147273` (Focus rings / secondary highlights)
- `teal-100`: `#d8f0f0` (Muted teal backgrounds)
- `teal-50`: `#eff9f9` (Subtle selection highlight tint)

### Warm Neutral Grays
Structured for sustained clinical reading under fluorescent lighting.
- `gray-950`: `#0f1416` (High-contrast headings)
- `gray-900`: `#1c2326` (Primary text)
- `gray-700`: `#3b464a` (Secondary labels, table header text)
- `gray-500`: `#6b777d` (Muted metadata, timestamps)
- `gray-300`: `#cbd3d6` (Hairline borders, control borders)
- `gray-200`: `#e2e7e9` (Subtle dividers, table row borders)
- `gray-100`: `#f0f3f4` (Muted surface, card backgrounds, hover states)
- `gray-50`: `#f7f9fa` (App canvas background, striped rows)
- `white`: `#ffffff` (Card and modal surfaces)

### Clinical Status System
Every record status has a deterministic, accessible colorway adhering to WCAG AA:
- **`draft`**: Neutral Slate
  - Background: `#f1f3f5` | Text: `#495057` | Border: `#ced4da`
  - Icon: `FileEdit`
- **`pending_review`**: Amber / Caution
  - Background: `#fff9db` | Text: `#854d0e` | Border: `#fde047`
  - Icon: `Clock`
- **`approved`**: Emerald / Verified
  - Background: `#ecfdf5` | Text: `#065f46` | Border: `#a7f3d0`
  - Icon: `CheckCircle2`
- **`rejected`**: Rose / Critical
  - Background: `#fff1f2` | Text: `#9f1239` | Border: `#fecdd3`
  - Icon: `XCircle`
- **`superseded`**: Muted Zinc / Inactive
  - Background: `#f4f4f5` | Text: `#71717a` | Border: `#e4e4e7`
  - Icon: `History`
- **`requires_correction`**: Orange / Action Needed
  - Background: `#fff7ed` | Text: `#9a3412` | Border: `#fed7aa`
  - Icon: `AlertTriangle`

---

## 3. Typography & Spacing Scale

### Fonts
- **UI & Prose**: `IBM Plex Sans`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- **Identifiers & Clinical Data**: `IBM Plex Mono`, `Menlo`, `Consolas`, `monospace`
  - Used for Patient MRNs, Record UUIDs, ICD-10 codes, dosages, timestamp values.

### Type Hierarchy
| Level | Font Size | Line Height | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Caption / Code | 11px / 0.6875rem | 14px | 500 Mono | +0.02em | IDs, badges, table meta |
| Small / Label | 12px / 0.75rem | 16px | 500 / 600 | normal | Form labels, table headers |
| Body Default | 13px / 0.8125rem | 18px | 400 | normal | Main data, clinical notes |
| Body Emphasized | 13px / 0.8125rem | 18px | 500 / 600 | normal | Selected rows, field values |
| Section Header | 15px / 0.9375rem | 20px | 600 | -0.01em | Panel titles, modal headers |
| Page Title | 18px / 1.125rem | 24px | 600 | -0.02em | Top view title |

### 4px Spacing Grid
- `1` = 4px: inline gaps, chip internal padding
- `2` = 8px: form control vertical padding, tight gaps
- `3` = 12px: standard horizontal control padding, table row py
- `4` = 16px: panel spacing, card padding
- `6` = 24px: section margins
- `8` = 32px: page container margins

---

## 4. Shell & Layout Architecture

```
+---------------------------------------------------------------------------------------------+
| Persistent Strip: [PROTOTYPE] Academic Prototype - Synthetic Data Only (No Real PHI)       |
+---------------------------------------------------------------------------------------------+
| Sidebar (220px) | Top Bar (44px): Patient Context (MRN-84729 | Male, 58y | Allergy: Penicillin)|
|                 +---------------------------------------------------------------------------+
| - Worklist      | Main Work Area (Table-first density)                                      |
| - Patients      | Sticky table headers, 1px hairline borders                                |
| - Verification  |                                                                           |
| - Audit Log     |                                                                           |
| - Settings      |                                                                           |
+-----------------+---------------------------------------------------------------------------+
```

1. **Synthetic Data Banner**: Sticky top strip (28px height), background `#0f1416`, text `#e2e7e9`, high-contrast warning badge.
2. **Left Navigation Sidebar**: Fixed 220px width, minimal borders, clear role indicator.
3. **Clinical Header / Patient Context**: Shows active patient context (Name, MRN, Age/Gender, Key Alerts) across all tab switches.
4. **Main Density Surface**: Tables first, sticky header, hairline borders (`1px solid #e2e7e9`).

---

## 5. UI Primitives Specification

### 1. Button
- **Variants**:
  - `primary`: Deep teal background (`#0f5959`), white text, hover `#0d4849`.
  - `secondary`: White background, hairline gray border (`#cbd3d6`), hover `#f0f3f4`.
  - `ghost`: Transparent, text `#3b464a`, hover `#f0f3f4`.
  - `danger`: Muted crimson border/text or soft red background, hover `#ffe4e6`.
- **Sizes**: `sm` (28px height, 12px text), `md` (32px height, 13px text).
- **Radius**: `rounded` (4px).

### 2. Input
- Single hairline 1px border (`#cbd3d6`), focus ring 2px deep teal (`#147273`).
- Height: 32px. Text size: 13px.
- Mono variant for clinical IDs, dosages, and codes.
- Error state: 1px rose border, clear error message below in 12px rose text.

### 3. Table
- Sticky `<thead>` with light background (`#f0f3f4`), uppercase 11px muted label text.
- Row height: dense 36px, `hover:bg-[#f7f9fa]`.
- Hairline bottom border (`#e2e7e9`) on every cell.
- Numeric / date / code columns right-aligned or monospace.

### 4. StatusChip
- Strictly includes an icon (14px) + label text (11px font-medium).
- Fixed radius: 4px (`rounded`).
- Mapped to the 6 system record states:
  - `draft`, `pending_review`, `approved`, `rejected`, `superseded`, `requires_correction`.

### 5. Banner / Alert
- Informational, Warning, Critical, or Synthetic Notice.
- Hairline left accent border (3px) with neutral background.
- Compact padding (8px 12px), dismissible when contextual.

### 6. Modal
- Max-width: 560px (content-focused), overlay with backdrop blur 0px (solid 40% opacity black).
- Header with clear title and close icon (`X`, 16px).
- Sticky footer with secondary and primary actions.

### 7. EmptyState
- No playful cartoons or large illustrations.
- Subtle 16px or 20px muted Lucide icon.
- Direct sentence-case title (e.g. "No pending verifications").
- Concrete explanatory line and optional primary action button.

---

## 6. Copy & Clinical Interaction Guidelines
- **Labels**: "Clinical verifier", "Care team scope", "Awaiting review (4)".
- **Prohibited Words**: "Smart", "Magical", "Unlock", "Revolutionary", "Oops!".
- **Dates**: Standardized format `YYYY-MM-DD HH:mm` (UTC/Local noted).
- **Patient IDs**: Always formatted in `IBM Plex Mono` (e.g., `SYN-90241-A`).
