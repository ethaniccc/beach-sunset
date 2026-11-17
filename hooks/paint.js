// Draws a sunset seen from the beach of a tropical island bay, and returns it as one SVG string.
// Mountains stand on the left and right, with sand and palm trees at their feet.
// The sun has just set over open sea between them, and the first stars are out.
//
// The style is colored pencil on rough paper. Nothing is filled in smoothly.
// Every area starts as a flat wash, a bit paler than its color, then gets covered in
// wide pencil strokes of nearby colors. Filters scratch fine gaps into the strokes, so the wash
// shows through, the way paper shows through real pencil. The same filters bend
// the strokes a little, so no line is ruler-straight.
// On top go a few crisp details: foam, palms and grass.
//
// A fixed seed drives the random numbers, so the drawing is the same on every load.
// All sizes are in the 1600 x 1000 drawing box.
//
// Parts of the drawing move, the way hand-drawn film does. Nothing glides: each thing
// jumps from one held drawing to the next. The water rocks. The path of light on it is
// "redrawn" a few times a second (the gaps in its marks change), so it sparkles.
// The stars blink, the clouds drift across the sky and slowly change shape,
// the lines of the sky shift very slightly, and the palms, grass and foam sway.
// The sand, the mountains and the plants on them do not move at all.
// It uses no script: only SMIL <animate> tags and CSS animations inside the SVG.
// The desktop app can stop the movement by itself: its code takes <animate> tags out
// and switches CSS animation off when it decides the picture should stay still.

const W = 1600
const H = 1000
const HORIZON = 560 // y of the line where sky meets sea
const SUN_X = 640
const SUN_Y = 572 // the sun has just set: the middle of its glow is a little below the horizon
const TRUNK = '#5c3a24' // palm trunks
const LEAF = '#113c2b' // palm fronds, bushes, and the shrubs and grass on the mountains, where they are in shade
const LEAF_LIT = '#32653a' // the same leaves where the light falls on them
const PALE = '#bda66e' // dune grass that still catches a little light
const PAPER = [243, 234, 214] // the warm off-white of the paper

// One frame of the film, in seconds. Every drawing is held for 3 frames or a multiple
// of 3, so each moving thing changes at most 5 times a second.
// The SMIL moves and the CSS moves run on two clocks that may be out of step, so the
// picture as a whole can change up to 10 times a second.
const FRAME = 1 / 15

// A SMIL tag that makes one number of a filter step jump through `values`, forever.
// It goes inside that step's tag. `name` is the number's attribute name.
// Each value is held for `frames` frames.
const jump = (name, values, frames) =>
  `<animate attributeName="${name}" values="${values.join(';')}" dur="${(values.length * frames * FRAME).toFixed(3)}s" calcMode="discrete" repeatCount="indefinite"/>`

// Sky colors from the top of the picture (0) down to the horizon (1).
// It is the end of the sunset: almost all of the sky is dark blue, and the last
// orange light is a thin band on the horizon.
const SKY = [
  [0, '#060c22'],
  [0.3, '#0c1838'],
  [0.52, '#182a55'],
  [0.68, '#3a3f66'],
  [0.79, '#8c5350'],
  [0.88, '#d46a3a'],
  [0.95, '#ee8a3c'],
  [1, '#f6a54a'],
]

// Sea colors from the horizon (0) down to the bottom of the picture (1).
const SEA = [
  [0, '#7a6878'],
  [0.12, '#2c4670'],
  [0.5, '#142a52'],
  [1, '#0b1a38'],
]

// Sand colors from the horizon line (0) down to the bottom of the picture (1).
// The far sand on the two sides still holds some light. The sand at our feet is nearly black.
const SAND = [
  [0, '#94765a'],
  [0.3, '#7c5d45'],
  [0.56, '#5c4133'],
  [0.78, '#3b2924'],
  [1, '#1a1318'],
]

// Each cloud is [center x, center y, width, height].
// One less than 20 high is drawn as a thin streak, the others as puffy clouds.
const CLOUDS = [
  [1080, 128, 640, 78],
  [290, 190, 500, 62],
  [835, 296, 400, 44],
  [1345, 322, 300, 34],
  [410, 330, 240, 28],
  [450, 455, 330, 16],
  [960, 480, 420, 14],
  [700, 508, 260, 11],
]

// More clouds, in the same form, that start out of sight to the left of the picture
// (their center x is below 0) and drift in later. The further left, the later.
const INCOMING = [
  [-250, 235, 420, 50],
  [-560, 112, 380, 56],
  [-380, 420, 300, 15],
]
const ALL_CLOUDS = [...CLOUDS, ...INCOMING]

// How far past the left edge a cloud's trip across the sky starts. A cloud that has
// left on the right stays out of sight for this stretch before it comes back in.
const LEAD = 700

// A small seeded random number maker (mulberry32). Returns numbers from 0 up to 1.
function makeRandom(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const toHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
// The wash under an area: its color with a little paper mixed in, so it is a bit paler.
const wash = rgb => toHex(mix(rgb, PAPER, 0.14))

// The color at position t (0 to 1) along a list of [position, hex] stops.
function ramp(stops, t) {
  const at = clamp(t, 0, 1)
  for (let i = 1; i < stops.length; i++) {
    if (at <= stops[i][0]) {
      const [p0, c0] = stops[i - 1]
      const [p1, c1] = stops[i]
      return mix(toRgb(c0), toRgb(c1), (at - p0) / (p1 - p0))
    }
  }
  return toRgb(stops[stops.length - 1][1])
}

const points = list => list.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L')

// The point a share t (0 to 1) of the way along a list of points.
function along(list, t) {
  const at = clamp(t, 0, 1) * (list.length - 1)
  const i = Math.min(Math.floor(at), list.length - 2)
  return [0, 1].map(k => list[i][k] + (list[i + 1][k] - list[i][k]) * (at - i))
}

// A smooth line through the points of `list`, given back as many close points
// (a Catmull-Rom spline). `steps` is how many points it makes for each gap in the list.
function curve(list, steps) {
  const out = []
  for (let i = 0; i < list.length - 1; i++) {
    const p0 = list[Math.max(i - 1, 0)]
    const p1 = list[i]
    const p2 = list[i + 1]
    const p3 = list[Math.min(i + 2, list.length - 1)]
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      out.push([0, 1].map(a => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t ** 3)))
    }
  }
  out.push(list[list.length - 1])
  return out
}

