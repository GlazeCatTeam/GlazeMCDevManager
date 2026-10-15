import type { AccountErrorKind } from "@glaze/contracts";
import { describeError, type NeteaseError } from "@glaze/netease";

/** A capability failure with a kind the renderer can branch on; message is shown to the user */
export class CapabilityError extends Error {
  constructor(
    readonly kind: AccountErrorKind | "internal",
    message: string,
  ) {
    super(message);
  }
}

/** Turn a NetEase error into a capability error with a readable message */
export function fromNeteaseError(error: NeteaseError): CapabilityError {
  const kind = error.kind === "parse" ? "business" : error.kind;
  return new CapabilityError(kind, describeError(error));
}
