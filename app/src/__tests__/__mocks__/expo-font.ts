/**
 * expo-font, with the failure mode that matters.
 *
 * `loadAsync` is what @expo/vector-icons awaits, and on the web it REJECTS for
 * an icon font — fontfaceobserver verifies a load by measuring the string
 * "BESbswy", which no icon font contains. The default here rejects for exactly
 * that reason, because that is the case the patch under test exists for.
 */
export const loadAsync = jest.fn(async () => {
  throw new Error('timeout exceeded')
})

export const isLoaded = jest.fn(() => false)
