import {useEffect, useState} from 'react'

/** `value`, but only after it has stopped changing for `delay` ms. */
export const useDebouncedValue = <T,>(value: T, delay: number = 400): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