// The same line with small bumps up and down, up to about 1.6 x `size`, for a rocky skyline.
// The two ends stay where they are.
const rugged = (list, size) =>
  list.map(([x, y], i) => [x, y + size * Math.sin((Math.PI * i) / (list.length - 1)) * (Math.sin(x / 29 + 1) + 0.6 * Math.sin(x / 11 + 2))])

// For each point of a line: the direction square to the line, on the right-hand side
// as you walk along it. Each is [x, y] with length 1.
const sideways = list =>
  list.map((_, i) => {
    const [ax, ay] = list[Math.max(i - 1, 0)]
    const [bx, by] = list[Math.min(i + 1, list.length - 1)]
    const len = Math.hypot(bx - ax, by - ay)
    return [-(by - ay) / len, (bx - ax) / len]
  })

// How near a height y is to us: 0 at the horizon, 1 at the bottom of the picture.
const nearness = y => clamp((y - HORIZON) / (H - HORIZON), 0, 1)

// The water's edge of the whole bay, as one line of close points.
// It starts at the far tip of the left side, comes toward us, crosses in front of us
// from left to right, and runs back out to the far tip of the right side.
// First a smooth line, then each point is pushed in or out a little, more the nearer it is,
// so the edge has the uneven lobes that waves leave.
const SMOOTH_SHORE = curve(
  [
    [462, 561], [395, 569], [322, 584], [250, 604], [185, 632], [132, 668], [100, 712], [118, 754], [190, 790],
    [310, 812], [470, 826], [640, 824], [800, 832], [960, 822], [1120, 818], [1280, 800], [1400, 776],
    [1482, 744], [1506, 704], [1478, 662], [1422, 630], [1350, 604], [1278, 584], [1205, 569], [1128, 563], [1052, 561],
  ],
  6,
)
const SHORE = SMOOTH_SHORE.map(([x, y], i) => {
  const [sx, sy] = sideways(SMOOTH_SHORE)[i]
  const push = nearness(y) * (12 * Math.sin(i * 0.21 + 0.5) + 7 * Math.sin(i * 0.47 + 2))
  return [x + sx * push, y + sy * push]
})

// For each SHORE point: the direction that points away from the water, onto the sand.
const SHORE_OUT = sideways(SHORE)

// The SHORE point nearest to (x, y): `i` is its place in SHORE, `far` is how far away it is.
function nearShore(x, y) {
  let i = 0
  let far = Infinity
  SHORE.forEach(([sx, sy], at) => {
    const d = Math.hypot(x - sx, y - sy)
    if (d < far) {
      far = d
      i = at
    }
  })
  return { i, far }
}

// y of the water's edge in front of us, at x. Where SHORE passes x more than once, this is the lowest pass.
function frontY(x) {
  let y = HORIZON
  for (let i = 1; i < SHORE.length; i++) {
    const [ax, ay] = SHORE[i - 1]
    const [bx, by] = SHORE[i]
    if ((ax - x) * (bx - x) <= 0 && ax !== bx) {
      y = Math.max(y, ay + ((by - ay) * (x - ax)) / (bx - ax))
    }
  }
  return y
}

// The two near mountains. `ridge` is the skyline, from the peak at the edge of the picture
// down to the tip of the land. `foot` is where the mountain meets the sand, from that tip
// back out to the edge of the picture.
// `lean` is how the slope runs: 1 falls to the right, -1 falls to the left.
const SIDES = [
  {
    lean: 1,
    ridge: rugged(curve([[-30, 250], [60, 215], [130, 262], [215, 345], [290, 415], [350, 492], [410, 538], [440, 556]], 5), 5),
    foot: [[440, 556], [300, 562], [150, 572], [-30, 585]],
  },
  {
    lean: -1,
    ridge: rugged(curve([[1630, 150], [1510, 172], [1430, 240], [1340, 300], [1270, 390], [1190, 455], [1120, 525], [1075, 556]], 5), 5),
    foot: [[1075, 556], [1230, 562], [1430, 573], [1630, 586]],
  },
]

// Two more mountains, further away, in a hazy blue-green.
// `base` is the x where each one's flat bottom starts, on the horizon.
// The near mountains hide most of them.
const FAR = [
  { lean: 1, ridge: rugged(curve([[150, 420], [290, 372], [390, 432], [470, 505], [550, 560]], 5), 3), base: 150 },
  { lean: -1, ridge: rugged(curve([[1440, 340], [1300, 352], [1180, 338], [1090, 420], [1000, 500], [925, 560]], 5), 3), base: 1440 },
]

// All the sand as one shape: under both mountains, around the bay, and down to the bottom of the picture.
const SAND_SHAPE = [...[...SIDES[0].foot].reverse(), ...SHORE, ...SIDES[1].foot, [W + 30, H + 10], [-30, H + 10]]

// Whether the point (x, y) is inside the shape with these corners.
function isInside(corners, x, y) {
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i]
    const [xj, yj] = corners[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// A patch of pencil: n strokes of one color, scattered around the point (cx, cy)
// by up to spreadX and spreadY. Each stroke is about `len` long.
// The strokes belong in a shade() group turned by `angle` degrees. Inside such a
// group every stroke is level, so each point is first turned back the other way.
// It gives back one <path>. Or pass `piles` (see pile() below): then the strokes are
// added to the pile of their color, rounded to steps of 8, and nothing is given back.
// Sharing paths that way keeps a big area small.
function patch(rand, angle, rgb, n, cx, cy, spreadX, spreadY, len, piles) {
  const turn = (-angle * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  let d = ''
  for (let i = 0; i < n; i++) {
    const dx = cx + (rand() - 0.5) * 2 * spreadX - W / 2
    const dy = cy + (rand() - 0.5) * 2 * spreadY - H / 2
    const run = len * (0.6 + rand() * 0.8)
    d += `M${Math.round(W / 2 + dx * cos - dy * sin - run / 2)} ${Math.round(H / 2 + dx * sin + dy * cos)}h${Math.round(run)}`
  }
  if (piles) {
    pile(piles, toHex(rgb.map(v => Math.round(v / 8) * 8)), d)
    return ''
  }
  return `<path d="${d}" stroke="${toHex(rgb)}"/>`
}

// One area's pencil shading: patches whose strokes all run at `angle` degrees
// (0 is level, negative climbs to the right) and are `width` wide.
// `filter` names the filter that roughens the strokes ("pencil", "air" or "ripple", set up in paintSunset).
// `clip` names a clip that keeps the strokes inside the area. Leave it out for none.
function shade(angle, width, body, filter, clip) {
  const strokes = `<g transform="rotate(${angle} ${W / 2} ${H / 2})" fill="none" stroke-linecap="round" stroke-width="${width}" filter="url(#${filter})" opacity=".9">${body}</g>`
  return clip ? `<g clip-path="url(#${clip})">${strokes}</g>` : strokes
}

// Adds one stroke's path text to a pile. A pile maps a key (a color, or anything
// else the strokes share) to the path text of every stroke with that key,
// so each key becomes one <path> and the picture stays small.
const pile = (piles, key, d) => piles.set(key, (piles.get(key) ?? '') + d)

// A group of crisp lines, drawn last with a sharp pencil.
const crisp = inner => `<g fill="none" stroke-linecap="round">${inner}</g>`

// n straight lines as one path string.
// place() gives each line its start (x, y) and its run (dx, dy).
function lines(n, place) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const { x, y, dx, dy = 0 } = place()
    d += `M${Math.round(x)} ${Math.round(y)}l${Math.round(dx)} ${Math.round(dy)}`
  }
  return d
}

