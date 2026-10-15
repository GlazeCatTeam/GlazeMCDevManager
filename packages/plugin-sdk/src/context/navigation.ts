import { createContext, useContext } from "react";

export type RouteParams = Readonly<Record<string, string>>;

export interface Navigation {
  /** Active route key: <pluginId>/<pageId> */
  route: string;
  params: RouteParams;
  navigate: (route: string, params?: RouteParams) => void;
}

const NavigationContext = createContext<Navigation | null>(null);

/** Provided by the shell around every page */
export const NavigationProvider = NavigationContext.Provider;

/** Current route, its params, and a way to move to another page */
export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext);
  if (!navigation) {
    throw new Error("useNavigation must be used inside the shell's NavigationProvider");
  }
  return navigation;
}
