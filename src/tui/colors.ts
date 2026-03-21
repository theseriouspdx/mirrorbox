/**
 * MBO TUI — Canonical color palette
 * pink · purple · teal · magenta · gray · white · red (errors)
 *
 * In Ink/chalk terminal color mapping:
 *   pink     → magentaBright  (bright hot pink — active/running indicators)
 *   purple   → blueBright     (light blue-purple — readable on dark terminals)
 *   teal     → cyan           (teal/cyan — status, success, borders)
 *   gray     → gray + dimColor
 *   white    → white
 *   red      → red            (errors only)
 */

export const C = {
  // Primary accent colors
  pink:    'magentaBright' as const,   // hot pink  — active pipeline, running state
  purple:  '#B47FFF'       as const,   // BUG-184: bright violet — operator panel, labels, side panel
  teal:    'cyan'          as const,   // teal      — status bar, completed stages, borders

  // Text
  white:   'white'         as const,   // primary text
  gray:    'gray'          as const,   // secondary text (also use dimColor={true})

  // Semantic
  error:   'red'           as const,   // errors only
  audit:   'magentaBright' as const,   // audit gate — same as pink (urgent)
  done:    'cyan'          as const,   // completed stage checkmarks

  // Borders by role
  border: {
    active:   'cyan'          as const,   // the tab/panel you're viewing
    live:     'magentaBright' as const,   // pipeline currently running here
    audit:    'magentaBright' as const,   // audit gate pending
    idle:     '#B47FFF'       as const,   // always-visible panels at rest
    inactive: '#B47FFF'       as const,   // tabs not in focus
  },
} as const;