// The color of the sky at a point. It turns orange around the place where the sun
// went down, and gold right at that place. A soft glow is laid over this in paintSunset.
function skyColor(x, y) {
  const fromSun = Math.hypot(x - SUN_X, y - SUN_Y)
  const glowing = mix(ramp(SKY, y / HORIZON), toRgb('#ff9440'), 0.75 * Math.exp(-((fromSun / 260) ** 2)))
  return mix(glowing, toRgb('#ffd184'), 0.8 * Math.exp(-((fromSun / 90) ** 2)))
}

// The first stars: small pale dots in the top part of the sky, most of them high up.
// They use their own random numbers (from `seed`), so they do not move anything else in the drawing.
// They sit in three groups that blink at different speeds (the "st" classes in paintSunset).
function drawStars(seed) {
  const rand = makeRandom(seed)
  // A zero-length line with round ends draws a dot. groups[2] holds the big stars,
  // groups[0] and groups[1] share the small ones.
  const groups = ['', '', '']
  for (let i = 0; i < 46; i++) {
    groups[rand() < 0.3 ? 2 : i % 2] += `M${Math.round(rand() * W)} ${Math.round(340 * rand() ** 1.6)}h0`
  }
  return (
    `<g fill="none" stroke="#fdf3d0" stroke-linecap="round" opacity=".8"><path class="st" d="${groups[0]}" stroke-width="2"/>` +
    `<path class="st s2" d="${groups[1]}" stroke-width="2.3"/><path class="st s3" d="${groups[2]}" stroke-width="3.4"/></g>`
  )
}

function drawSky(rand) {
  const ANGLE = -14
  const piles = new Map()
  for (let row = 0; row < 23; row++) {
    for (let col = 0; col < 10; col++) {
      const x = (col + rand()) * (W / 10)
      const y = -20 + (row + rand()) * 26
      // Patches near the sun are small, so its glow keeps a round shape.
      const size = Math.hypot(x - SUN_X, y - SUN_Y) < 230 ? 0.35 : 1
      // Each patch takes its color from a little higher or lower in the sky.
      // That is what blends one band of color into the next.
      patch(rand, ANGLE, skyColor(x, y + (rand() - 0.5) * 44 * size), 6, x, y, 170 * size, 14, 200 * size, piles)
    }
  }
  // Extra small patches on the sun itself.
  for (let i = 0; i < 16; i++) {
    const far = 100 * Math.sqrt(rand())
    const angle = rand() * 2 * Math.PI
    const x = SUN_X + Math.cos(angle) * far
    const y = SUN_Y + Math.sin(angle) * far
    patch(rand, ANGLE, skyColor(x, y), 4, x, y, 30, 8, 70, piles)
  }
  let body = ''
  for (const [color, d] of piles) {
    body += `<path d="${d}" stroke="${color}"/>`
  }
  return shade(ANGLE, 10, body, 'air')
}

// The CSS that makes each cloud drift to the right, as text for a <style> tag.
// Every cloud makes the same kind of trip, again and again: it starts out of sight,
// LEAD past the left edge, crosses the picture, and ends just out of sight on the right.
// At the start of the film each cloud is part way through its trip: at the place where
// it is drawn. So the clouds in INCOMING are still on their way in.
// High clouds move fastest (about 3.5 a second, in the drawing's units) and clouds near the
// horizon slowest (about 1.5 a second), because those are further away.
// Cloud k (its place in ALL_CLOUDS) gets the class "c" + k. All classes share the keyframes "dr",
// which slide from --a to --b: the two ends of the trip, measured from where the cloud is drawn.
// Each jump lasts 0.2 seconds (3 frames), like the other CSS moves.
function cloudMoves() {
  let css = '@keyframes dr{from{transform:translate(var(--a))}to{transform:translate(var(--b))}}'
  for (const [k, [cx, cy, w]] of ALL_CLOUDS.entries()) {
    const speed = 1 + 2.6 * (1 - (cy / HORIZON) ** 2)
    // The trip ends with the whole cloud 60 past the right edge.
    const from = -(cx + w / 2 + LEAD)
    const trip = W + w + LEAD + 60
    const jumps = Math.round(trip / speed / 0.2)
    // A negative delay starts the cloud part way through its trip.
    const delay = Math.round((-from / trip) * jumps) * 0.2
    css += `.c${k}{animation:dr ${(jumps * 0.2).toFixed(1)}s steps(${jumps}) -${delay.toFixed(1)}s infinite;--a:${Math.round(from)}px;--b:${Math.round(from + trip)}px}`
  }
  return css
}

