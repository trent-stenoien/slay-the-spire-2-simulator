/** Links to the Slay the Spire 2 wiki (slaythespire.wiki.gg). */
const WIKI_CARD_BASE = 'https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:';

/**
 * Wiki page URL for a card name. Spaces become underscores; everything else
 * is percent-encoded only where a path requires it. The wiki writes
 * apostrophes, parentheses, commas and colons literally, so those stay.
 */
export function cardWikiUrl(name: string): string {
  const title = encodeURIComponent(name.trim().replace(/\s+/g, '_')).replace(/%(2C|3A|26|2B)/g, (m) =>
    decodeURIComponent(m),
  );
  return WIKI_CARD_BASE + title;
}
