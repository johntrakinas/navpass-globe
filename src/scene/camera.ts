const UI_ROOT_ID = 'globe-ui'
const PANEL_ID = 'country-panel'
const FOCUS_DIM_ID = 'focus-dim'
const BREADCRUMBS_ID = 'globe-breadcrumbs'
const STYLE_ID = 'navpass-country-panel-style'
const FONT_LINK_ID = 'navpass-country-panel-fonts'
const DEFAULT_BREADCRUMB_OFFSET_LEFT = 50
const DEFAULT_BREADCRUMB_OFFSET_TOP = 92
const DEFAULT_CARD_LEFT_OFFSET = '6%'
const DEFAULT_CARD_LEFT_OFFSET_MOBILE = '18px'

export type GlobeBreadcrumbItem = {
  id: string
  label: string
}

let showBreadcrumbs = true
let showCountryCardCloseButton = true
let breadcrumbOffsetLeft = DEFAULT_BREADCRUMB_OFFSET_LEFT
let breadcrumbOffsetTop = DEFAULT_BREADCRUMB_OFFSET_TOP
let heroLayout: 'shifted' | 'centered' = 'shifted'
let currentBreadcrumbs: GlobeBreadcrumbItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'map', label: 'Map' }
]

// Verdana Pro and Optima are system fonts — no external stylesheet needed.
function ensureCountryPanelFonts() {
  void FONT_LINK_ID  // ID constant kept for future use; nothing to inject.
}

