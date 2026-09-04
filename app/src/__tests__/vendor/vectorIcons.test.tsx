import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import createIconSet from '@expo/vector-icons/build/createIconSet'
import {loadAsync} from 'expo-font'

/**
 * The icon font, as patched (app/patches/@expo+vector-icons+15.1.1.patch).
 *
 * "Пропали иконки (особенно важна иконка свернуть миниплеер), иконки не по
 * центру."
 *
 * `createIconSet` renders an empty <Text/> until `fontIsLoaded`. `loadAsync`
 * injects the @font-face rule synchronously, but the promise it returns reports
 * the VERIFICATION, which expo-font does with fontfaceobserver — and
 * fontfaceobserver measures the width of the string "BESbswy". An icon font
 * contains none of those seven letters, so the measurement never changes, the
 * promise rejects on its 12 second timeout, the `await` throws, and `setState`
 * never runs. That instance is blank for ever.
 *
 * The off-centre part of the report is the same bug: a blank glyph is
 * zero-width, and `space-between` distributes what is left.
 */
const glyphMap = {search: 0xf002, 'chevron-down': 0xf078}

const render = async (name: keyof typeof glyphMap) => {
  const Icon = createIconSet(glyphMap, 'Ionicons', 1) as never as React.ComponentType<any>
  let tree: TestRenderer.ReactTestRenderer
  await act(async () => {
    tree = TestRenderer.create(<Icon name={name} size={20} />)
  })
  return tree!
}

/** Every string the rendered tree actually draws. */
const glyphsIn = (tree: TestRenderer.ReactTestRenderer): string[] => {
  const out: string[] = []
  const walk = (node: TestRenderer.ReactTestRendererJSON | string | null) => {
    if (node === null) return
    if (typeof node === 'string') {
      out.push(node)
      return
    }
    node.children?.forEach(walk)
  }
  walk(tree.toJSON() as TestRenderer.ReactTestRendererJSON)
  return out
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('an icon whose font never verifies', () => {
  it('is still drawn', async () => {
    // the default mock rejects, exactly as fontfaceobserver does for a font
    // with no "BESbswy" in it
    await expect(loadAsync({})).rejects.toThrow()

    const tree = await render('search')

    expect(glyphsIn(tree)).toContain(String.fromCodePoint(glyphMap.search))
  })

  it('is drawn for the FIRST instance of the family too', async () => {
    // Only the first was ever blank: every later one mounts with the font
    // already registered, which is why it looked random — one dead glyph per
    // family, whichever mounted first.
    const first = await render('chevron-down')
    const second = await render('chevron-down')

    expect(glyphsIn(first)).toEqual(glyphsIn(second))
    expect(glyphsIn(first)).toContain(String.fromCodePoint(glyphMap['chevron-down']))
  })

  it('still asks for the font, so the browser paints it when it lands', async () => {
    await render('search')

    expect(loadAsync).toHaveBeenCalled()
  })
})
