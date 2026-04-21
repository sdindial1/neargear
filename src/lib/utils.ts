import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCondition(condition: string): string {
  const map: Record<string, string> = {
    like_new: "Like New",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  }
  return map[condition] || condition
}
