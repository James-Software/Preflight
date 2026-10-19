"use client";

import { useSyncExternalStore } from "react";
import { currentTheme, serverTheme, subscribeToTheme } from "./theme";

/** A stable server snapshot avoids theme-dependent hydration mismatches. */
export default function useTheme() {
  return useSyncExternalStore(subscribeToTheme, currentTheme, serverTheme);
}
