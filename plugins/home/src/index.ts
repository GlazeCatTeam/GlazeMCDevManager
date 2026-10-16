import { definePlugin } from "@glaze/plugin-sdk";
import { HomePage } from "./HomePage";

export { HomePage };

export default definePlugin({ pages: { home: HomePage } });
