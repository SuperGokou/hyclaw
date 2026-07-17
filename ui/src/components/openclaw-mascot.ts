import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { GOKU_MASCOT_PNG } from "./goku-mascot-data.ts";

/**
 * HYClaw mascot — an EFD-owned character sticker rendered with a dimensional
 * (3D) treatment: layered drop shadows for depth, a pulsing golden energy aura,
 * and a gentle float + tilt. Replaces the upstream canvas lobster ("Clawd").
 *
 * The public API (mood / size / tease / catchOnce) is preserved so existing
 * call sites keep working; moods nudge the aura intensity, and all motion is
 * CSS that respects prefers-reduced-motion.
 */
const DEFAULT_SIZE = 120;

type MascotMood =
  | "idle"
  | "curious"
  | "thinking"
  | "working"
  | "happy"
  | "celebrating"
  | "sad"
  | "sleepy"
  | "attentive";

const ENERGETIC_MOODS = new Set<MascotMood>(["working", "happy", "celebrating", "attentive"]);

class OpenClawMascot extends LitElement {
  static override styles = css`
    :host {
      display: inline-block;
      width: var(--hy-mascot-size, 120px);
      height: var(--hy-mascot-size, 120px);
      line-height: 0;
      pointer-events: none;
      perspective: 600px;
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      transform-style: preserve-3d;
      animation: hy-float 3.4s ease-in-out infinite;
    }
    .aura {
      position: absolute;
      inset: 8%;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(255, 214, 92, 0.55) 0%,
        rgba(255, 170, 40, 0.28) 42%,
        rgba(255, 170, 40, 0) 70%
      );
      filter: blur(6px);
      transform: translateZ(-40px);
      animation: hy-aura 2.2s ease-in-out infinite;
    }
    :host([data-energetic]) .aura {
      background: radial-gradient(
        circle,
        rgba(255, 232, 130, 0.8) 0%,
        rgba(255, 180, 50, 0.4) 45%,
        rgba(255, 180, 50, 0) 72%
      );
    }
    img {
      position: relative;
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.38)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28));
    }
    :host([data-bounce]) .stage {
      animation: hy-bounce 0.6s ease-in-out;
    }
    @keyframes hy-float {
      0%,
      100% {
        transform: translateY(0) rotateY(-5deg) rotateX(2deg);
      }
      50% {
        transform: translateY(-5%) rotateY(5deg) rotateX(-2deg);
      }
    }
    @keyframes hy-aura {
      0%,
      100% {
        opacity: 0.65;
        transform: translateZ(-40px) scale(0.96);
      }
      50% {
        opacity: 1;
        transform: translateZ(-40px) scale(1.06);
      }
    }
    @keyframes hy-bounce {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }
      35% {
        transform: translateY(-12%) scale(1.06, 0.94);
      }
      70% {
        transform: translateY(0) scale(0.97, 1.03);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .stage,
      .aura {
        animation: none;
      }
    }
  `;

  @property({ reflect: true }) mood: MascotMood = "idle";
  @property({ type: Number }) size = DEFAULT_SIZE;
  @property({ type: Boolean }) tease = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("aria-hidden", "true");
  }

  protected override updated(): void {
    const resolved = Number.isFinite(this.size) && this.size > 0 ? this.size : DEFAULT_SIZE;
    this.style.setProperty("--hy-mascot-size", `${resolved}px`);
    this.toggleAttribute("data-energetic", ENERGETIC_MOODS.has(this.mood));
  }

  /** Play a one-shot bounce (kept for API compatibility with call sites). */
  catchOnce(): void {
    if (!this.isConnected) return;
    this.setAttribute("data-bounce", "");
    window.setTimeout(() => this.removeAttribute("data-bounce"), 600);
  }

  override render() {
    return html`
      <div class="stage">
        <div class="aura"></div>
        <img src=${GOKU_MASCOT_PNG} alt="" draggable="false" />
      </div>
    `;
  }
}

if (!customElements.get("openclaw-mascot")) {
  customElements.define("openclaw-mascot", OpenClawMascot);
}