function ensureStyles() {
  ensureCountryPanelFonts()
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #globe-ui {
      position: fixed;
      inset: 0;
      z-index: 4;
      pointer-events: none;
      --globe-breadcrumb-left: ${DEFAULT_BREADCRUMB_OFFSET_LEFT}px;
      --globe-breadcrumb-top: ${DEFAULT_BREADCRUMB_OFFSET_TOP}px;
      --globe-breadcrumb-left-compact: 20px;
      --globe-breadcrumb-top-compact: 40px;
      /* Theming tokens — override via configureGlobeUi or URL params */
      --np-accent: #ecb200;
      --np-border-color: var(--np-accent);
      --np-border-width: 1px;
      --np-card-bg: #001E3D;
      --np-card-left: ${DEFAULT_CARD_LEFT_OFFSET};
      --np-card-left-mobile: ${DEFAULT_CARD_LEFT_OFFSET_MOBILE};
      --np-card-padding-x: 28px;
      --np-card-padding-y: 22px;
      --np-card-padding-x-mobile: 18px;
      --np-card-padding-y-mobile: 16px;
    }
    #country-panel,
    #country-panel *,
    #country-panel *::before,
    #country-panel *::after { box-sizing: border-box; }
    #country-panel {
      position: fixed !important;
      left: auto !important;
      top: auto !important;
      right: 28px !important;
      bottom: 42px !important;
      width: min(356px, calc(100vw - 52px));
      max-height: 80vh;
      overflow: hidden;
      padding: 1px;
      margin: 0;
      border: var(--np-border-width) solid var(--np-border-color);
      background: var(--np-card-bg);
      color: #ffffff;
      box-shadow: 0 24px 52px -18px rgba(0, 0, 0, 0.58);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 460ms ease, transform 560ms ease, border-color 280ms ease, box-shadow 280ms ease;
      z-index: 4;
    }
    #country-panel.is-visible { opacity: 1; transform: translateY(0); }
    #country-panel.is-visible:hover {
      border-color: var(--np-accent);
      box-shadow: 0 28px 56px -16px rgba(0, 0, 0, 0.6);
    }
    #focus-dim {
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      opacity: 0;
      background: transparent;
      transition: opacity 0ms linear;
    }
    #globe-breadcrumbs {
      position: fixed;
      left: var(--globe-breadcrumb-left);
      top: var(--globe-breadcrumb-top);
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      max-width: min(420px, calc(100vw - 36px));
      pointer-events: none;
    }
    .globe-breadcrumb {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      pointer-events: auto;
    }
    .globe-breadcrumb__button,
    .globe-breadcrumb__current {
      color: rgba(255, 255, 255, 0.92);
      font: 500 12px/1.15 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif;
      letter-spacing: 0.01em;
      text-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
      white-space: nowrap;
    }
    .globe-breadcrumb__button {
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
      transition: color 220ms ease, opacity 220ms ease;
    }
    .globe-breadcrumb__button:hover {
      color: #ffffff;
    }
    .globe-breadcrumb__current {
      color: var(--np-accent);
    }
    .globe-breadcrumb__separator {
      color: rgba(255, 255, 255, 0.64);
      font: 500 16px/1 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif;
      user-select: none;
    }
    .panel-tooltip,
    .panel-tooltip * { margin: 0; }
    .panel-tooltip { display: flex; flex-direction: column; width: 100%; background: var(--np-card-bg); color: #fff; }
    .panel-tooltip-header { position: relative; display: flex; min-height: 162px; border-bottom: 1px solid rgba(255, 255, 255, 0.12); overflow: hidden; }
    .panel-tooltip-headcopy { flex: 1; min-width: 0; padding: 58px 20px 18px; }
    .panel-tooltip-title { font-family: "Optima","Palatino Linotype","Book Antiqua",Georgia,serif; font-size: clamp(32px, 4vw, 42px); line-height: 1.05; letter-spacing: -0.7px; text-wrap: balance; }
    .panel-tooltip-live { margin-top: 8px; display: flex; align-items: center; gap: 8px; font: 13px/1.1 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; letter-spacing: 0.7px; text-transform: uppercase; color: rgba(255, 255, 255, 0.52); }
    .panel-tooltip-live-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--np-accent); }
    .panel-tooltip-close { position: absolute; left: 12px; top: 12px; width: 24px; height: 24px; border: 0; background: transparent; color: rgba(255, 255, 255, 0.82); font-size: 28px; line-height: 1; cursor: pointer; padding: 0; display: grid; place-items: center; z-index: 3; pointer-events: auto; }
    .panel-tooltip-flagbox { width: clamp(92px, 22vw, 122px); flex: 0 0 clamp(92px, 22vw, 122px); border-left: 1px solid rgba(255, 255, 255, 0.1); background-image: var(--flag-bg); background-position: center; background-repeat: no-repeat; background-size: min(80px, 72%) auto; opacity: 0.95; }
    .panel-tooltip-flagbox--empty { background: rgba(255, 255, 255, 0.04); }
    .panel-tooltip-dual { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
    .panel-tooltip-primary { padding: 18px 20px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.12); background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)); }
    .panel-tooltip-primary-label { font: 13px/1 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255, 255, 255, 0.48); }
    .panel-tooltip-primary-value { margin-top: 10px; font-family: "Optima","Palatino Linotype","Book Antiqua",Georgia,serif; font-size: clamp(34px, 5vw, 52px); line-height: 0.95; color: #fff; word-break: break-word; }
    .panel-tooltip-primary-sub { margin-top: 8px; font: 13px/1.3 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; color: rgba(255, 255, 255, 0.38); }
    .panel-tooltip-stat { padding: 16px 18px 14px; }
    .panel-tooltip-stat:first-child { border-right: 1px solid rgba(255, 255, 255, 0.12); }
    .panel-tooltip-stat-head { display: flex; align-items: center; gap: 8px; }
    .panel-tooltip-stat-icon { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; }
    .panel-tooltip-stat-label { font: 14px/1 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255, 255, 255, 0.48); }
    .panel-tooltip-stat-value { margin-top: 8px; font-family: "Optima","Palatino Linotype","Book Antiqua",Georgia,serif; font-size: clamp(28px, 4.4vw, 42px); line-height: 1; color: #fff; }
    .panel-tooltip-stat-sub { margin-top: 6px; font: 14px/1.2 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; color: rgba(255, 255, 255, 0.32); }
    .panel-tooltip-total-label { font: 13px/1 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; letter-spacing: 1.1px; text-transform: uppercase; color: rgba(255, 255, 255, 0.42); }
    .panel-tooltip-total-value { margin-top: 6px; font-family: "Optima","Palatino Linotype","Book Antiqua",Georgia,serif; font-size: clamp(32px, 4.6vw, 42px); line-height: 1; color: #fff; }
    .panel-tooltip-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 14px 20px; background: rgba(255, 255, 255, 0.05); }
    .panel-tooltip-footer-note { font: 13px/1.2 "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255, 255, 255, 0.42); }
    .panel-tooltip-more { min-height: 44px; min-width: 110px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: #fff; font: 600 14px "Verdana Pro",Verdana,"Trebuchet MS",sans-serif; padding: 0 18px; display: grid; place-items: center; text-transform: uppercase; letter-spacing: 0.9px; }
    .panel-tooltip--country {
      background: var(--np-card-bg);
      color: rgba(255, 255, 255, 0.96);
      font-family: "Verdana Pro",Verdana,"Trebuchet MS",sans-serif;
    }
    .panel-tooltip--country * {
      font-family: inherit;
    }
    .panel-tooltip-header--country {
      min-height: 142px;
      display: block;
      background: var(--np-card-bg);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
    }
    .panel-tooltip-headcopy--country {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      min-height: 142px;
      padding: 42px 18px 18px;
      position: relative;
      z-index: 1;
    }
    .panel-tooltip-country-topline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .panel-tooltip-country-heading {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel-tooltip--country .panel-tooltip-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      margin-top: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: rgba(185, 193, 208, 0.78);
      backdrop-filter: none;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .panel-tooltip--country .panel-tooltip-live-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--np-accent);
      box-shadow: none;
    }
    .panel-tooltip-country-code {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 46px;
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      background: rgba(7, 15, 26, 0.3);
      color: rgba(255, 255, 255, 0.96);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .panel-tooltip-country-flag {
      flex: 0 0 auto;
      width: 46px;
      height: 46px;
      border-radius: 999px;
      border: 0;
      background-color: rgba(255, 255, 255, 0.04);
      background-image: var(--country-flag-bg, none);
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
      box-shadow: 0 18px 30px -22px rgba(0, 0, 0, 0.68);
    }
    .panel-tooltip-country-flag--empty {
      background: rgba(255, 255, 255, 0.05);
    }
    .panel-tooltip-title--country {
      margin-top: 0;
      max-width: 100%;
      color: #ffffff;
      font-family: "Optima","Palatino Linotype","Book Antiqua","Times New Roman",serif;
      font-size: clamp(22px, 2.35vw, 38px);
      font-weight: 400;
      line-height: 1;
      letter-spacing: -0.03em;
      text-shadow: none;
    }
    .panel-tooltip-country-subtitle {
      display: none;
    }
    .panel-tooltip--country .panel-tooltip-close {
      left: auto;
      right: 18px;
      top: 12px;
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 0;
      background: transparent;
      backdrop-filter: none;
      color: rgba(255, 255, 255, 0.9);
      font-size: 18px;
      font-weight: 400;
    }
    .panel-tooltip--country .panel-tooltip-dual {
      gap: 0;
      padding: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--np-card-bg);
    }
    .panel-tooltip--country .panel-tooltip-stat {
      min-height: 92px;
      padding: 16px 16px 14px;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .panel-tooltip--country .panel-tooltip-stat:first-child {
      border-right: 1px solid rgba(255, 255, 255, 0.12);
    }
    .panel-tooltip--country .panel-tooltip-stat-head {
      gap: 8px;
      margin-bottom: 8px;
    }
    .panel-tooltip--country .panel-tooltip-stat-icon {
      color: rgba(189, 198, 211, 0.78);
      font-size: 16px;
      line-height: 1;
      transform: translateY(-1px);
    }
    .panel-tooltip--country .panel-tooltip-stat-label {
      color: rgba(185, 193, 208, 0.8);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.1em;
    }
    .panel-tooltip--country .panel-tooltip-stat-value {
      margin-top: 0;
      color: #ffffff;
      font-size: clamp(28px, 4.4vw, 42px);
      font-weight: 400;
      line-height: 1;
    }
    .panel-tooltip--country .panel-tooltip-stat-sub {
      color: rgba(185, 193, 208, 0.5);
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.2;
    }
    .panel-tooltip--country .panel-tooltip-footer {
      display: block;
      margin: 0;
      padding: 16px 16px 18px;
      border: 0;
      border-radius: 0;
      background: var(--np-card-bg);
    }
    .panel-tooltip--country .panel-tooltip-total-label {
      color: rgba(185, 193, 208, 0.76);
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0.09em;
    }
    .panel-tooltip--country .panel-tooltip-total-value {
      margin-top: 8px;
      color: #ffffff;
      font-family: inherit;
      font-size: clamp(34px, 4vw, 44px);
      font-weight: 400;
      line-height: 1;
    }
    .panel-tooltip--country .panel-tooltip-total {
      width: 100%;
    }
    .panel-tooltip--country .panel-tooltip-more {
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
    }
    @media (max-width: 980px) {
      #globe-breadcrumbs {
        left: var(--globe-breadcrumb-left-compact);
        top: var(--globe-breadcrumb-top-compact);
        max-width: min(420px, calc(100vw - 28px));
      }
      #country-panel { right: 18px !important; bottom: 36px !important; width: min(324px, calc(100vw - 36px)); max-height: 74vh; }
      .panel-tooltip-header { min-height: 148px; }
      .panel-tooltip-headcopy { padding-top: 52px; }
      .panel-tooltip-header--country { min-height: 132px; }
      .panel-tooltip-headcopy--country { min-height: 132px; padding: 38px 16px 16px; }
      .panel-tooltip-country-heading { gap: 10px; }
      .panel-tooltip-title--country { font-size: clamp(22px, 2.35vw, 36px); }
      .panel-tooltip-country-flag { width: 46px; height: 46px; }
      .panel-tooltip--country .panel-tooltip-live { font-size: 10px; }
      .panel-tooltip--country .panel-tooltip-stat { min-height: 92px; padding: 16px 16px 14px; }
      .panel-tooltip--country .panel-tooltip-stat-head { margin-bottom: 8px; }
      .panel-tooltip--country .panel-tooltip-stat-label { font-size: 11px; }
      .panel-tooltip--country .panel-tooltip-stat-value { font-size: clamp(28px, 4vw, 40px); }
      .panel-tooltip--country .panel-tooltip-stat-sub { margin-top: 6px; font-size: 11px; }
      .panel-tooltip--country .panel-tooltip-footer { padding: 16px 16px 18px; }
      .panel-tooltip--country .panel-tooltip-total-label { font-size: 13px; }
      .panel-tooltip--country .panel-tooltip-total-value { font-size: clamp(34px, 4vw, 42px); }
    }
    @media (max-width: 720px) {
      #globe-breadcrumbs {
        display: none !important;
      }
      #country-panel {
        left: 0 !important;
        right: 0 !important;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 12px) !important;
        width: auto;
        max-height: none;
        padding: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        border-left: 0;
        border-right: 0;
        border-bottom: 0;
        background: var(--np-card-bg);
        box-shadow: none;
      }
      #country-panel.is-visible:hover {
        border-color: rgba(255, 255, 255, 0.14);
        box-shadow: none;
      }
      .panel-tooltip--country {
        background: var(--np-card-bg);
      }
      .panel-tooltip-header { min-height: 136px; }
      .panel-tooltip-headcopy { padding: 50px 16px 16px; }
      .panel-tooltip-live { gap: 6px; font-size: 11px; letter-spacing: 0.55px; }
      .panel-tooltip-dual { grid-template-columns: 1fr; }
      .panel-tooltip-stat { padding: 14px 16px; }
      .panel-tooltip-stat:first-child { border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
      .panel-tooltip-stat-sub { font-size: 13px; }
      .panel-tooltip-footer { padding: 12px 16px; }
      .panel-tooltip-header--country {
        min-height: 0;
        background: var(--np-card-bg);
      }
      .panel-tooltip-headcopy--country { min-height: 0; padding: 18px 56px 12px 14px; }
      .panel-tooltip-country-topline { align-items: center; gap: 12px; }
      .panel-tooltip-country-heading { gap: 6px; }
      .panel-tooltip-country-flag {
        width: 40px;
        height: 40px;
        box-shadow: none;
      }
      .panel-tooltip-title--country {
        max-width: 100%;
        font-family: "Optima","Palatino Linotype","Book Antiqua","Times New Roman",serif;
        font-size: 16px;
        font-weight: 400;
        line-height: 1.2;
        letter-spacing: 0;
        text-shadow: none;
      }
      .panel-tooltip--country .panel-tooltip-live {
        gap: 6px;
        font-size: 10px;
        letter-spacing: 0.072em;
        color: rgba(185, 193, 208, 0.74);
      }
      .panel-tooltip--country .panel-tooltip-live-dot {
        width: 6px;
        height: 6px;
      }
      .panel-tooltip--country .panel-tooltip-close {
        right: 14px;
        top: 14px;
        width: 36px;
        height: 36px;
        font-size: 22px;
      }
      .panel-tooltip-country-subtitle { display: none; }
      .panel-tooltip--country .panel-tooltip-dual {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0;
        padding: 0;
        border-top-color: rgba(255, 255, 255, 0.1);
        border-bottom-color: rgba(255, 255, 255, 0.1);
        background: var(--np-card-bg);
      }
      .panel-tooltip--country .panel-tooltip-stat { min-height: 84px; padding: 14px 14px 12px; border-radius: 0; }
      .panel-tooltip--country .panel-tooltip-stat:first-child { border-bottom: 0; }
      .panel-tooltip--country .panel-tooltip-stat-head { gap: 8px; margin-bottom: 10px; }
      .panel-tooltip--country .panel-tooltip-stat-icon { font-size: 16px; }
      .panel-tooltip--country .panel-tooltip-stat-label {
        font-size: 10px;
        letter-spacing: 0.12em;
        color: rgba(185, 193, 208, 0.72);
      }
      .panel-tooltip--country .panel-tooltip-stat-value {
        margin-top: 0;
        font-family: inherit;
        font-size: 17px;
        font-weight: 400;
        line-height: 1.05;
      }
      .panel-tooltip--country .panel-tooltip-stat-sub {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.15;
        color: rgba(185, 193, 208, 0.54);
      }
      .panel-tooltip--country .panel-tooltip-footer {
        margin: 0;
        padding: 12px 14px 14px;
        background: var(--np-card-bg);
      }
      .panel-tooltip--country .panel-tooltip-total-label {
        font-size: 10px;
        letter-spacing: 0.1em;
        color: rgba(185, 193, 208, 0.72);
      }
      .panel-tooltip--country .panel-tooltip-total-value {
        margin-top: 8px;
        font-family: inherit;
        font-size: 17px;
        font-weight: 600;
        line-height: 1.05;
      }
      .panel-tooltip--country .panel-tooltip-more { min-height: 36px; min-width: 84px; padding: 0 14px; font-size: 11px; }
    }
    @media (max-width: 520px) {
      #country-panel {
        left: 0 !important;
        right: 0 !important;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 12px) !important;
        width: auto;
        max-height: none;
      }
      .panel-tooltip-header { min-height: 0; flex-direction: column; }
      .panel-tooltip-headcopy { padding: 44px 14px 14px; }
      .panel-tooltip-flagbox { width: 100%; flex-basis: 76px; border-left: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); background-size: 72px auto; }
      .panel-tooltip-stat { padding: 12px 14px; }
      .panel-tooltip-primary-sub,
      .panel-tooltip-stat-sub,
      .panel-tooltip-footer-note { font-size: 12px; }
      .panel-tooltip-header--country { min-height: 0; flex-direction: column; }
      .panel-tooltip-headcopy--country { min-height: 0; padding: 18px 56px 12px 14px; }
      .panel-tooltip-country-topline { gap: 10px; }
      .panel-tooltip-country-flag { width: 38px; height: 38px; }
      .panel-tooltip--country .panel-tooltip-dual { padding: 0; gap: 0; }
      .panel-tooltip--country .panel-tooltip-stat { min-height: 80px; padding: 10px 10px 9px; }
      .panel-tooltip--country .panel-tooltip-stat-label { font-size: 10px; }
      .panel-tooltip--country .panel-tooltip-stat-value { font-size: 16px; }
      .panel-tooltip--country .panel-tooltip-stat-sub { font-size: 10px; }
      .panel-tooltip--country .panel-tooltip-footer { margin: 0; padding: 10px 12px 12px; gap: 10px; }
      .panel-tooltip--country .panel-tooltip-total-value { font-size: 16px; }
      .panel-tooltip--country .panel-tooltip-more { min-height: 32px; min-width: 72px; font-size: 10px; }
    }

    /* ── heroLayout=shifted: bottom-left compact card ──────────────────── */
    #globe-ui[data-hero-layout="shifted"] #country-panel {
      left: var(--np-card-left) !important;
      right: auto !important;
      bottom: 200px !important;
      width: auto;
      min-width: 320px;
      max-width: min(420px, calc(100vw - 52px));
      padding: 0;
      margin: 0 !important;
    }
    @media (max-width: 980px) {
      #globe-ui[data-hero-layout="shifted"] #country-panel {
        left: var(--np-card-left-mobile) !important;
        bottom: 36px !important;
        min-width: 260px;
        max-width: min(324px, calc(100vw - 36px));
      }
    }

    .panel-tooltip--compact {
      position: relative;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: var(--np-card-padding-y) var(--np-card-padding-x);
      min-width: 320px;
      background: var(--np-card-bg);
    }
    .panel-tooltip--compact .panel-tooltip-close {
      position: absolute;
      top: 10px;
      right: 12px;
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.55);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 4px 6px;
      transition: color 0.15s ease;
    }
    .panel-tooltip--compact .panel-tooltip-close:hover { color: #ffffff; }
    .panel-tooltip--compact .panel-tooltip-country-flag {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      border-radius: 50%;
      background-size: cover;
      margin-right: 14px;
      box-shadow: 0 10px 22px -16px rgba(0, 0, 0, 0.6);
    }
    .panel-tooltip-country-name {
      font-family: 'Cormorant Garamond', 'Optima', Georgia, serif;
      font-size: 28px;
      font-weight: 500;
      color: #ffffff;
      letter-spacing: -0.005em;
      padding-top: 2px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 720px) {
      .panel-tooltip--compact {
        padding: var(--np-card-padding-y-mobile) var(--np-card-padding-x-mobile);
        min-width: 0;
        gap: 12px;
      }
      .panel-tooltip--compact .panel-tooltip-country-flag {
        width: 32px;
        height: 32px;
        flex-basis: 32px;
        margin-right: 10px;
      }
      .panel-tooltip-country-name { font-size: 22px; }
    }
  `
  document.head.appendChild(style)
}

function getOrCreateUiRoot() {
  let uiRoot = document.getElementById(UI_ROOT_ID) as HTMLDivElement | null
  if (!uiRoot) {
    uiRoot = document.createElement('div')
    uiRoot.id = UI_ROOT_ID
    document.body.appendChild(uiRoot)
  }
  return uiRoot
}

function sanitizeOffset(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function applyUiLayoutVars() {
  const uiRoot = getOrCreateUiRoot()
  const compactLeft = Math.max(14, breadcrumbOffsetLeft - 8)
  const compactTop = Math.max(40, breadcrumbOffsetTop - 52)
  uiRoot.style.setProperty('--globe-breadcrumb-left', `${breadcrumbOffsetLeft}px`)
  uiRoot.style.setProperty('--globe-breadcrumb-top', `${breadcrumbOffsetTop}px`)
  uiRoot.style.setProperty('--globe-breadcrumb-left-compact', `${compactLeft}px`)
  uiRoot.style.setProperty('--globe-breadcrumb-top-compact', `${compactTop}px`)
}

function getOrCreateBreadcrumbs() {
  const uiRoot = getOrCreateUiRoot()
  let breadcrumbs = document.getElementById(BREADCRUMBS_ID) as HTMLDivElement | null
  if (!breadcrumbs) {
    breadcrumbs = document.createElement('div')
    breadcrumbs.id = BREADCRUMBS_ID
    breadcrumbs.setAttribute('aria-label', 'Breadcrumb navigation')
    uiRoot.appendChild(breadcrumbs)
  }
  return breadcrumbs
}

function getOrCreatePanel() {
  const uiRoot = getOrCreateUiRoot()
  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null
  if (!panel) {
    panel = document.createElement('div')
    panel.id = PANEL_ID
    uiRoot.appendChild(panel)
  }
  return panel
}

function getOrCreateFocusDim() {
  let focusDim = document.getElementById(FOCUS_DIM_ID) as HTMLDivElement | null
  if (!focusDim) {
    focusDim = document.createElement('div')
    focusDim.id = FOCUS_DIM_ID
    document.body.appendChild(focusDim)
  }
  return focusDim
}

export function ensureCountryPanelScaffold() {
  ensureStyles()
  getOrCreateUiRoot()
  applyUiLayoutVars()
  applyHeroLayoutAttr()
  getOrCreateBreadcrumbs()
  getOrCreatePanel()
  getOrCreateFocusDim()
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('`', '&#96;')
}

