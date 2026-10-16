export type ProjectLink = "homepage" | "feedback" | "reference" | "releases";

export interface ProjectLicense {
  id: string;
  name: string;
  summary: string;
  text: string;
  notice: string;
}

export interface AboutInfo {
  name: string;
  version: string;
  packaged: boolean;
  platform: string;
  arch: string;
  electron: string;
  chromium: string;
  node: string;
  projectLicense: ProjectLicense;
}

export interface DependencyLicense {
  name: string;
  version: string;
  license: string;
  notices: { file: string; text: string }[];
}
