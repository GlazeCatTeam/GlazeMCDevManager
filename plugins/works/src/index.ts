import { definePlugin } from "@glaze/plugin-sdk";
import { WorksPage } from "./WorksPage";
import { startWorksWarmup } from "./warmup";

export { startWorksWarmup, WorksPage };

export default definePlugin({ pages: { works: WorksPage }, activate: startWorksWarmup });
