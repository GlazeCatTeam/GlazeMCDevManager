type EditorModule = typeof import("./editor/WorkDetailPage");
let loaded: EditorModule | null = null;
let pending: Promise<EditorModule> | null = null;

/** Split the full editor out of initial workbench code and share intent/click imports */
export function loadWorkEditor(): Promise<EditorModule> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("./editor/WorkDetailPage")
    .then((module) => {
      loaded = module;
      return module;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** Avoid a loading frame when the editor module was already prepared */
export function loadedWorkEditor(): EditorModule | null {
  return loaded;
}
