import {
  defaultGeneral,
  type GeneralSettings,
  type GeneralState,
  type InitialRoute,
  isGeneralSettings,
  isRestorableRoute,
} from "@glaze/contracts";
import type { PreferenceStore } from "@glaze/storage";
import { CapabilityError } from "../ipc/errors";

export interface LoginItemState {
  supported: boolean;
  enabled: boolean;
  warning: string | null;
}

export interface GeneralSystem {
  readLoginItem: () => LoginItemState;
  setLoginItem: (enabled: boolean) => void;
  ensureTray: () => void;
}

/** Persist application behavior while keeping native startup state authoritative */
export class GeneralService {
  constructor(
    private readonly store: PreferenceStore,
    private readonly system: GeneralSystem,
  ) {}

  /** Window and route preferences can be read without querying Windows startup registration */
  preferences(): GeneralSettings {
    const value = this.store.get("general");
    return isGeneralSettings(value) ? value : { ...defaultGeneral };
  }

  /** Report external Windows startup changes instead of showing a stale saved switch */
  get(): GeneralState {
    const login = this.system.readLoginItem();
    return {
      settings: { ...this.preferences(), launchAtLogin: login.enabled },
      launchAtLoginSupported: login.supported,
      launchAtLoginWarning: login.warning,
    };
  }

  /** Verify native changes, persist preferences and compensate startup registration on failure */
  set(value: unknown): GeneralState {
    if (!isGeneralSettings(value)) throw new CapabilityError("validation", "通用设置无效");
    const previous = this.system.readLoginItem();
    if (!previous.supported && value.launchAtLogin) throw new CapabilityError("validation", "当前系统不支持开机自启");
    if (value.closeAction === "tray") this.system.ensureTray();
    const changed = previous.enabled !== value.launchAtLogin;
    try {
      if (changed) {
        this.system.setLoginItem(value.launchAtLogin);
        const actual = this.system.readLoginItem();
        if (actual.enabled !== value.launchAtLogin) throw new Error(actual.warning ?? "Windows 未应用开机自启设置");
      }
      const settings = {
        launchAtLogin: value.launchAtLogin,
        startPage: value.startPage,
        closeAction: value.closeAction,
      };
      this.store.set("general", settings);
      return {
        settings,
        launchAtLoginSupported: previous.supported,
        launchAtLoginWarning: changed ? null : previous.warning,
      };
    } catch (error) {
      if (changed) {
        try {
          this.system.setLoginItem(previous.enabled);
          if (this.system.readLoginItem().enabled !== previous.enabled) throw new Error("启动项回退未生效");
        } catch {
          throw new CapabilityError("internal", "保存失败，Windows 启动项未能恢复，请重新读取并检查开机自启状态");
        }
      }
      throw error;
    }
  }

  /** Honor authentication routing before applying the selected startup page */
  initialRoute(auth: InitialRoute): InitialRoute {
    if (auth.route !== "glaze.home/home") return auth;
    const { startPage } = this.preferences();
    const last = this.store.get("lastRoute");
    const route =
      startPage === "works"
        ? "glaze.works/works"
        : startPage === "last" && isRestorableRoute(last)
          ? last
          : "glaze.home/home";
    return { route, params: {} };
  }

  /** Record a safe page root only; do not persist route parameters or invalid entries */
  rememberRoute(route: unknown): void {
    if (!isRestorableRoute(route)) throw new CapabilityError("validation", "不能记住此页面");
    if (this.store.get("lastRoute") !== route) this.store.set("lastRoute", route);
  }
}
