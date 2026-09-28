---
version: alpha
name: Zeno Paper Desk
description: Notion-inspired document rhythm and components with Zeno's existing Playground color tokens.
colors:
  primary: "#DAF978"
  primary-hover: "#CBEE66"
  primary-active: "#B4CF5D"
  accent: "#93ACFF"
  accent-deep: "#335EEA"
  background: "#202820"
  background-secondary: "#263026"
  surface: "#2A342A"
  surface-hover: "#344034"
  border: "#465242"
  text-primary: "#F5F4ED"
  text-secondary: "#C3CBBD"
  text-muted: "#AAB6A2"
  light-primary: "#C3DD78"
  light-primary-hover: "#B7D269"
  light-background: "#DADDD2"
  light-background-secondary: "#D3D7CB"
  light-surface: "#E9EBE1"
  light-surface-hover: "#C9D0C0"
  light-border: "#B7C0AF"
  light-text-primary: "#202820"
  light-text-secondary: "#424E3F"
  light-text-muted: "#53604F"
  light-accent: "#3359C7"
  success: "#72C391"
  warning: "#D9AE5E"
  danger: "#E57979"
typography:
  display-1: {fontFamily: Inter, fontSize: 64px, fontWeight: 700, lineHeight: 1, letterSpacing: "-2.125px"}
  display-2: {fontFamily: Inter, fontSize: 54px, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-1.875px"}
  heading-1: {fontFamily: Inter, fontSize: 40px, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-1px"}
  heading-2: {fontFamily: Inter, fontSize: 26px, fontWeight: 700, lineHeight: 1.23, letterSpacing: "-0.625px"}
  heading-3: {fontFamily: Inter, fontSize: 22px, fontWeight: 700, lineHeight: 1.27, letterSpacing: "-0.25px"}
  body-md: {fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5}
  body-sm: {fontFamily: Inter, fontSize: 15px, fontWeight: 400, lineHeight: 1.33}
  button: {fontFamily: Inter, fontSize: 16px, fontWeight: 500, lineHeight: 1.5}
  caption: {fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.43}
  eyebrow: {fontFamily: Inter, fontSize: 12px, fontWeight: 600, lineHeight: 1.33, letterSpacing: "0.125px"}
rounded:
  xs: 4px
  sm: 5px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 28px
  xxl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 12px
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xs}"
    padding: 6px
  nav-utility:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Overview

Adapt Notion's quiet, document-first composition to Zeno. **Only the color system is exempt:** retain the existing Zeno Playground dark/light palette and existing semantic status colors. Do not copy Notion blue, warm paper hex values, indigo, or its sticker palette. The Zeno lime remains the primary action, blue remains supporting accent, and statuses retain their semantic colors. Do not rebrand Zeno or alter data/navigation behavior.

## Colors

The front matter records the existing Zeno CSS values, not the source site's colors. Dark and light aliases map to `frontend/src/styles.css`; landing and authentication keep their corresponding local theme aliases. Illustrations may keep the existing Zeno artwork palette. No color migration is part of this design.

## Typography

Use self-hosted open-source Inter in place of proprietary NotionInter. Apply its heavy, tightly tracked display/headline hierarchy and calm 400-weight body copy. Keep the three existing Compact / Standard / Expanded accessibility profiles: sizes and line heights scale by profile, not a hardcoded one-size replacement. Numeric/code data can keep monospace for legibility; prose, controls and labels use Inter.

## Layout

An 8px rhythm, centred ~1080–1300px reading column, generous whitespace, and 2-up/3-up cards where appropriate. Retain real dashboard navigation and responsive interactions. On mobile, stack content, maintain 44px hit targets and prevent horizontal overflow. Pricing-specific examples in the source are illustrative, not new Zeno features.

## Elevation & Depth

Cards use a hairline border and a restrained layered micro-shadow; elevated popovers use a slightly deeper soft shadow. Remove heavyweight cast shadows and glass effects from ordinary surfaces. Preserve Zeno illustration and existing semantic status indicators.

## Shapes

Cards and illustration frames: 12px; large wells: 16px; utility/nav buttons: 8px; inputs: 4px; marketing CTAs and intentional round controls: full pill. The geometric Petal Cluster is exempt from generic shape overrides: preserve its SVG path, Back hub and exact hit areas.

## Components

Use a restrained nav, pill primary/secondary marketing CTAs, compact utility buttons, hairline feature cards, square-ish inputs and gently raised modal/popover surfaces. Adapt the source's single inverted hero moment using existing Zeno colors; do not import a new hue. Keep route-specific application components and statuses functional.

## Do's and Don'ts

- Do keep all Zeno colors, both themes, semantic states, logo and artwork; only change non-color design tokens and their implementation.
- Do distinguish display, section heading, card title, body, caption and eyebrow by weight, size and tracking.
- Do verify selected font profiles on page-specific reading surfaces including Journaling, and test desktop/mobile.
- Don't change persisted theme keys, account boundaries, forms, API data, routes or Petal Cluster geometry.
- Don't copy Notion's brand blue/stickers/indigo/warm-paper palette into Zeno.
