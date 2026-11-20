const abbreviations = new Set(['np','tzn','tj','itd','itp','ul','al','dr','prof','inż','mgr','pkt','ust','art','r','ok','tys','mln','mld','zł','godz','nr','str','św','im','m.in','e.g','i.e','mr','mrs','ms','etc','vs']);
export function speechLanguage(locale: unknown): 'pl'|'en' { return locale === 'en' ? 'en' : 'pl' }
export function speechTag(locale: unknown): 'pl-PL'|'en-US' { return speechLanguage(locale) === 'en' ? 'en-US' : 'pl-PL' }
/** Verbatim sentence fragments; preserve decimal points and common abbreviations. */
export function sentenceParts(text: string): string[] {
  const out: string[]=[]; let start=0;
  for(let i=0;i<text.length;i++) {
    const ch=text[i]; if(!'.!?。！？\n'.includes(ch)) continue;
    if(ch==='.') {
      if(/\d/.test(text[i-1]??'') && /\d/.test(text[i+1]??'')) continue;
      const next=text[i+1]??'';
      if(next && /[\p{L}\p{N}]/u.test(next)) continue;
      const tail=text.slice(Math.max(start,i-32),i).match(/([\p{L}]+(?:\.[\p{L}]+)*)$/u)?.[1]??'';
      if(next && abbreviations.has(tail.toLowerCase()) && tail.toLowerCase()!=='zł') continue;
      if(next && /^\p{Lu}$/u.test(tail)) continue;
    }
    if(ch!== '\n' && '.!?。！？'.includes(text[i+1]??'') && i+1<text.length) continue;
    out.push(text.slice(start,i+1));start=i+1;
  }
  if(start<text.length) out.push(text.slice(start));return out;
}
