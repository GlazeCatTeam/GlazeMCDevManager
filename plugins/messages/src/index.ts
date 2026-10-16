import { definePlugin } from "@glaze/plugin-sdk";
import { MessagesPage } from "./MessagesPage";

export { MessagesPage };

export default definePlugin({ pages: { messages: MessagesPage } });
