import { describe, expect, it } from 'vitest';
import {
  buildFeedbackUrl,
  contextFooter,
  labelFor,
  MAX_URL_LENGTH,
  REPO_NEW_ISSUE_URL,
  TRUNCATION_NOTE,
} from './feedback';

const ctx = { gameVersion: 'v0.107.1', pageUrl: 'https://example.test/sim/?c=ironclad&x=1' };
const parse = (url: string) => new URL(url).searchParams;

describe('buildFeedbackUrl', () => {
  it('targets the new-issue page of this repo', () => {
    const url = buildFeedbackUrl({ type: 'issue', title: 't', description: 'd' }, ctx);
    expect(url.startsWith(`${REPO_NEW_ISSUE_URL}?`)).toBe(true);
  });

  it('uses bug for issues and enhancement for suggestions', () => {
    expect(labelFor('issue')).toBe('bug');
    expect(labelFor('suggestion')).toBe('enhancement');
    expect(parse(buildFeedbackUrl({ type: 'issue', title: 't', description: 'd' }, ctx)).get('labels')).toBe('bug');
    expect(parse(buildFeedbackUrl({ type: 'suggestion', title: 't', description: 'd' }, ctx)).get('labels')).toBe(
      'enhancement',
    );
  });

  it('encodes special characters and round-trips them', () => {
    const input = { type: 'issue' as const, title: 'A & B = "C" #1?', description: 'line1\nline2 & more=yes ünï 🎴' };
    const url = buildFeedbackUrl(input, ctx);
    expect(url).not.toMatch(/[ \n"#]/);
    const p = parse(url);
    expect(p.get('title')).toBe(input.title);
    expect(p.get('body')).toContain(input.description);
  });

  it('appends the context footer with version and page URL', () => {
    const body = parse(buildFeedbackUrl({ type: 'issue', title: 't', description: 'desc' }, ctx)).get('body')!;
    expect(body).toBe(`desc${contextFooter(ctx)}`);
    expect(body).toContain('App version: v0.107.1');
    expect(body).toContain(ctx.pageUrl);
  });

  it('caps the title at 120 characters', () => {
    const p = parse(buildFeedbackUrl({ type: 'issue', title: 'x'.repeat(200), description: 'd' }, ctx));
    expect(p.get('title')).toHaveLength(120);
  });

  it('keeps a long description under the URL limit, with a note and the footer', () => {
    const url = buildFeedbackUrl({ type: 'issue', title: 't', description: 'é & '.repeat(5000) }, ctx);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(url.length).toBeGreaterThan(MAX_URL_LENGTH - 50);
    const body = parse(url).get('body')!;
    expect(body).toContain(TRUNCATION_NOTE.trim());
    expect(body.endsWith(contextFooter(ctx))).toBe(true);
  });

  it('does not truncate a description that fits', () => {
    const body = parse(buildFeedbackUrl({ type: 'issue', title: 't', description: 'short' }, ctx)).get('body')!;
    expect(body).not.toContain('truncated');
  });
});
