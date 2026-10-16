export interface DeveloperReply {
  content: string;
  createdAt: string;
}

/** Fields shared by the feedback and comment list/detail widgets */
export interface CommunityEntry {
  id: string;
  nickname: string;
  uid: string;
  work: string;
  content: string;
  createdAt: string;
  canReply: boolean;
  reply?: DeveloperReply;
  blockedReason?: string;
}

/** Platform comment adapted for display, with a formatted publish time */
export interface CommentEntry extends CommunityEntry {
  stars: number;
  tag: string;
}
