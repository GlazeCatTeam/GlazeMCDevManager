import { definePlugin } from "@glaze/plugin-sdk";
import { IncomePage } from "./IncomePage";

export { IncomePage };

export default definePlugin({ pages: { income: IncomePage } });
