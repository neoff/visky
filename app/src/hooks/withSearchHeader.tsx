import React from "react"
import { AnimatedSearchHeader } from "@/components/AnimatedSearchHeader"

export const withSearchHeader = (title: string) => ({
  header: () => <AnimatedSearchHeader title={title} />,
})