// The clouds. A puffy cloud is a body shaped like a lens (fat in the middle, pointed
// at both ends) with round puffs of three sizes crowded on top of it, so it is one
// solid shape with no sky showing through. A streak is only the lens.
// Each cloud is drawn in four layers, from the bottom up: a bright one, a dimmer one,
// then two dark ones for the whole cloud.
// The two lower layers are the lens alone with a deeper belly, so they show underneath
// as a lit edge that is thick in the middle and thins out to nothing at the ends.
// The clouds are dark, because the sky behind them is nearly dark. Only their undersides
// still catch light from the sun below the horizon: orange for clouds near the horizon,
// a dull pink-purple for the high ones.
// Each cloud drifts to the right on its own (see cloudMoves). As it moves, the filters bend
// a different part of it, so its outline slowly changes shape too. The filters also make
// the outlines swell and shrink a little all the time.
// Two filters (set up in paintSunset) bend the outlines the same way: "cloud" for the
// three lower layers, and "puff" for the top, which also gets paper grain. The grain
// shows the dark layer under it, not the sky.
function drawClouds(rand, late) {
  let under = ''
  let top = ''
  for (const [k, [cx, cy, w, h]] of ALL_CLOUDS.entries()) {
    // The clouds in INCOMING take their random numbers from `late`, so adding one does not change the rest of the drawing.
    const roll = k < CLOUDS.length ? rand : late
    const isStreak = h < 20
    const low = (cy / HORIZON) ** 2 // 0 for a cloud at the top of the sky, 1 at the horizon
    // The cloud bends: its ends sit `sag` lower than its middle, and one end `tilt` above the other.
    // A puffy cloud always droops at the ends, like a dome. A streak can bend either way.
    const sag = isStreak ? (roll() - 0.5) * h * 1.2 : (0.05 + roll() * 0.45) * h
    const tilt = (roll() - 0.5) * h * 0.8
    const baseY = u => cy + sag * u * u + tilt * u // u runs from -1 (left end) to 1 (right end)
    const lift = isStreak ? 1.9 : 0.85 // how far the top of the lens bulges, as a share of h
    const skew = (roll() - 0.5) * w * 0.3 // moves the fattest part left or right of the middle
    // The lens. `belly` is how far its underside bulges, as a share of h.
    // The underside starts from a line a bit above the two ends, so it stays close to flat.
    const lens = belly =>
      `M${Math.round(cx - w / 2)} ${Math.round(baseY(-1))}Q${Math.round(cx + skew)} ${Math.round(baseY(0) - h * lift)} ${Math.round(cx + w / 2)} ${Math.round(baseY(1))}` +
      `Q${Math.round(cx - skew)} ${Math.round(baseY(0) + sag * 0.7 + h * belly)} ${Math.round(cx - w / 2)} ${Math.round(baseY(-1))}`

    // A zero-length line with round ends draws a dot as wide as the stroke. Each dot is a puff.
    // Puffs are biggest near the middle of the cloud and close enough to overlap.
    // sizes[k] is the path text of all puffs of size k.
    const WIDE = [0.5, 0.78, 1.08] // how wide a puff of each size is, as a share of h
    const sizes = ['', '', '']
    const count = isStreak ? 0 : clamp(Math.round(w / (h * 1.1)), 5, 9)
    for (let i = 0; i < count; i++) {
      const u = ((i + 0.15 + roll() * 0.7) / count) * 2 - 1
      const size = Math.min(2, Math.floor((1 - 0.85 * u * u) * (0.8 + roll() * 2.6)))
      sizes[size] += `M${Math.round(cx + u * w * 0.31)} ${Math.round(baseY(u * 0.62) - h * WIDE[size] * (0.12 + roll() * 0.26))}h0`
    }
    const puffs = sizes.map((d, size) => d && `<path d="${d}" fill="none" stroke-width="${(h * WIDE[size]).toFixed(1)}"/>`).join('')
    const shade = (color, belly) => `<path d="${lens(belly)}" fill="${toHex(color)}"/>`
    const whole = color => `<g fill="${toHex(color)}" stroke="${toHex(color)}"><path d="${lens(lift * 0.5)}" stroke="none"/>${puffs}</g>`

    // Class "c" + k makes both halves of cloud k drift together.
    under +=
      `<g class="c${k}">` +
      shade(mix(toRgb('#8e5a78'), toRgb('#f08a44'), low), lift * 0.5 + (isStreak ? 0.9 : 0.42)) +
      shade(mix(toRgb('#6a4a6e'), toRgb('#c2553f'), low), lift * 0.5 + (isStreak ? 0.5 : 0.24)) +
      whole(mix(toRgb('#3c4670'), toRgb('#6b4a5c'), low)) +
      '</g>'
    top += `<g class="c${k}">${whole(mix(toRgb('#2c3558'), toRgb('#54405a'), low))}</g>`
  }
  return `<g stroke-linecap="round"><g filter="url(#cloud)">${under}</g><g filter="url(#puff)" transform="translate(0 -2)">${top}</g></g>`
}

// One mountain: a pale wash, then pencil strokes that run down its slope.
// `corners` is its outline and `id` names its clip. `pick(x)` gives the color of a patch at that x.
// With `isGrassy` it also gets plants: round shrubs (a dark dot with a smaller lit dot
// on its upper left) and tufts of grass (two or three short blades from one point).
function drawMountain(rand, { color, lean, corners, width, pick, isGrassy }, id) {
  const ANGLE = lean * 35
  const xs = corners.map(p => p[0])
  const ys = corners.map(p => p[1])
  const left = Math.max(-40, Math.min(...xs))
  const right = Math.min(W + 40, Math.max(...xs))
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)

  let body = ''
  for (let y = top; y < bottom; y += 24) {
    for (let x = left; x < right; x += 80) {
      const px = x + rand() * 80
      const py = y + rand() * 24
      if (isInside(corners, px, py)) {
        body += patch(rand, ANGLE, pick(px), 4, px, py, 50, 12, 90)
      }
    }
  }

  let plants = ''
  if (isGrassy) {
    // Path text for: big shrubs, small shrubs, their lit dots, dark blades, light blades.
    const marks = { big: '', small: '', bigLit: '', smallLit: '', dark: '', light: '' }
    for (let n = 0; n < 105; n++) {
      const x = left + rand() * (right - left)
      const y = top + rand() * (bottom - top)
      if (!isInside(corners, x, y)) {
        continue
      }
      if (rand() < 0.2) {
        const kind = rand() < 0.4 ? 'big' : 'small'
        const size = kind === 'big' ? 26 : 16
        marks[kind] += `M${Math.round(x)} ${Math.round(y)}h0`
        marks[kind + 'Lit'] += `M${Math.round(x - size * 0.16)} ${Math.round(y - size * 0.2)}h0`
      } else {
        const tall = 7 + rand() * 8
        const kind = rand() < 0.5 ? 'dark' : 'light'
        for (const sway of rand() < 0.5 ? [-0.4, 0.35] : [-0.5, 0.05, 0.5]) {
          marks[kind] += `M${Math.round(x)} ${Math.round(y)}l${Math.round(sway * tall)} ${Math.round(-tall * (1 - Math.abs(sway) * 0.4))}`
        }
      }
    }
    plants =
      `<g clip-path="url(#${id})" fill="none" stroke-linecap="round"><g filter="url(#froth)">` +
      `<path d="${marks.big}" stroke="${LEAF}" stroke-width="26"/><path d="${marks.small}" stroke="${LEAF}" stroke-width="16"/>` +
      `<path d="${marks.bigLit}" stroke="${LEAF_LIT}" stroke-width="13" opacity=".8"/><path d="${marks.smallLit}" stroke="${LEAF_LIT}" stroke-width="8" opacity=".8"/></g>` +
      `<path d="${marks.dark}" stroke="${LEAF}" stroke-width="2"/><path d="${marks.light}" stroke="#4a7840" stroke-width="2" opacity=".8"/></g>`
  }
  const shape = `M${points(corners)}Z`
  return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${wash(toRgb(color))}"/>` + shade(ANGLE, width, body, 'pencil', id) + plants
}

