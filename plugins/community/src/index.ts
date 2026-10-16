import { definePlugin } from "@glaze/plugin-sdk";
import { CommentsPage } from "./CommentsPage";
import { FeedbackPage } from "./FeedbackPage";

export { CommentsPage, FeedbackPage };

export default definePlugin({ pages: { feedback: FeedbackPage, comments: CommentsPage } });
