/** expo-linking — the deep-link helpers `constants/index.ts` builds urls with. */
export const createURL = (path: string) => `visky://${path}`
export const parse = (url: string) => ({path: url, queryParams: {}})
export const useURL = () => null
export const addEventListener = () => ({remove: () => undefined})