// The color of the sea at a point. Near the horizon, under the last light, it glows orange.
// Close to any sand it turns a lighter blue-green, where the water is shallow.
function seaColor(x, y) {
  const glare = Math.exp(-(((x - SUN_X) / 330) ** 2)) * Math.exp(-(((y - HORIZON) / 60) ** 2))
  const deep = mix(ramp(SEA, (y - HORIZON) / (H - HORIZON)), toRgb('#ff9a50'), 0.75 * glare)
  return mix(deep, toRgb('#5c8a98'), 0.35 * Math.exp(-nearShore(x, y).far / (12 + 50 * nearness(y))))
}

// The sea's shading: level strokes, short near the horizon and long near the beach.
// The "ripple" filter bends them into gentle waves.
function drawSea(rand) {
  let body = ''
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 10; col++) {
      const x = (col + rand()) * (W / 10)
      const y = HORIZON + 6 + (row + rand()) * 18
      const near = nearness(y)
      body += patch(rand, 0, seaColor(x, y + (rand() - 0.5) * 30), 6, x, y, 150 * (0.5 + near), 8, 110 * (0.5 + near * 2))
    }
  }
  return shade(0, 6, body, 'ripple', 'sea')
}

// The path of sunlight on the water: many small curved marks, like the tops of little waves.
// The path is thin at the horizon and spreads out toward the beach. Its middle is
// gold, then orange, with a darker orange at the edges. Marks get longer and fatter as they come nearer.
function drawReflection(rand) {
  const bell = () => (rand() + rand() + rand()) / 1.5 - 1
  const foot = frontY(SUN_X)
  const piles = new Map()
  for (let i = 0; i < 160; i++) {
    const t = rand() ** 0.8 // 0 at the horizon, 1 at the beach
    const half = 12 + t * 115 // half the width of the path at this height
    const off = bell() * half
    const fromMiddle = Math.abs(off) / half
    const color = fromMiddle < 0.22 ? '#ffd596' : fromMiddle < 0.5 ? '#f79a48' : '#d4602f'
    const width = t < 0.3 ? 2 : t < 0.65 ? 3.5 : 5
    const len = (5 + t * 40) * (0.5 + rand())
    // Each mark bows up or down in the middle, and its far end sits a touch higher or lower.
    const bow = (rand() < 0.5 ? -1 : 1) * (1 + t * 5 * rand())
    const d = `M${Math.round(SUN_X + off - len / 2)} ${Math.round(HORIZON + 3 + t * (foot - HORIZON - 10))}q${Math.round(len / 2)} ${bow.toFixed(1)} ${Math.round(len)} ${((rand() - 0.5) * 4 * t).toFixed(1)}`
    pile(piles, `stroke="${color}" stroke-width="${width}"`, d)
  }
  let out = ''
  for (const [look, d] of piles) {
    out += `<path d="${d}" ${look}/>`
  }
  return `<g fill="none" stroke-linecap="round" filter="url(#glitter)" opacity=".95">${out}</g>`
}

// A simple palm: one curved brown line for the trunk and six green arcs for the fronds.
// (x, y) is its base and h its height. lean bends it: positive to the right.
// A thin warm line on the trunk, on the side toward the sun, is the last light catching it.
// Each frond is drawn twice: wide in dark green, then thin in light green a little higher,
// as the lit top of the leaf.
function drawPalm(rand, x, y, h, lean) {
  const top = [x + lean * h * 0.3, y - h]
  const trunk = `M${Math.round(x)} ${Math.round(y)}Q${Math.round(x + lean * h * 0.02)} ${Math.round(y - h * 0.55)} ${Math.round(top[0])} ${Math.round(top[1])}`
  let fronds = ''
  for (const degrees of [-165, -130, -95, -55, -20, 15]) {
    const angle = ((degrees + (rand() - 0.5) * 20) * Math.PI) / 180
    const len = h * 0.42 * (0.85 + rand() * 0.3)
    const reach = [Math.cos(angle) * len, Math.sin(angle) * len]
    // Each frond lifts first, then droops at its end.
    fronds += `M${Math.round(top[0])} ${Math.round(top[1])}q${Math.round(reach[0] * 0.5)} ${Math.round(reach[1] * 0.5 - len * 0.25)} ${Math.round(reach[0])} ${Math.round(reach[1] + len * 0.35)}`
  }
  const lit = Math.sign(SUN_X - x) * h * 0.014
  return (
    `<path d="${trunk}" stroke="${TRUNK}" stroke-width="${(h * 0.05).toFixed(1)}"/>` +
    `<path d="${trunk}" stroke="#d98a50" stroke-width="${(h * 0.014).toFixed(1)}" opacity=".7" transform="translate(${lit.toFixed(1)} 0)"/>` +
    // The fronds rock a little around the top of the trunk (the "pm" classes in paintSunset).
    // Palms do not all rock together: where a palm stands picks one of three timings.
    `<g class="pm${['', ' p1', ' p2'][Math.round(Math.abs(x)) % 3]}" style="transform-origin:${Math.round(top[0])}px ${Math.round(top[1])}px">` +
    `<path d="${fronds}" stroke="${LEAF}" stroke-width="${(h * 0.06).toFixed(1)}"/>` +
    `<path d="${fronds}" stroke="${LEAF_LIT}" stroke-width="${(h * 0.02).toFixed(1)}" transform="translate(0 ${(-h * 0.014).toFixed(1)})"/></g>`
  )
}

