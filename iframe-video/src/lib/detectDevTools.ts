import { DEVTOOLS_CHECK_MS, DEVTOOLS_SIZE_THRESHOLD_PX } from "../config";

function isDevToolsOpen() {
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return (
    widthGap > DEVTOOLS_SIZE_THRESHOLD_PX || heightGap > DEVTOOLS_SIZE_THRESHOLD_PX
  );
}

/** Calls `onChange` whenever DevTools open state changes. Returns a cleanup fn. */
export function watchDevTools(onChange: (open: boolean) => void) {
  let open = false;

  const check = () => {
    const next = isDevToolsOpen();
    if (next === open) return;
    open = next;
    onChange(open);
  };

  check();
  const timer = window.setInterval(check, DEVTOOLS_CHECK_MS);
  window.addEventListener("resize", check);

  return () => {
    clearInterval(timer);
    window.removeEventListener("resize", check);
  };
}
