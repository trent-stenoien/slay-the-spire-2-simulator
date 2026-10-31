/** Builds the prefilled GitHub "New issue" URL for the feedback form. Pure: no DOM. */

export const REPO_NEW_ISSUE_URL = 'https://github.com/trent-stenoien/slay-the-spire-2-simulator/issues/new';
export const MAX_URL_LENGTH = 8000;
export const MAX_TITLE_LENGTH = 120;
export const TRUNCATION_NOTE = '\n\n[Description truncated: it was too long for a link.]';

export type FeedbackType = 'issue' | 'suggestion';

export interface FeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
}

export interface FeedbackContext {
  gameVersion: string;
  pageUrl: string;
}

export function labelFor(type: FeedbackType): string {
  return type === 'issue' ? 'bug' : 'enhancement';
}

export function contextFooter(ctx: FeedbackContext): string {
  return `\n\n---\nApp version: ${ctx.gameVersion}\nPage: ${ctx.pageUrl}`;
}

function assemble(input: FeedbackInput, body: string): string {
  const params = new URLSearchParams({
    title: input.title.trim().slice(0, MAX_TITLE_LENGTH),
    body,
    labels: labelFor(input.type),
  });
  return `${REPO_NEW_ISSUE_URL}?${params.toString()}`;
}

export function buildFeedbackUrl(input: FeedbackInput, ctx: FeedbackContext): string {
  const description = input.description.trim();
  const footer = contextFooter(ctx);
  const full = assemble(input, description + footer);
  if (full.length <= MAX_URL_LENGTH) return full;

  // Binary search for the longest description prefix that still fits with the note and footer.
  let lo = 0;
  let hi = description.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const url = assemble(input, description.slice(0, mid).trimEnd() + TRUNCATION_NOTE + footer);
    if (url.length <= MAX_URL_LENGTH) lo = mid;
    else hi = mid - 1;
  }
  return assemble(input, description.slice(0, lo).trimEnd() + TRUNCATION_NOTE + footer);
}
