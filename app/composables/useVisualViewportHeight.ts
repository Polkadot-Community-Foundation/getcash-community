// Publishes the visual viewport as two CSS variables: --vvh for its height and --vvt for its top.
// Without the API the shell falls back to 100dvh at top 0. The test-network banner, when shown,
// is taken off the top so the screens lay out below it.

import { onMounted, onUnmounted } from "vue";

export const VISUAL_VIEWPORT_HEIGHT_VAR = "--vvh";
export const VISUAL_VIEWPORT_TOP_VAR = "--vvt";

export function useVisualViewportHeight() {
  let detach: (() => void) | null = null;
  onMounted(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement.style;
    const banner = document.querySelector<HTMLElement>("[data-test-network-banner]");
    const apply = () => {
      const bannerHeight = banner?.offsetHeight ?? 0;
      root.setProperty(VISUAL_VIEWPORT_HEIGHT_VAR, `${viewport.height - bannerHeight}px`);
      root.setProperty(VISUAL_VIEWPORT_TOP_VAR, `${viewport.offsetTop + bannerHeight}px`);
    };
    apply();
    // resize: the keyboard opening or closing. scroll: offsetTop shifting.
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    detach = () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.removeProperty(VISUAL_VIEWPORT_HEIGHT_VAR);
      root.removeProperty(VISUAL_VIEWPORT_TOP_VAR);
    };
  });
  onUnmounted(() => detach?.());
}
