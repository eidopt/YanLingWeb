"use client";

import type { ThemeRuntime } from "./types";
import { useEffect } from "react";

/**
 * Injects a <style> tag containing @keyframes definitions from
 * ThemeRuntime.cssAnimations into <head>. Cleans up on unmount or
 * when the runtime id changes.
 *
 * Designed as a standalone module — call this once at the renderer root,
 * do not inline the logic elsewhere.
 */
export function useInjectAnimations(runtime: ThemeRuntime): void {
  const { id, cssAnimations } = runtime;

  useEffect(() => {
    if (!cssAnimations || Object.keys(cssAnimations).length === 0) {
      return;
    }

    const css = Object.entries(cssAnimations)
      .map(([name, body]) => `@keyframes ${name} {\n  ${body}\n}`)
      .join("\n\n");

    const style = document.createElement("style");
    style.dataset.themeRuntimeId = id;
    style.textContent = css;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [id, cssAnimations]);
}