// The plants on one side of the bay: a band of green bushes at the mountain's foot,
// and four palms that shrink with distance.
function drawSide(rand, { lean, foot }) {
  // Bushes: short fat lines along the foot of the mountain, bigger as they come nearer.
  // Each of the four zones along the foot gets fat dark green lines low down and thinner,
  // lighter green ones a bit higher, so the top of the band is bumpy and looks lit.
  let bushes = ''
  for (let zone = 0; zone < 4; zone++) {
    const fat = 9 + zone * 8
    for (const [width, rise, color] of [[fat, 0, LEAF], [fat * 0.6, fat * 0.45, '#1f4f33']]) {
      const d = lines(7, () => {
        const [x, y] = along(foot, (zone + rand()) / 4)
        const len = (6 + rand() * 22) * (0.4 + zone * 0.3)
        return { x: x - len / 2, y: y - 4 - zone * 3 - rise + (rand() - 0.5) * fat * 0.5, dx: len, dy: (rand() - 0.5) * 6 }
      })
      bushes += `<path d="${d}" stroke="${color}" stroke-width="${width.toFixed(1)}"/>`
    }
  }
  let palms = ''
  for (const t of [0.24, 0.42, 0.6, 0.78]) {
    const [x, y] = along(foot, t)
    palms += drawPalm(rand, x + (rand() - 0.5) * 16, y + 4 + t * 8, 34 + 120 * t, lean * (0.2 + rand() * 0.6))
  }
  return crisp(bushes + palms)
}

// The color of the sand at a point. `far` is how far the point is from the water's edge.
// Sand close to the water is wet: darker, and under the last light it shines orange.
function sandColor(x, y, far) {
  const near = nearness(y)
  const dry = ramp(SAND, near)
  const wet = mix(dry, toRgb('#4a2f2a'), 0.45 * Math.exp(-far / (6 + 40 * near)))
  const shine = Math.exp(-(((x - SUN_X) / (110 + far * 0.9)) ** 2)) * Math.exp(-far / 150) * (x > 150 && x < 1450 ? 1 : 0)
  return mix(wet, toRgb('#f09450'), 0.75 * shine * near)
}

// All the sand: a pale wash, then pencil strokes that follow the curve of the water's edge,
// the way the sea leaves lines on a beach. Strokes are small on the far sides and big at our feet.
function drawSand(rand) {
  // The direction the water's edge runs at SHORE point i, as [x, y] with length 1.
  const run = i => {
    const [ox, oy] = SHORE_OUT[clamp(i, 0, SHORE.length - 1)]
    return [oy, -ox]
  }
  // One stroke, `len` long, with its middle at (x, y). It bends the way the water's edge bends near SHORE point i.
  const stroke = (x, y, i, len) => {
    const [ax, ay] = run(i - 2)
    const [bx, by] = run(i + 2)
    const half = len / 2
    return `M${Math.round(x - ax * half)} ${Math.round(y - ay * half)}q${Math.round(ax * half)} ${Math.round(ay * half)} ${Math.round((ax + bx) * half)} ${Math.round((ay + by) * half)}`
  }

  // Three bands, from the far sand to the sand at our feet: [top y, bottom y, tries, stroke width].
  // A try only becomes a stroke if its random point lands on sand.
  let body = ''
  for (const [top, bottom, tries, width] of [[HORIZON - 6, 700, 1200, 6], [700, 840, 490, 10], [840, H, 290, 14]]) {
    const piles = new Map()
    for (let n = 0; n < tries; n++) {
      const x = -20 + rand() * (W + 40)
      const y = top + rand() * (bottom - top)
      if (!isInside(SAND_SHAPE, x, y)) {
        continue
      }
      const { i, far } = nearShore(x, y)
      const plain = sandColor(x, y + (rand() - 0.5) * 40, far)
      // Three sand pencils: plain, a cool dark one for shadow, and orange for warm light.
      const choice = rand()
      const color = choice < 0.62 ? plain : choice < 0.8 ? mix(plain, toRgb('#1a1836'), 0.35) : mix(plain, toRgb('#d9783a'), 0.3)
      // Colors are rounded to steps of 16, so many strokes share one path.
      pile(piles, toHex(color.map(v => Math.round(v / 16) * 16)), stroke(x, y, i, (24 + 130 * nearness(y)) * (0.6 + rand() * 0.8)))
    }
    let paths = ''
    for (const [color, d] of piles) {
      paths += `<path d="${d}" stroke="${color}"/>`
    }
    body += `<g stroke-width="${width}">${paths}</g>`
  }
  const shape = `M${points(SAND_SHAPE)}Z`
  return (
    `<clipPath id="beach"><path d="${shape}"/></clipPath><path d="${shape}" fill="url(#sand)"/>` +
    `<g clip-path="url(#beach)"><g fill="none" stroke-linecap="round" filter="url(#grain)" opacity=".92">${body}</g></g>`
  )
}

// A ribbon that follows the water's edge, as SVG path text. For SHORE point i,
// offset(i) is how far out into the water the ribbon starts and width(i) is how thick it is there.
// Where the width is 0 or less the ribbon has a gap.
function ribbon(offset, width) {
  const inner = []
  const outer = []
  SHORE.forEach(([x, y], i) => {
    const [ox, oy] = SHORE_OUT[i]
    const from = offset(i)
    const to = from + Math.max(0, width(i))
    inner.push([x - ox * from, y - oy * from])
    outer.push([x - ox * to, y - oy * to])
  })
  return `M${points(inner)}L${points(outer.reverse())}Z`
}

// Foam: a white ribbon on the water's edge, thin far away and thick in front of us,
// and never the same thickness for long. A second, broken ribbon a little way out
// is the next small wave coming in. It is only drawn in front of us, and it wanders
// nearer to and further from the edge.
// All the foam slides a little way up the beach and back (the "fm" class in paintSunset).
function drawFoam() {
  const near = i => nearness(SHORE[i][1]) / nearness(frontY(W / 2)) // 0 at the far tips, about 1 in front of us
  const edge = ribbon(() => -2, i => (2 + 7 * near(i)) * (0.75 + 0.3 * Math.sin(i * 0.9) + 0.25 * Math.sin(i * 0.23 + 2)))
  const wave = ribbon(
    i => 14 + 16 * near(i) + 7 * Math.sin(i * 0.55),
    i => (near(i) > 0.8 ? 6 * (Math.sin(i * 0.31 + 1) + 0.4 * Math.sin(i * 0.83) - 0.15) : 0),
  )
  return `<g class="fm" filter="url(#froth)"><path d="${edge}" fill="#dfe6ee"/><path d="${wave}" fill="#b4c4d4" opacity=".7"/></g>`
}