function renderBreadcrumbs() {
  const breadcrumbs = document.getElementById(BREADCRUMBS_ID) as HTMLDivElement | null
  if (!breadcrumbs) return

  breadcrumbs.style.display = showBreadcrumbs && currentBreadcrumbs.length > 0 ? 'flex' : 'none'
  if (!showBreadcrumbs || currentBreadcrumbs.length === 0) {
    breadcrumbs.innerHTML = ''
    return
  }

  breadcrumbs.innerHTML = currentBreadcrumbs
    .map((item, index) => {
      const isLast = index === currentBreadcrumbs.length - 1
      const crumb = isLast
        ? `<span class="globe-breadcrumb__current" aria-current="page">${escapeHtml(item.label)}</span>`
        : `<button type="button" class="globe-breadcrumb__button" data-breadcrumb-id="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>`
      const separator =
        index < currentBreadcrumbs.length - 1
          ? '<span class="globe-breadcrumb__separator" aria-hidden="true">&rsaquo;</span>'
          : ''
      return `<span class="globe-breadcrumb">${crumb}${separator}</span>`
    })
    .join('')
}

function normalizeCssLength(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}px` : undefined
  }
  const trimmed = String(value).trim()
  if (!trimmed) return undefined
  // Bare numeric strings (e.g. "24") become pixels. Anything with a unit / fn
  // (e.g. "6%", "calc(...)", "24px") passes through as-is.
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed
}

function applyCardThemeVars(options: {
  cardBorderColor?: string
  cardBorderWidth?: number
  cardBackground?: string
  cardBackgroundColor?: string
  accentColor?: string
  cardLeftOffset?: string | number
  cardLeftOffsetMobile?: string | number
  cardPaddingX?: string | number
  cardPaddingY?: string | number
  cardPaddingXMobile?: string | number
  cardPaddingYMobile?: string | number
}) {
  const root = document.getElementById(UI_ROOT_ID)
  if (!root) return
  if (options.accentColor) {
    root.style.setProperty('--np-accent', options.accentColor)
  }
  if (options.cardBorderColor) {
    root.style.setProperty('--np-border-color', options.cardBorderColor)
  }
  if (options.cardBorderWidth !== undefined && Number.isFinite(options.cardBorderWidth)) {
    root.style.setProperty('--np-border-width', `${Math.max(0, options.cardBorderWidth)}px`)
  }
  const bg = options.cardBackgroundColor ?? options.cardBackground
  if (bg) {
    root.style.setProperty('--np-card-bg', bg)
  }
  const left = normalizeCssLength(options.cardLeftOffset)
  if (left) {
    root.style.setProperty('--np-card-left', left)
    // When only the desktop offset is provided, mirror it to mobile so the
    // user gets a single coherent placement unless they opt into a separate
    // mobile value via cardLeftOffsetMobile.
    if (options.cardLeftOffsetMobile === undefined) {
      root.style.setProperty('--np-card-left-mobile', left)
    }
  }
  const leftMobile = normalizeCssLength(options.cardLeftOffsetMobile)
  if (leftMobile) {
    root.style.setProperty('--np-card-left-mobile', leftMobile)
  }
  const paddingX = normalizeCssLength(options.cardPaddingX)
  if (paddingX) {
    root.style.setProperty('--np-card-padding-x', paddingX)
    if (options.cardPaddingXMobile === undefined) {
      root.style.setProperty('--np-card-padding-x-mobile', paddingX)
    }
  }
  const paddingY = normalizeCssLength(options.cardPaddingY)
  if (paddingY) {
    root.style.setProperty('--np-card-padding-y', paddingY)
    if (options.cardPaddingYMobile === undefined) {
      root.style.setProperty('--np-card-padding-y-mobile', paddingY)
    }
  }
  const paddingXMobile = normalizeCssLength(options.cardPaddingXMobile)
  if (paddingXMobile) {
    root.style.setProperty('--np-card-padding-x-mobile', paddingXMobile)
  }
  const paddingYMobile = normalizeCssLength(options.cardPaddingYMobile)
  if (paddingYMobile) {
    root.style.setProperty('--np-card-padding-y-mobile', paddingYMobile)
  }
}

export function configureGlobeUi(options: {
  showBreadcrumbs?: boolean
  showCountryCardCloseButton?: boolean
  breadcrumbOffsetLeft?: number
  breadcrumbOffsetTop?: number
  cardBorderColor?: string
  cardBorderWidth?: number
  cardBackground?: string
  cardBackgroundColor?: string
  accentColor?: string
  heroLayout?: 'shifted' | 'centered'
  cardLeftOffset?: string | number
  cardLeftOffsetMobile?: string | number
  cardPaddingX?: string | number
  cardPaddingY?: string | number
  cardPaddingXMobile?: string | number
  cardPaddingYMobile?: string | number
} = {}) {
  showBreadcrumbs = options.showBreadcrumbs !== false
  showCountryCardCloseButton = options.showCountryCardCloseButton !== false
  breadcrumbOffsetLeft = sanitizeOffset(options.breadcrumbOffsetLeft, DEFAULT_BREADCRUMB_OFFSET_LEFT)
  breadcrumbOffsetTop = sanitizeOffset(options.breadcrumbOffsetTop, DEFAULT_BREADCRUMB_OFFSET_TOP)
  if (options.heroLayout === 'centered' || options.heroLayout === 'shifted') {
    heroLayout = options.heroLayout
  }
  ensureCountryPanelScaffold()
  applyHeroLayoutAttr()
  applyCardThemeVars(options)
  renderBreadcrumbs()
}

export function getHeroLayout(): 'shifted' | 'centered' {
  return heroLayout
}

function applyHeroLayoutAttr() {
  const uiRoot = getOrCreateUiRoot()
  uiRoot.dataset.heroLayout = heroLayout
}

export function setGlobeBreadcrumbs(items: GlobeBreadcrumbItem[]) {
  currentBreadcrumbs = items.length > 0
    ? items
    : [
        { id: 'home', label: 'Home' },
        { id: 'map', label: 'Map' }
      ]
  ensureCountryPanelScaffold()
  renderBreadcrumbs()
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) return
    const button = event.target.closest('[data-breadcrumb-id]') as HTMLButtonElement | null
    if (!button) return
    const levelId = button.dataset.breadcrumbId
    if (!levelId) return
    window.dispatchEvent(new CustomEvent('navpass:breadcrumb-select', { detail: { levelId } }))
  })
}

function resolveFlagUrl(iso2: string) {
  const base = String((globalThis as any).__NAVPASS_GLOBE_ASSET_BASE_URL ?? '').replace(/\/+$/, '')
  return base ? `${base}/flags/${iso2.toLowerCase()}.svg` : `/flags/${iso2.toLowerCase()}.svg`
}

function getCountryIso2(props: any) {
  const candidates = [
    props?.ISO_A2,
    props?.ISO_A2_EH,
    props?.WB_A2
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length === 2 && value !== '-99') {
      return value
    }
  }
  return ''
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatInt(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

type CountryFlightStats = {
  now: number
  tenMinAgo: number
  routes?: number
  incoming?: number
  outgoing?: number
  dayTotal?: number
  dayIncoming?: number
  dayOutgoing?: number
  over?: number
  /** Number of airports physically located in this country. */
  airports?: number
}

export type CountryPanelMode = 'selected' | 'hover'

type RouteHoverPanelData = {
  flightName?: string
  from: string
  to: string
  distanceKm: number | null
  trafficCount: number | null
}

function showPanel(panelHtml: string) {
  ensureCountryPanelScaffold()
  const panel = getOrCreatePanel()
  const globeUi = getOrCreateUiRoot()
  panel.innerHTML = panelHtml
  requestAnimationFrame(() => {
    panel.classList.add('is-visible')
    globeUi.classList.add('expanded')
  })
}

export function showCountryPanel(
  props: any,
  flights?: CountryFlightStats | null,
  mode: CountryPanelMode = 'selected'
) {
  const isHoverMode = mode === 'hover'

  const name =
    props.NAME_LONG ||
    props.NAME_EN ||
    props.ADMIN ||
    props.NAME ||
    'Unknown country'

  const iso2 = getCountryIso2(props)

  const incomingFlights = Number.isFinite(flights?.incoming) ? Number(flights?.incoming) : null
  const outgoingFlights = Number.isFinite(flights?.outgoing) ? Number(flights?.outgoing) : null
  const overFlights = Number.isFinite(flights?.over) ? Number(flights?.over) : null
  const incomingFlightsLabel = formatInt(incomingFlights)
  const outgoingFlightsLabel = formatInt(outgoingFlights)
  // "TOTAL FLIGHTS OVER COUNTRY" = all routes touching the country's airspace:
  // arrivals + departures + transiting overflights.
  const totalFlightsOverCountry =
    incomingFlights !== null || outgoingFlights !== null || overFlights !== null
      ? (incomingFlights ?? 0) + (outgoingFlights ?? 0) + (overFlights ?? 0)
      : null
  const totalFlightsOverCountryLabel = formatInt(totalFlightsOverCountry)

  const flagUrl =
    iso2 && typeof iso2 === 'string' && iso2.length === 2 && iso2 !== '-99'
      ? resolveFlagUrl(iso2)
      : ''

  const closeButton = isHoverMode || !showCountryCardCloseButton
    ? ''
    : '<button type="button" class="panel-tooltip-close" aria-label="Close">×</button>'
  const liveLabel = isHoverMode ? 'HOVER PREVIEW' : ''
  const countryCardStyle = flagUrl ? ` style="--country-flag-bg:url('${flagUrl}')"` : ''
  const flagBubbleClass = flagUrl
    ? 'panel-tooltip-country-flag'
    : 'panel-tooltip-country-flag panel-tooltip-country-flag--empty'

  if (!isHoverMode && heroLayout === 'shifted') {
    const compactCardStyle = flagUrl ? ` style="--country-flag-bg:url('${flagUrl}')"` : ''
    showPanel(`
      <div class="panel-tooltip panel-tooltip--country panel-tooltip--compact"${compactCardStyle}>
        ${closeButton}
        <span class="panel-tooltip-country-name">${escapeHtml(name)}</span>
        <div class="${flagBubbleClass}" aria-hidden="true"></div>
      </div>
    `)
    const panel = getOrCreatePanel()
    const closeButtonEl = panel.querySelector('.panel-tooltip-close') as HTMLButtonElement | null
    if (closeButtonEl) {
      closeButtonEl.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navpass:close-country-panel'))
      })
    }
    return
  }

  showPanel(`
    <div class="panel-tooltip panel-tooltip--country"${countryCardStyle}>
      <div class="panel-tooltip-header panel-tooltip-header--country">
        ${closeButton}
        <div class="panel-tooltip-headcopy panel-tooltip-headcopy--country">
          <div class="panel-tooltip-country-topline">
            <div class="panel-tooltip-country-heading">
              <div class="panel-tooltip-title panel-tooltip-title--country">${escapeHtml(name)}</div>
              ${liveLabel ? `<div class="panel-tooltip-live">
                <span class="panel-tooltip-live-dot"></span>
                <span>${escapeHtml(liveLabel)}</span>
              </div>` : ''}
            </div>
            <div class="${flagBubbleClass}" aria-hidden="true"></div>
          </div>
        </div>
      </div>

      <div class="panel-tooltip-dual">
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-head">
            <span class="panel-tooltip-stat-icon" aria-hidden="true">↙</span>
            <div class="panel-tooltip-stat-label">Incoming</div>
          </div>
          <div class="panel-tooltip-stat-value">${escapeHtml(incomingFlightsLabel)}</div>
          <div class="panel-tooltip-stat-sub">Flights Active</div>
        </div>
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-head">
            <span class="panel-tooltip-stat-icon" aria-hidden="true">↗</span>
            <div class="panel-tooltip-stat-label">Outgoing</div>
          </div>
          <div class="panel-tooltip-stat-value">${escapeHtml(outgoingFlightsLabel)}</div>
          <div class="panel-tooltip-stat-sub">Flights Active</div>
        </div>
      </div>

      <div class="panel-tooltip-footer">
        <div class="panel-tooltip-total">
          <div class="panel-tooltip-total-label">TOTAL FLIGHTS OVER COUNTRY</div>
          <div class="panel-tooltip-total-value">${escapeHtml(totalFlightsOverCountryLabel)}</div>
        </div>
      </div>
    </div>
  `)

  if (!isHoverMode) {
    const panel = getOrCreatePanel()
    const closeButtonEl = panel.querySelector('.panel-tooltip-close') as HTMLButtonElement | null
    closeButtonEl?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent('navpass:close-country-panel'))
    })
  }
}

export function showRouteHoverPanel(data: RouteHoverPanelData) {
  const flightName = escapeHtml(data.flightName || 'Tracked Flight')
  const from = escapeHtml(data.from || 'Origin')
  const to = escapeHtml(data.to || 'Destination')
  const distanceText =
    typeof data.distanceKm === 'number' && Number.isFinite(data.distanceKm)
      ? `${Math.round(data.distanceKm).toLocaleString('en-US')} km`
      : '— km'
  const trafficText =
    typeof data.trafficCount === 'number' && Number.isFinite(data.trafficCount)
      ? `${Math.max(1, Math.round(data.trafficCount)).toLocaleString('en-US')}`
      : '—'

  showPanel(`
    <div class="panel-tooltip">
      <div class="panel-tooltip-header">
        <div class="panel-tooltip-headcopy">
          <div class="panel-tooltip-title">${flightName}</div>
          <div class="panel-tooltip-live">
            <span class="panel-tooltip-live-dot"></span>
            <span>Hover Preview</span>
          </div>
        </div>
        <div class="panel-tooltip-flagbox panel-tooltip-flagbox--empty"></div>
      </div>

      <div class="panel-tooltip-dual">
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">FLIGHT DISTANCE</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(distanceText)}</div>
          <div class="panel-tooltip-stat-sub">Great-circle estimate</div>
        </div>
        <div class="panel-tooltip-stat">
          <div class="panel-tooltip-stat-label">TRAFFIC LEVEL</div>
          <div class="panel-tooltip-stat-value">${escapeHtml(trafficText)}</div>
          <div class="panel-tooltip-stat-sub">Active planes on flight</div>
        </div>
      </div>

      <div class="panel-tooltip-primary">
        <div class="panel-tooltip-primary-label">Flight</div>
        <div class="panel-tooltip-primary-value">${from} → ${to}</div>
        <div class="panel-tooltip-primary-sub">Synthetic flight path</div>
      </div>

      <div class="panel-tooltip-footer">
        <div class="panel-tooltip-footer-note">Status</div>
        <div class="panel-tooltip-footer-note">Tracked</div>
      </div>
    </div>
  `)
}

export function hideCountryPanel() {
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null
  const globeUi = document.getElementById(UI_ROOT_ID) as HTMLDivElement | null
  if (!panel) return
  panel.classList.remove('is-visible')
  globeUi?.classList.remove('expanded')
}

export function showFocusDim() {
  const focusDim = getOrCreateFocusDim()
  focusDim.style.opacity = '0'
}

export function hideFocusDim() {
  const focusDim = document.getElementById(FOCUS_DIM_ID) as HTMLDivElement | null
  if (focusDim) focusDim.style.opacity = '0'
}

export function setFocusDimOpacity(value: number) {
  const focusDim = getOrCreateFocusDim()
  void value
  focusDim.style.opacity = '0'
}
