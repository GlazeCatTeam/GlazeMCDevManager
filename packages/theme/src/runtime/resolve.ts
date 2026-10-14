/** Flat token map: token path -> raw value, which may contain {path} references */
export type TokenMap = Record<string, string>;

export interface ThemePackage {
  id: string;
  name: string;
  defaultVariant: string;
  tokens: {
    base: TokenMap;
    semantic: TokenMap;
    component: TokenMap;
  };
  variants?: Record<string, TokenMap>;
}

export interface ResolvedTheme {
  /** CSS variable name -> resolved value */
  vars: Record<string, string>;
  /** Token paths whose references could not be resolved */
  unresolved: string[];
}

const REF_PATTERN = /\{([^}]+)\}/g;

/** Convert a token path to its CSS variable name, e.g. action.primary.bg -> --g-action-primary-bg */
export function toCssVar(path: string): string {
  return `--g-${path.replaceAll(".", "-")}`;
}

/** Merge token layers with a variant and resolve all {path} references */
export function resolveTheme(theme: ThemePackage, variant: string = theme.defaultVariant): ResolvedTheme {
  const raw: TokenMap = {
    ...theme.tokens.base,
    ...theme.tokens.semantic,
    ...theme.tokens.component,
    ...theme.variants?.[variant],
  };
  const resolved = new Map<string, string | null>();
  const unresolved: string[] = [];

  const resolve = (path: string, stack: Set<string>): string | null => {
    const cached = resolved.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const value = raw[path];
    if (value === undefined || stack.has(path)) {
      return null;
    }
    stack.add(path);
    let failed = false;
    const result = value.replace(REF_PATTERN, (_match, ref: string) => {
      const refValue = resolve(ref, stack);
      if (refValue === null) {
        failed = true;
        return "";
      }
      return refValue;
    });
    stack.delete(path);
    const final = failed ? null : result;
    resolved.set(path, final);
    return final;
  };

  const vars: Record<string, string> = {};
  for (const path of Object.keys(raw)) {
    const value = resolve(path, new Set());
    if (value === null) {
      unresolved.push(path);
    } else {
      vars[toCssVar(path)] = value;
    }
  }
  return { vars, unresolved };
}

/** Write a theme's CSS variables onto the root element and mark the active theme */
export function applyTheme(
  theme: ThemePackage,
  variant: string = theme.defaultVariant,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const result = resolveTheme(theme, variant);
  for (const [name, value] of Object.entries(result.vars)) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = theme.id;
  root.dataset.variant = variant;
  return result;
}