// A dark green mound of dune grass in a bottom corner. side is 1 for the left corner, -1 for the right.
// Many blades are green. The rest are pale or orange, where the low sun catches them.
function drawGrass(rand, side) {
  const edge = side === 1 ? 0 : W
  const reach = side === 1 ? 330 : 400 // how far the mound runs along the bottom
  const top = side === 1 ? 880 : 860 // y of the mound's top, at the edge of the picture
  const moundY = share => top + (H - top) * share ** 2.2 // share: 0 at the edge, 1 where the mound ends
  let mound = `M${edge - side * 30} ${top}`
  for (let i = 1; i <= 10; i++) {
    mound += `L${Math.round(edge + side * reach * (i / 10))} ${Math.round(moundY(i / 10))}`
  }

  const hill = `<path d="${mound}L${edge - side * 30} ${H + 10}Z" fill="#0b2018"/>`
  let blades = ''
  for (const [color, count] of [['#1f5236', 46], [PALE, 36], ['#d98545', 14]]) {
    let d = ''
    for (let i = 0; i < count; i++) {
      const share = rand() * 0.95
      const x = edge + side * reach * share
      const ground = moundY(share)
      const y = ground + rand() * (H - ground) * 0.5
      const len = 50 + rand() * 90
      const bend = (rand() - 0.35) * side * len
      d += `M${Math.round(x)} ${Math.round(y)}q${Math.round(bend * 0.15)} ${Math.round(-len * 0.6)} ${Math.round(bend * 0.6)} ${Math.round(-len)}`
    }
    blades += `<path d="${d}" stroke="${color}" stroke-width="2.2" opacity=".95"/>`
  }
  // The blades lean left and right from their feet (the "gr" classes in paintSunset). The hill stays put.
  return crisp(`${hill}<g class="gr${side === 1 ? '' : ' g2'}">${blades}</g>`)
}

