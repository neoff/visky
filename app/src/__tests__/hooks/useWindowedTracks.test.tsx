/**
 * The window, and what must not rewind it.
 *
 * "если долистать фейворитс (all) до самого низа, включить что-нибудь, открыть
 * плеер, потом его свернуть — листинг перезагружается и возвращается в самый
 * верх."
 *
 * Collapsing the player refocuses the tab, and the tab re-read its list on
 * focus with `reset()` — which is page 0 by definition. The hook has always had
 * the other call for this; these tests pin the difference between them.
 */
import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {PAGE_SIZE, useWindowedTracks} from '@/hooks/useWindowedTracks'

const page = (index: number) =>
  Array.from({length: PAGE_SIZE}, (_, at) => ({
    id: index * PAGE_SIZE + at,
    owner_id: -42311167,
    title: `track ${index * PAGE_SIZE + at}`,
  }))

const loader = jest.fn(async (offset: number, _count?: number) => page(offset / PAGE_SIZE))

type Api = ReturnType<typeof useWindowedTracks>

const Probe = ({onRender}: {onRender: (api: Api) => void}) => {
  onRender(useWindowedTracks((offset, count) => loader(offset, count) as any, true))
  return null
}

const mount = async () => {
  let api: Api
  await act(async () => {
    TestRenderer.create(<Probe onRender={(next) => {
      api = next
    }}/>)
  })
  return {get: () => api!}
}

beforeEach(() => {
  jest.clearAllMocks()
})

const offsets = () => loader.mock.calls.map(([offset]) => offset)

it('pages down, and refreshes IN PLACE', async () => {
  const probe = await mount()

  await act(async () => {
    await probe.get().loadMore()
  })
  await act(async () => {
    await probe.get().loadMore()
  })
  expect(offsets()).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2])
  expect(probe.get().tracks).toHaveLength(PAGE_SIZE * 3)
  const bottom = probe.get().tracks[PAGE_SIZE * 3 - 1]

  loader.mockClear()
  await act(async () => {
    await probe.get().refreshWindow()
  })

  // the SAME three pages, re-read where they are
  expect(offsets().sort((a, b) => a - b)).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2])
  expect(probe.get().tracks).toHaveLength(PAGE_SIZE * 3)
  expect(probe.get().tracks[PAGE_SIZE * 3 - 1]).toEqual(bottom)
})

it('is thrown back to the top only by an explicit reset', async () => {
  const probe = await mount()
  await act(async () => {
    await probe.get().loadMore()
  })

  await act(async () => {
    await probe.get().reset()
  })

  // pull-to-refresh and the tab bar mean "start over"; coming back from the
  // player does not
  expect(probe.get().tracks).toHaveLength(PAGE_SIZE)
  expect(probe.get().tracks[0].id).toBe(0)
})

it('keeps the page it holds when a refresh comes back empty', async () => {
  const probe = await mount()
  const held = probe.get().tracks

  loader.mockResolvedValueOnce([] as any)
  await act(async () => {
    await probe.get().refreshWindow()
  })

  expect(probe.get().tracks).toEqual(held)
})
