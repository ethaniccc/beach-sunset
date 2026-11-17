import { expect, test } from 'claude-code/testing'

test('the theme is set and the painting is drawn as the backdrop', async ($, on) => {
  // Each hook here stands for the engine. This one records what the mod asked for.
  const asked: unknown[] = []
  on('theme.set', (_, e) => {
    asked.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(asked.length).toBe(1)
  expect(JSON.stringify(asked[0])).toContain('"scene":"beach-sunset"')

  const ui = await $.ui.mount({
    plugin: 'beach-sunset',
    component: 'Backdrop',
    requestId: 'backdrop',
    surface: 'desktop',
    props: { scene: 'beach-sunset', plugin: 'beach-sunset', glass: { blur: 0, tint: '#0d1b2e', opacity: 0.45 } },
  })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg === undefined).toBe(false)
  await ui.unmount()
})

test('a reply is drawn inside a box on desktop, and left alone in the terminal', async $ => {
  const reply = { plugin: 'beach-sunset', component: 'AssistantMessage', props: { text: 'Hello', isFirstOfReply: true } } as const

  const desktop = await $.ui.mount({ ...reply, surface: 'desktop' })
  expect((await desktop.find({ type: 'Box' })) === undefined).toBe(false)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...reply, surface: 'terminal' })
  expect((await terminal.find({ type: 'Box' })) === undefined).toBe(true)
  await terminal.unmount()
})