/** The whole drawing as an SVG document. The same seed gives the same drawing. */
export function paintSunset(seed = 20261114) {
  const rand = makeRandom(seed)
  // A top-to-bottom gradient of pale washes, for the area under the pencil.
  const gradient = (id, stops) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([at, color]) => `<stop offset="${at}" stop-color="${wash(toRgb(color))}"/>`).join('')}</linearGradient>`
  // A filter that makes shapes look drawn by hand on rough paper. It does two things.
  // It scratches gaps into them: `grain` sets how fine the gaps are (two numbers make them
  // long one way, like pencil lines) and `cut` how much is scratched away (more negative is more).
  // Then it bends them: `bend` sets how tight the bends are (bigger is tighter) and `size` how far
  // things move (nothing moves more than half of `size`, in the drawing's own units).
  // A filter only works inside a box. By default that box is a little bigger than the lines
  // it is used on, measured without their thickness. That cuts fat round dots flat, so
  // filters used on dots pass `isWhole` to make the box the whole picture instead.
  // Movement, which only some filters have:
  // With `isRedrawn`, the gaps jump between three patterns, each held for 3 frames, like a
  // pencil drawing that is redrawn.
  // With `sizes`, the bend jumps through those sizes, each held for `hold` frames.
  const rough = (id, grain, cut, bend, size, { isWhole, isRedrawn, sizes, hold = 3 } = {}) =>
    `<filter id="${id}" ${isWhole ? `filterUnits="userSpaceOnUse" x="-50" y="-50" width="${W + 100}" height="${H + 100}"` : 'x="-6%" y="-6%" width="112%" height="112%"'} color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${grain}" numOctaves="2" seed="4">${isRedrawn ? jump('seed', [4, 17, 31], 3) : ''}</feTurbulence>` +
    `<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7 0 0 0 ${cut}"/><feComposite in="SourceGraphic" operator="in" result="dry"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${bend}" numOctaves="1" seed="9" result="bend"/>` +
    `<feDisplacementMap in="dry" in2="bend" scale="${size}" xChannelSelector="R" yChannelSelector="G">${sizes ? jump('scale', sizes, hold) : ''}</feDisplacementMap></filter>`
  // The water rocks: its bends grow and shrink through these sizes, a cycle of 1.6 seconds.
  const ROCK = [26, 30, 33, 30, 26, 22, 19, 22]
  // The clouds billow: the bends of their outlines grow and shrink through these sizes, 3 frames each.
  const BILLOW = [30, 35, 39, 42, 39, 35, 30, 25, 21, 25]

  // The moves made with CSS. steps(n) cuts the way between two keyframes into n jumps.
  // Every time below is picked so that one jump lasts 0.2 seconds (3 frames) or a multiple of that.
  const style =
    '<style>' +
    // Stars blink: each group dims and comes back, at its own speed.
    '.st{animation:tw 2.4s steps(3) infinite}.s2{animation-duration:3.6s;animation-delay:-1s}.s3{animation-duration:4.8s;animation-delay:-2.6s}@keyframes tw{50%{opacity:.2}}' +
    // Clouds drift to the right, each at its own speed.
    cloudMoves() +
    // Palm fronds rock around the top of their trunk.
    '.pm{animation:pm 3.2s steps(16) infinite alternate}.p1{animation-delay:-1.4s}.p2{animation:pm 4s steps(20) -2.6s infinite alternate}@keyframes pm{from{transform:rotate(-1.5deg)}to{transform:rotate(2deg)}}' +
    // Dune grass leans left and right from its feet. fill-box makes "50% 100%" mean the bottom middle of the blades.
    '.gr{animation:gr 2.4s steps(12) infinite alternate;transform-box:fill-box;transform-origin:50% 100%}.g2{animation-delay:-1s}@keyframes gr{from{transform:skewX(-2deg)}to{transform:skewX(3deg)}}' +
    // Foam slides up the beach and back. It stretches down from the horizon line, so the far foam hardly moves.
    `.fm{animation:fm 4s steps(20) infinite alternate;transform-origin:${W / 2}px ${HORIZON}px}@keyframes fm{to{transform:scale(1,1.022)}}` +
    '</style>'

  const defs =
    '<defs>' +
    gradient('sky', SKY) +
    gradient('sea', SEA) +
    gradient('sand', SAND) +
    `<clipPath id="sea"><rect y="${HORIZON}" width="${W}" height="${H - HORIZON}"/></clipPath>` +
    // The glow where the sun went down: brightest in the middle, fading to nothing.
    '<radialGradient id="glow"><stop offset="0" stop-color="#ffe7b0" stop-opacity=".9"/><stop offset=".2" stop-color="#ffab58" stop-opacity=".6"/><stop offset=".5" stop-color="#e8642f" stop-opacity=".25"/><stop offset="1" stop-color="#c84a2a" stop-opacity="0"/></radialGradient>' +
    // "edges" darkens the corners of the picture a little.
    '<radialGradient id="edges" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#040a1c" stop-opacity="0"/><stop offset="1" stop-color="#040a1c" stop-opacity=".78"/></radialGradient>' +
    // "pencil" is for the mountains: each wide stroke turns into many thin lines, in long slow bends. It does not move.
    rough('pencil', '.035 .55', -3.15, '.004 .012', 22) +
    // "air" is for the sky: the same as "pencil", but its bends change size a tiny bit, slowly
    // (each size is held for 6 frames), so the lines shift by less than 1. The gaps stay the same.
    rough('air', '.035 .55', -3.15, '.004 .012', 22, { sizes: [22, 23.5, 22, 20.5], hold: 6 }) +
    // "ripple" is for the sea: the same thin lines, in tighter bends, like gentle waves. It rocks. The gaps stay the same.
    rough('ripple', '.035 .55', -3.15, '.006 .03', 26, { sizes: ROCK }) +
    // "glitter" is for the sunlight on the water: fewer gaps. It rocks with the sea, and it is redrawn, so the light sparkles.
    rough('glitter', '.08 .5', -2.7, '.006 .03', 26, { isRedrawn: true, sizes: ROCK }) +
    // "grain" is for the sand: short specks more than lines, like pencil on very rough paper. It does not move.
    rough('grain', '.1 .5', -3, '.006', 40) +
    // "cloud" is for the lower layers of the clouds: no gaps, and outlines that wander.
    // The outlines swell and shrink: the bend goes through BILLOW, a cycle of 2 seconds.
    rough('cloud', '.5', 0, '.012', 30, { isWhole: true, sizes: BILLOW }) +
    // "puff" is for the top layer of the clouds: the same outlines and the same swell, with a few gaps.
    rough('puff', '.5', -2.4, '.012', 30, { isWhole: true, sizes: BILLOW }) +
    // "froth" is for the foam and the shrubs on the mountains: a few gaps, and a wobbly edge. It does not move.
    rough('froth', '.25', -2.5, '.03', 8, { isWhole: true }) +
    // "tooth" is fine pale specks over the whole picture: the grain of the paper.
    '<filter id="tooth" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3"/>' +
    '<feColorMatrix values="0 0 0 0 .95 0 0 0 0 .92 0 0 0 0 .84 5 0 0 0 -2.8"/></filter>' +
    '</defs>'

  const farColor = toRgb('#2f4268')
  const far = FAR.map(({ lean, ridge, base }, i) =>
    drawMountain(
      rand,
      {
        color: '#2f4268',
        lean,
        width: 7,
        corners: [...ridge, [base, HORIZON]],
        // Four pencils: plain, a little lighter, a warm orange haze, and a dark blue-green.
        pick: () => [farColor, mix(farColor, PAPER, 0.12), mix(farColor, toRgb('#c9704a'), 0.3), mix(farColor, toRgb('#2c4858'), 0.5)][Math.floor(rand() * 4)],
      },
      `far${i}`,
    ),
  )
  const near = SIDES.map(({ lean, ridge, foot }, i) =>
    drawMountain(
      rand,
      {
        color: '#163a2c',
        lean,
        width: 9,
        isGrassy: true,
        corners: [...ridge, ...foot.slice(1)],
        // Grass greens. The slope is lighter the nearer it is to the sun, left to right.
        // Three pencils: plain, a blue-green for shade, and a yellow-green for lit grass.
        // About one patch in eight is orange light instead.
        pick: x => {
          const plain = mix(toRgb('#0f2e24'), toRgb('#234d34'), clamp(1 - Math.abs(x - SUN_X) / 700, 0, 1))
          return rand() < 0.12
            ? mix(plain, toRgb('#e07f40'), 0.4)
            : [plain, mix(plain, toRgb('#0c2430'), 0.5), mix(plain, toRgb('#6f8f45'), 0.3)][Math.floor(rand() * 3)]
        },
      },
      `near${i}`,
    ),
  )

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    defs +
    style +
    `<rect width="${W}" height="${HORIZON + 10}" fill="url(#sky)"/>` +
    drawSky(rand) +
    // A soft glow laid over the pencil, the one smooth thing in the sky.
    `<circle cx="${SUN_X}" cy="${SUN_Y}" r="400" fill="url(#glow)"/>` +
    drawStars(seed + 1) +
    drawClouds(rand, makeRandom(seed + 2)) +
    far.join('') +
    `<rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#sea)"/>` +
    drawSea(rand) +
    // The same glow on the far water, squashed flat.
    `<ellipse cx="${SUN_X}" cy="${HORIZON + 2}" rx="360" ry="46" fill="url(#glow)" opacity=".75" clip-path="url(#sea)"/>` +
    drawReflection(rand) +
    near.join('') +
    drawSand(rand) +
    drawFoam() +
    SIDES.map(side => drawSide(rand, side)).join('') +
    // One bigger palm in each front corner, on the sand.
    crisp(drawPalm(rand, 40, 700, 270, 0.5) + drawPalm(rand, 1562, 700, 270, -0.5)) +
    drawGrass(rand, 1) +
    drawGrass(rand, -1) +
    `<rect width="${W}" height="${H}" fill="url(#edges)"/>` +
    `<rect width="${W}" height="${H}" filter="url(#tooth)" opacity=".13"/>` +
    '</svg>'
  // Every attribute is written with single quotes, to keep the picture small when it is packed.
  // The desktop app packs it into a data URL with encodeURIComponent (seen in the app's code).
  // There a double quote takes three characters (%22) and a single quote takes one.
  // JSON text also needs two characters for a double quote. Whether the picture is sent
  // as JSON was not checked.
  // No attribute value here holds a quote of either kind, so the swap is safe.
  return svg.replaceAll('"', "'")
}
