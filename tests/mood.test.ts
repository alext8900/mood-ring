import { expect, mock, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120 } as unknown as RenderPropsOf['AbovePrompt'],
} as const

test('failures build a streak, a pass after them turns smug', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let isFailing = true
  on('tool.call', { tool: 'Bash' }, () =>
    isFailing
      ? ({ isError: true, result: 'boom', text: 'Tests: 3 failed' } as never)
      : ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'all passed' } as never),
  )
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'edited' }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'fix the tests', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mood-ring', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /💀x2/ })).toBeDefined()
    await ui.unmount()
  }

  await $.tool.call({ tool: 'Edit', file_path: '/tmp/a.ts', old_string: 'a', new_string: 'b' })
  isFailing = false
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(700)

  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /SMUG/ })).toBeDefined()
  await ui.unmount()
})

test('/mood verbose shows stats', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await $.command.run({ command: 'mood', args: 'verbose' } as never)
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /edits 0 \| failures 0/ })).toBeDefined()
  await ui.unmount()
})

test('slang + swearing reads as big praise', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('prompt.submit', ($, e) => ({ text: e.text }) as never)
  await $.prompt.submit({ text: 'this is fucking sick!', wait: false } as never)
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  const hyped = /LET'S GOOO|blushing in uppercase|SO cooking|Hype received/
  expect(await ui.find({ type: 'Text', text: hyped })).toBeDefined()
  await ui.unmount()
})

test('git: a commit message saying "tests" is not a check, a push to main is SHIPPING, recap tells the story', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', ($, e) => e as never)
  on('command.register', () => ({ value: {} }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }) as never)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ text: 'ship it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add tests for the jest runner"' })
  let ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /VICTORIOUS|SMUG/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /No take-backs|history books|Forever/ })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /SHIPPING/ })).toBeDefined()
  await ui.unmount()

  // A subagent finishing must not count as the turn.
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'a1' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  await clock.advance(700)
  const recap = (await $.command.run({ command: 'mood', args: 'recap' } as never)) as { text: string }
  expect(recap.text).toMatch(/1 commits · 1 pushes/)
  expect(recap.text).toMatch(/All time: 1 sessions · 1 turns/)
})

test('a check with one failure left is SO CLOSE, not PANIC', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Bash' }, () => ({ isError: true, result: 'boom', text: 'Tests: 1 failed, 41 passed' }) as never)

  await $.turn.start({ text: 'fix the last test', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /SO CLOSE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PANIC/ })).toBeUndefined()
  await ui.unmount()
})

test('a pass after one failure is a small SMUG; after a long messy turn it is TRIUMPHANT', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let isFailing = true
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Bash' }, () =>
    isFailing
      ? ({ isError: true, result: 'boom', text: 'Tests: 5 failed' } as never)
      : ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'all passed' } as never),
  )
  on('tool.call', { tool: 'Read' }, () => ({ result: {}, text: 'file' }) as never)

  // One failure, then a pass: relief, not a parade.
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  isFailing = false
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  let ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /SMUG/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TRIUMPHANT/ })).toBeUndefined()
  await ui.unmount()
  await clock.advance(20_000)

  // Three failures in a long turn, then a pass.
  await $.turn.start({ text: 'it is still broken', turnId: 't2' })
  isFailing = true
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: `npm test -- --run ${i}` })
  for (let i = 0; i < 25; i++) await $.tool.call({ tool: 'Read', file_path: `/tmp/f${i}.ts` })
  isFailing = false
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /TRIUMPHANT/ })).toBeDefined()
  await ui.unmount()
})

test('DANGER shows before a destructive command; success is an INCIDENT that nothing else outranks', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  let sawDanger = false
  on('tool.call', { tool: 'Bash' }, async (_, e) => {
    if (String((e as { command?: string }).command).includes('dropdb')) {
      const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
      sawDanger = (await ui.find({ type: 'Text', text: /DANGER/ })) !== undefined
      await ui.unmount()
    }
    return { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' } as never
  })

  await $.turn.start({ text: 'clean up the old db', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'dropdb mood_ring_fake_db' })
  expect(sawDanger).toBe(true)
  // A green test run right after must not cover it with a celebration.
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /INCIDENT \+\d+:\d\d/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /VICTORIOUS|SMUG/ })).toBeUndefined()
  await ui.unmount()
  const recap = (await $.command.run({ command: 'mood', args: 'recap' } as never)) as { text: string }
  expect(recap.text).toMatch(/Incidents: 1/)
})

test('a denied or failed destructive command is not an incident', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  let mode: 'deny' | 'fail' = 'deny'
  on('tool.call', { tool: 'Bash' }, () =>
    mode === 'deny' ? ({ deny: 'not allowed' } as never) : ({ isError: true, result: 'boom', text: 'ERROR: relation does not exist' } as never),
  )

  await $.turn.start({ text: 'drop it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'psql -c "DROP TABLE mood_ring_fake"' })
  mode = 'fail'
  await $.tool.call({ tool: 'Bash', command: 'psql -c "DROP TABLE mood_ring_fake"' })
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /INCIDENT|DANGER/ })).toBeUndefined()
  await ui.unmount()
  const recap = (await $.command.run({ command: 'mood', args: 'recap' } as never)) as { text: string }
  expect(recap.text).not.toMatch(/Incidents/)
})

test('cleanup, scoped SQL and mentions are not danger; a doomed rm -rf is', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }) as never)

  await $.turn.start({ text: 'tidy up', turnId: 't1' })
  for (const command of [
    'rm -rf ./dist node_modules/.cache',
    'rm -rf /tmp/mood-ring-fake',
    'psql -c "DELETE FROM sessions WHERE expires_at < now()"',
    'grep -rn dropdb .',
    'git commit -m "psql DROP TABLE users"',
  ]) {
    await $.tool.call({ tool: 'Bash', command })
    const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /INCIDENT|DANGER/ })).toBeUndefined()
    await ui.unmount()
  }

  await $.tool.call({ tool: 'Bash', command: 'rm -rf /mood-ring-fake-dir' })
  const ui = await $.ui.mount({ plugin: 'mood-ring', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /INCIDENT/ })).toBeDefined()
  await ui.unmount()
})
