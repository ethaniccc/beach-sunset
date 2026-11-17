import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { paintSunset } from './paint.js'

const SCENE = 'beach-sunset'

// The drawing, made once when the mod loads.
const PAINTING = paintSunset()

// Colors taken from the drawing: navy panels, warm cream text, a sunset orange accent.
// Dark mode only, so the cream text and navy boxes always match.
const { theme, problems } = makeColors({
  label: 'Beach sunset',
  only: 'dark',
  roles: { accent: '#f39a3d', danger: '#e5484d', success: '#5fae7a', warning: '#e8c24a', pro: '#5aa9e6' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0d1b2e',
        'surface-1': '#12233a',
        'surface-2': '#172b45',
        'surface-3': '#192e49',
        'text-primary': '#f6efe0',
        'text-secondary': '#d3d8de',
        'text-muted': '#a4afbb',
      },
    },
  },
})

// "glass" is how the app tints its panels (the chat box is one) over the drawing.
// blur is 0, so the drawing stays sharp behind them.
// opacity is how solid the navy tint is: lower shows more of the drawing.
const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE, glass: { blur: 0, tint: '#0d1b2e', opacity: 0.45 } },
}

// The same look, with the picture's name written a second time as `id`.
// Why: engines differ in the label they use for a backdrop picture's name. Anthropic's
// theme-examples plugin says in its code that the newest engines read `scene` and the ones
// before them read `id`, and that an engine drops the label it does not know. Giving both lets
// one theme work on both. The type has no `id`, so this is cast.
// Not checked here: an engine that reads `id`. This was only run on one that reads `scene`.
const LOOK_BOTH_LABELS = { ...LOOK, backdrop: { ...LOOK.backdrop, id: SCENE } } as unknown as ThemeSetArgs

// The picture's name as the engine hands it to the Backdrop hook: under `scene` or, on the
// engines that use the other label, under `id`.
function sceneNameOf(props: unknown): unknown {
  const named = props as { scene?: unknown; id?: unknown }

  return typeof named.scene === 'string' ? named.scene : named.id
}

// Each of Claude's replies sits in a rounded box. The fill is navy at about 70% solid
// (the last two hex digits, b3), so the drawing shows through a little.
// A Box has no blur setting, so the drawing behind a reply is not blurred.
const BOX_FILL = '#0d1b2eb3'
const BOX_EDGE = '#4d6f99'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Desktop ignores the whole theme if this line exists, so show it.
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    // First with both labels. If this engine refuses the extra label, set it again without.
    let set: Awaited<ReturnType<typeof $.theme.set>>

    try {
      set = await $.theme.set(LOOK_BOTH_LABELS)
    } catch {
      set = await $.theme.set(LOOK)
    }

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    return next(e)
  })

  // Draws the picture behind the conversation. Only the desktop and mobile apps have a backdrop.
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || sceneNameOf(e.props) !== SCENE) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    // isInteractive makes the desktop app draw the picture in a small sandboxed frame, not as an image.
    // The picture moves (see paint.js), and the mod guide draws its own moving scene with isInteractive.
    // What was seen on one Mac (desktop app 5.11492.5):
    // - 2026-11-15: loaded as a session mod, nothing moved. A test card in the picture showed the
    //   <animate> tags gone and CSS animation forced off. A tiny test picture and one of Anthropic's
    //   own animated example scenes, drawn through this mod, stood still too.
    // - 2026-11-16: installed as a plugin, after a restart of the app, it moves. It stops moving
    //   when Claude makes a reply, and moves again on coming back to the thread.
    //   Later the same day, with no change that explains it, it moved all the time.
    // Why it stopped before is not known.
    return (
      <Svg
        source={PAINTING}
        alt="A colored-pencil sunset over a tropical island bay, with mountains and palm trees on both sides"
        isInteractive
      />
    )
  })

  // A box around each of Claude's replies. The person's own messages get none:
  // the app already draws them in a bubble. Desktop only: the terminal has no
  // backdrop, so it keeps its plain rows.
  // There are two boxes. The outer one has no look of its own: it only lines the inner one
  // up at the left, so the inner box is as wide as the reply's text and no wider.
  // The inner one is the box you see. paddingX is the room left and right of the text,
  // in character cells.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Box borderStyle="round" borderColor={BOX_EDGE} backgroundColor={BOX_FILL} paddingX={3}>
          {await next(e)}
        </Box>
      </Box>
    )
  })
}
