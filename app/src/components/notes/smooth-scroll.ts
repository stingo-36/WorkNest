/**
 * Smoothly scroll the window until `target` sits `offset` px below the top.
 *
 * Why not `window.scrollTo({ behavior: "smooth" })`: on a long note the pages
 * between here and the target mount lazily, grow, and push the target away
 * while we travel. The native smooth scroll aims at where the target *was*,
 * stops short, and the only fix is a visible snap at the end.
 *
 * So this:
 *  - re-reads the target's live position every frame, bending the motion to
 *    follow it;
 *  - tells lazy pages to hold off mounting while the jump is in flight
 *    (`isJumping`) — flying past 100 pages used to mount 100 editors and drop
 *    the frame rate to ~20fps — and announces `NOTE_SCROLL_END` when it lands
 *    so the pages around the landing spot mount then;
 *  - after arriving, keeps the target pinned until it has stopped moving
 *    (those last pages mounting), up to a time limit.
 *
 * Only one scroll runs at a time; a new call, or the user grabbing the wheel,
 * touch or keyboard, cancels the one in flight.
 */
export const NOTE_SCROLL_END = "note-scroll-end";

let cancelCurrent: (() => void) | null = null;
let jumping = false;

/** True while a smooth jump is travelling (lazy pages wait for it to land). */
export const isJumping = () => jumping;

const USER_INPUT = ["wheel", "touchstart", "keydown"] as const;
/** Frames the target must stay put before we let go after arriving. */
const STABLE_FRAMES = 8;
/** Never hold on longer than this after arriving. */
const MAX_HOLD_MS = 1500;

export function smoothScrollTo(
  target: HTMLElement,
  { offset = 0, reduceMotion = false }: { offset?: number; reduceMotion?: boolean } = {},
): void {
  cancelCurrent?.();
  const goal = () => window.scrollY + target.getBoundingClientRect().top - offset;

  const startY = window.scrollY;
  // Longer trips take a little longer, within a range that still feels quick.
  const duration = reduceMotion ? 0 : Math.min(900, Math.max(320, Math.abs(goal() - startY) / 5));
  const start = performance.now();
  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
  let frame = 0;
  let arrivedAt = 0;
  let stable = 0;
  let lastTop = Number.NaN;

  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of USER_INPUT) window.removeEventListener(type, stop);
    if (cancelCurrent === stop) cancelCurrent = null;
    jumping = false;
    window.dispatchEvent(new Event(NOTE_SCROLL_END));
  };

  const step = (now: number) => {
    const t = duration ? Math.min(1, (now - start) / duration) : 1;
    window.scrollTo(0, startY + (goal() - startY) * easeOutCubic(t));
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    if (!arrivedAt) {
      arrivedAt = now;
      // Landed: let the pages around here mount, then hold while they settle.
      jumping = false;
      window.dispatchEvent(new Event(NOTE_SCROLL_END));
    }
    const top = target.getBoundingClientRect().top;
    stable = Math.abs(top - lastTop) < 1 && Math.abs(top - offset) <= 1 ? stable + 1 : 0;
    lastTop = top;
    if (stable < STABLE_FRAMES && now - arrivedAt < MAX_HOLD_MS) {
      frame = requestAnimationFrame(step);
      return;
    }
    stop();
  };

  for (const type of USER_INPUT) window.addEventListener(type, stop, { passive: true });
  cancelCurrent = stop;
  jumping = true;
  frame = requestAnimationFrame(step);
}
