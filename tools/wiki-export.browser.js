// Browser snippet: run on any slaythespire.wiki.gg page (same origin as the API).
// Pulls every Slay the Spire 2 Cargo table, cleans the wikitext, and exposes
// window.__show(table, start, count), which replaces the page body with one chunk of
// rows so it can be read with a page-text tool. Each chunk starts with a header line:
//   #CHUNK table=<t> start=<s> count=<c> total=<n> sum=<checksum>
// Rows: fields joined by "|", empty field = "∅". Verify copies with tools/checksum.mjs.
(async () => {
  const TABLES = {
    Cards: 'Name,Color,OverrideColor,Type,Rarity,Cost,CostPlus,StarCost,NoUpgrade,MultiplayerOnly,Tags,Description',
    Enemies: 'Name,Type,HP,AscHP,Debut,Powers',
    Encounters: 'Name,Act,Type,Enemies',
    Intents: 'Enemy,Name,Effect',
    Relics: 'Name,Rarity,ExclusiveTo,AncientSource,EventSource,Cost,Requirements,Tags,Description',
    Potions: 'Name,Rarity,ExclusiveTo,Description',
    Powers: 'Name,Type,ObtainableBy,Stacks,BetweenTurns,Cap,Description',
  };
  const clean = (d) =>
    String(d ?? '')
      .replace(/<span[^>]*data-name\s*=\s*['"]@ST['"][^>]*>.*?<\/span>/g, '[STAR]')
      .replace(/<span[^>]*data-name\s*=\s*['"]@[A-Z]E['"][^>]*>.*?<\/span>/g, '[E]')
      .replace(/<br\s*\/?>/gi, ' / ')
      .replace(/\[\[File:[^\]]*\]\]/g, '')
      .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/'''?/g, '')
      .replace(/\|/g, '¦')
      .replace(/\s+/g, ' ')
      .trim();
  const data = {};
  for (const [table, fields] of Object.entries(TABLES)) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const q = new URLSearchParams({
        action: 'cargoquery', tables: table, fields, where: 'Game="2"',
        order_by: 'Name', limit: '500', offset: String(offset), format: 'json',
      });
      const res = await fetch('/api.php?' + q).then((r) => r.json());
      const batch = (res.cargoquery || []).map((x) => x.title);
      for (const r of batch) rows.push(fields.split(',').map((f) => clean(r[f]) || '∅').join('|'));
      if (batch.length < 500) break;
    }
    data[table] = rows;
  }
  const checksum = (text) => {
    let s = 0;
    for (let i = 0; i < text.length; i++) s = (s + text.charCodeAt(i) * ((i % 31) + 1)) % 1000000007;
    return s;
  };
  window.__export = data;
  window.__show = (table, start, count) => {
    const rows = data[table].slice(start, start + count);
    const body = rows.join('\n');
    const header = `#CHUNK table=${table} start=${start} count=${rows.length} total=${data[table].length} sum=${checksum(body)}`;
    document.body.innerHTML = '';
    const el = document.createElement('article');
    el.style.whiteSpace = 'pre';
    el.textContent = header + '\n' + body;
    document.body.appendChild(el);
    return header;
  };
  return Object.entries(data).map(([t, r]) => `${t}=${r.length}`).join(' ');
})();
