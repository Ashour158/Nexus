# Frontend Design Reference — InsightStream CRM

> Source: Design created by Ahmed using Stitch. To be used as the target reference for Nexus CRM frontend redesign post-launch.

---

## Overview

Two-panel Reports screen showing a polished enterprise CRM UI. Color palette: blue primary (#4F6CF7 approx.), white cards, slate/dark body text. Clean, data-dense but not cluttered.

---

## Screen 1 — Reports: Executive Summary (Left Panel)

### Layout
- Left sidebar (collapsed, icon + label): Dashboard, Leads, Deals, Reports, Settings
- Main content: full-width with top heading + period switcher (Monthly / Quarterly / Yearly)

### Components to replicate
| Component | Details |
|-----------|---------|
| **Revenue Performance card** | Large primary metric `$12,482,900`, target vs actual legend, bar chart (Jul–Dec) |
| **Pipeline Velocity card** | Donut chart — 342 active deals, breakdown: Qualified 148, Proposal 65, Negotiation 69, Closing 40 |
| **KPI strip** | Win Rate 64.2%, Avg Deal Value $48.2k, Sales Cycle 32 Days, Customer LTV $124k — each with trend delta |
| **Top Strategic Wins table** | Columns: Enterprise Client, Executive Lead, Amount, Region, Vertical, Impact Score (star rating) |

---

## Screen 2 — Reports: Detailed Table View (Right Panel)

### Layout
- Same sidebar
- Filter bar at top: Date Range, Team, User dropdowns + refresh icon
- Four KPI cards row
- Main table + two side panels (Revenue by Territory, Recent Events)

### Components to replicate
| Component | Details |
|-----------|---------|
| **KPI cards** | Total Revenue $428,500, Conversion Rate 24.8% (sparkline up), Active Deals 114, Avg Deal Size $12,400 |
| **Detailed Performance Log** | Columns: Date, Customer (logo + name + subtitle), Owner (avatar + name), Deal Value, Status (colored badge), Actions (⋮ menu). Pagination controls. |
| **Status badge colors** | CLOSED WON=green, IN PROGRESS=blue, PENDING APPROVAL=yellow/orange, CLOSED LOST=red |
| **Revenue by Territory** | Horizontal bar chart: North America $245,000 (+5%), Europe & EMEA $128,400 (+2%), Asia Pacific $49,100 (+8%) |
| **Recent Events feed** | Icon + actor + action + timestamp, scrollable. "View Audit Log" CTA at bottom. |

---

## Implementation Priority (post-launch)

1. **Reports page** (`/reports`) — highest ROI, direct replacement of current JSON dump view
2. **Dashboard home** (`/`) — adopt KPI card strip + pipeline velocity donut
3. **Sidebar redesign** — collapse 20+ items into grouped top-level nav with sub-items
4. **Deal table** (`/deals`) — adopt status badge colors + avatar owner column from Detailed Table

---

## Mapping to Nexus Services

| Design element | Nexus data source |
|----------------|-------------------|
| Revenue Performance chart | `analytics-service` ClickHouse aggregates |
| Pipeline Velocity donut | `crm-service` deal stage counts |
| Top Strategic Wins | `crm-service` `/deals?stage=CLOSED_WON&sort=value` |
| Revenue by Territory | `territory-service` routing logs + deal values |
| Recent Events feed | Kafka event stream via `realtime-service` WebSocket |
| KPI cards | `analytics-service` `/metrics/summary` |

---

## Notes
- Sidebar nav hierarchy needs redesign for Nexus scale (20+ pages vs 5 shown here)
- Fonts appear to be Inter or similar — already used in Nexus via Tailwind
- Blue primary is close to Tailwind `indigo-500` / `blue-600` — can be added as CSS variable
