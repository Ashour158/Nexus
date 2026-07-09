# Nexus CRM Shared UI Layer

This folder now has a CRM-facing design-system layer in `crm.tsx`.

Use it for all module pages before creating local card/table/filter/form styles:

- `CRMPageHeader`: command-center page header with optional metrics and actions.
- `CRMCard`: standard white card with consistent border, padding, header, and actions.
- `CRMMetricGrid` and `CRMMetricCard`: dashboard KPI cards.
- `CRMToolbar`: filter/action surface.
- `CRMFilterPills` and `CRMSegmentedControl`: status filters and view toggles.
- `CRMStatusBadge`: shared status badge tones.
- `CRMTableShell`: shared table frame and horizontal scrolling.
- `CRMSidePanel`: right-side contextual panels.
- `CRMFormSection` and `CRMFieldGrid`: enterprise form layout.

Rules:

- Do not create new one-off card shells on pages.
- Keep repeated tables inside `CRMTableShell` or the existing `DataTable`.
- Use `CRMPageHeader` for module landing pages and record creation pages.
- Use `CRMFormSection` for create/edit forms so validation, spacing, and grouping stay consistent.
- Keep actions in `CRMToolbar` or `CRMPageHeader.actions`.
