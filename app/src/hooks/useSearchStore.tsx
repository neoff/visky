import { create } from 'zustand'

interface SearchStore {
  query: string
  setQuery: (value: string) => void
  clear: () => void
}

export const useSearchStore = create<SearchStore>((set) => ({
  query: '',
  setQuery: (value) => set({ query: value }),
  clear: () => set({ query: '' }),
}))