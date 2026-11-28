import {accessibilityFacts,normalizeTree} from './tree.mjs';
import {restructuredDetail,paragraphContent,flowOnly} from './rules/html-structure.mjs';
// The tags whose elements inside a text-bearing element are its inline content (no boxes of their own).
export {phrasingTags} from './tree.mjs';
import {Parser} from 'parse5';
import {analyzeInput} from './analyze.mjs';

/** A deliberately small static-HTML adapter, with no DOM or browser dependency. */
export function analyzeHTML(html,options) {
  const {tree,diagnostics}=htmlBoxTree(html);
  return analyzeInput(tree,options,diagnostics);
}

/**
 * The HTML parser's restructurings of a document or single-root fragment (checklist F27, J1, J2) as W_HTML_RESTRUCTURED
 * warnings, without analyzing anything else. An adapter whose markup is re-serialized before the analysis (which loses
 * the source's structure) reads them from the markup as written; `line` is the element's data-src-line.
 */
export function htmlRestructurings(html,name='Page',{dom=false}={}) {
  const {root}=normalizeTree(htmlBoxTree(html).tree,name), out=[];
  // (An element the parser made — the empty <p> of a stray </p> — has no line: the last line before it in tree order,
  // the element whose block closed the paragraph.)
  let last;
  (function walk(box) {
    const own=Number(box.attributes?.['data-src-line']); if(Number.isSafeInteger(own)) last=own;
    // dom: the markup is built through the DOM API (an adapter's React or Vue template), where no parser restructures it:
    // a paragraph holding flow content is E_HTML_PARAGRAPH_CONTENT on that paragraph, and the empty <p> the parser
    // makes of its end tag is not reported.
    if(dom && box.paragraphFlow) out.push({...paragraphContent(box,box.paragraphFlow),...(Number.isSafeInteger(own) ? {line:own} : {})});
    if(box.restructured && !(dom && box.restructured==='implied' && box.tag==='p')) { const line=Number.isSafeInteger(own) ? own : last;
      out.push({code:'W_HTML_RESTRUCTURED',severity:'warning',box:box.label,path:box.path,tag:box.tag,rule:'html-structure',...restructuredDetail(box),...(box.restructured==='dropped' && ['body','html'].includes(box.tag) ? {atRoot:true} : {}),...(Number.isSafeInteger(line) ? {line} : {})}); }
    for(const child of box.children ?? []) walk(child);
  })(root);
  return out;
}

/** The box tree of a single-root HTML fragment (or a body root), and its adapter diagnostics. */
const presentationalTargets={
  width:new Set(['img','video','canvas','iframe','embed','object','input','table','td','th','col','colgroup','hr','source','svg','image','pre','applet','marquee']),
  height:new Set(['img','video','canvas','iframe','embed','object','input','table','td','th','tr','source','svg','image','applet','marquee']),
  bgcolor:new Set(['body','table','thead','tbody','tfoot','tr','td','th','marquee']),
  border:new Set(['img','object','table','input','embed','iframe']),
  // A text field's or select's width in characters, a rule's thickness, a font's size (HTML §15.3, §15.5).
  size:new Set(['input','select','hr','font','basefont']),
  color:new Set(['font','basefont','hr']),
  align:new Set(['caption','col','colgroup','div','h1','h2','h3','h4','h5','h6','hr','img','input','legend','object','embed','iframe','p','table','thead','tbody','tfoot','tr','td','th','applet','marquee']),
};
// The HTML attributes outside the modeled ones (the list below) that render on some element: presentational hints
// (HTML §15), the form controls' sizes and ranges, editing and shadow trees. Where one maps, it needs an adapter
// (Unknown). A name that is none of these and not modeled (a framework prop leaked to the DOM: placement, variant)
// renders nothing; CSS attribute selectors still see it (the box keeps its attributes).
const renderingAttributes=new Set([...Object.keys(presentationalTargets),'background','text','link','vlink','alink','cellpadding','cellspacing','frame','rules','valign','char','charoff','nowrap','hspace','vspace','noshade','clear','face','compact','frameborder','scrolling','marginwidth','marginheight','topmargin','leftmargin','rightmargin','bottommargin','cols','rows','wrap','span','start','reversed','multiple','min','max','low','high','optimum','step','open','contenteditable','is','slot','shadowrootmode','spellcheck','dirname']);
const presentationalInert=(tag,name)=>Object.hasOwn(presentationalTargets,name) && !presentationalTargets[name].has(tag);
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
// The start and end tags in the order the tree builder received them. The tree builder drives the tokenizer's states,
// so raw text (script, style, textarea) and foreign content are tokenized as a browser tokenizes them: a tag in the list
// is a tag the author wrote. Each start tag's offset matches its element's sourceCodeLocation.
class RecordingParser extends Parser {
  onStartTag(token) { this.tags?.push({start:true,name:token.tagName,at:token.location?.startOffset,self:token.selfClosing}); super.onStartTag(token); }
  onEndTag(token) { this.tags?.push({start:false,name:token.tagName}); super.onEndTag(token); }
}
const parse=(html,options,tags)=>{ const parser=new RecordingParser(options); parser.tags=tags; parser.tokenizer.write(html,true); return parser.document; };
const parseFragment=(html,options,tags)=>{ const parser=RecordingParser.getFragmentParser(null,options); parser.tags=tags; parser.tokenizer.write(html,true); return parser.getFragment(); };
// Table parts: outside a table (and a template) the parser ignores their start tags (HTML §13.2.6.4.7 "in body").
const tableParts=new Set(['caption','col','colgroup','tbody','td','tfoot','th','thead','tr']);
// Elements whose end tag may be omitted because a following start tag closes them: written around such a start tag
// (an li inside an li), they are closed by it and what was written inside becomes their next sibling. (p is reported
// through the empty p its stray end tag leaves.)
const autoClosing=new Set(['li','dt','dd','option','optgroup','td','th','tr','tbody','thead','tfoot','caption','colgroup','rb','rt','rtc','rp']);
export function htmlBoxTree(html) {
  if(typeof html!=='string' || html.length>1_000_000) throw new TypeError('Invalid HTML input');
  const diagnostics=[], tags=[];
  const unknown=message=>diagnostics.push({code:'U_LAYOUT_HTML',severity:'unknown',message});
  // A body element as the root: parse as a document and check from body (its attributes, such as aria-hidden, count).
  // An html element as the root (a whole document): its font-size is what rem resolves against. The head
  // (with no boxes) is dropped.
  const asHtml=/^\s*(?:<!doctype html>\s*)?<html[\s>]/i.test(html);
  const asBody=asHtml || /^\s*<body[\s>]/i.test(html);
  const documentNode=asBody ? parse(asHtml ? (/^\s*<!doctype/i.test(html) ? html.trim() : `<!doctype html>${html.trim()}`) : `<!doctype html><html><head></head>${html.trim()}</html>`,{sourceCodeLocationInfo:true,onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)},tags).childNodes.find(n=>n.tagName==='html') : null;
  if(asHtml) {
    if(documentNode.childNodes.some(n=>n.tagName==='head' && n.childNodes.some(c=>c.tagName && !['meta','title'].includes(c.tagName)))) unknown('A head with elements other than meta and title is not modeled (pass styles as the css option)');
    // The viewport meta tag (zoom restrictions: the meta-viewport rule) is kept as a fact of the html root.
    const meta=documentNode.childNodes.find(n=>n.tagName==='head')?.childNodes.find(c=>c.tagName==='meta' && c.attrs.some(a=>a.name==='name' && a.value.trim().toLowerCase()==='viewport'));
    var metaViewport=meta?.attrs.find(a=>a.name==='content')?.value;
    documentNode.childNodes=documentNode.childNodes.filter(n=>n.tagName!=='head');
  }
  const fragment=asHtml ? documentNode : asBody ? documentNode.childNodes.find(n=>n.tagName==='body') : parseFragment(html,{sourceCodeLocationInfo:true,onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)},tags);
  const roots=asBody ? [fragment] : fragment.childNodes.filter(node=>node.tagName);
  // Checklist F27 (moves the parser makes): an element written inside a <table> outside its cells is moved before the
  // table (foster parenting), and a <form> start tag inside a form is dropped. Found from the source offsets.
  {
    const source=asBody ? (asHtml ? (/^\s*<!doctype/i.test(html) ? html.trim() : `<!doctype html>${html.trim()}`) : `<!doctype html><html><head></head>${html.trim()}</html>`) : html;
    // (Within the same bounds as the conversion below — 64 levels, 2048 elements — beyond which the input is refused anyway.)
    const all=[]; let bounded=true;
    (function collect(n,ancestors){ if(!bounded) return; if(ancestors.length>64 || all.length>2048) { bounded=false; return; } if(n.tagName) all.push({n,ancestors}); for(const c of n.childNodes??[]) collect(c,n.tagName ? [...ancestors,n] : ancestors); })(fragment,[]);
    if(!bounded) all.length=0;
    const tables=all.filter(x=>x.n.tagName==='table' && x.n.sourceCodeLocation);
    for(const x of all) { const at=x.n.sourceCodeLocation?.startOffset; if(at===undefined) continue;
      const t=tables.find(t=>t.n!==x.n && at>t.n.sourceCodeLocation.startOffset && at<(t.n.sourceCodeLocation.endOffset ?? Infinity) && !x.ancestors.includes(t.n));
      if(t) x.n.fostered=true; }
    const formStarts=new Set(all.filter(x=>x.n.tagName==='form' && x.n.sourceCodeLocation).map(x=>x.n.sourceCodeLocation.startOffset));
    for(const m of source.matchAll(/<form[\s>]/gi)) if(!formStarts.has(m.index)) { const outer=all.filter(x=>x.n.tagName==='form' && x.n.sourceCodeLocation && x.n.sourceCodeLocation.startOffset<m.index && m.index<(x.n.sourceCodeLocation.endOffset ?? Infinity)).at(-1); if(outer) outer.n.nestedForm=true; }
    // Checklist J1, J2: the tree the source writes (each start tag inside the last one not yet closed by an end tag the
    // author wrote) against the tree the parser built. A table part with no element was dropped; an element outside the
    // optional-end-tag element it was written in (whose own end tag comes after it in the source) was closed out of it.
    // Inside a template or foreign content (svg, math) the parser's rules differ: not compared.
    const byOffset=new Map(all.filter(x=>x.n.sourceCodeLocation).map(x=>[x.n.sourceCodeLocation.startOffset,x]));
    const written=[], open=[];
    for(const t of tags) {
      if(t.start) { const e={...t,parent:open.at(-1),closed:false}; written.push(e); if(!voidTags.has(t.name) && !t.self) open.push(e); }
      else { const i=open.findLastIndex(e=>e.name===t.name); if(i>=0) { open[i].closed=true; open.length=i; } }
    }
    const foreign=e=>{ for(let p=e.parent; p; p=p.parent) if(['template','svg','math'].includes(p.name)) return true; return false; };
    for(const e of written) {
      if(e.at===undefined || foreign(e)) continue;
      const x=byOffset.get(e.at);
      if(!x) {
        if(!tableParts.has(e.name)) continue;
        let p=e.parent; while(p && !byOffset.has(p.at)) p=p.parent;
        const host=p && byOffset.get(p.at)?.n;
        if(host && !(host.droppedTags ??= []).includes(e.name)) host.droppedTags.push(e.name);
        continue;
      }
      const p=e.parent, host=p && byOffset.get(p.at)?.n;
      // J7: flow content written in a <p> (the parser closes the paragraph; a DOM-built tree keeps it inside).
      if(host && p.name==='p' && flowOnly.has(e.name)) host.paragraphFlow ??= e.name;
      if(host && p.closed && autoClosing.has(p.name) && !x.n.fostered && !x.ancestors.includes(host)) x.n.writtenIn=p.name;
    }
  }
  if(roots.length!==1 || !asBody && fragment.childNodes.some(n=>n.nodeName==='#text' && n.value.trim())) throw new TypeError('Static HTML adapter requires a single root element');
  let count=0;
  function convert(node,depth=0) {
    if(++count>2048 || depth>64) throw new TypeError('HTML box tree limit exceeded');
    const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    for(const attr of node.attrs) {
      // An img's or source's size and selection attributes are modeled (width/height hints and aspect-ratio).
      if(['details','dialog'].includes(node.tagName) && attr.name==='open') continue;
      if(node.tagName==='svg' && !attr.namespace && /^(?:width|height|viewbox|xmlns|version|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|fill-rule|clip-rule|fill-opacity|stroke-opacity|opacity|preserveaspectratio|focusable)$/i.test(attr.name)) continue;
      if(node.tagName==='svg' && attr.namespace==='http://www.w3.org/2000/xmlns/') continue;
      if(!attr.namespace && ((['img','source'].includes(node.tagName) && /^(?:width|height|srcset|sizes|media|loading|decoding)$/.test(attr.name)) || (node.tagName==='video' && /^(?:width|height|preload)$/.test(attr.name)) || (node.tagName==='iframe' && /^(?:width|height)$/.test(attr.name)))) continue;
      // An iframe's legacy frame attributes (HTML rendering §15.4.4): frameborder is a presentational hint on its border
      // (recorded in the box tree, read by computeStyle); scrolling, marginwidth and marginheight act on the frame's own
      // document only and change nothing on this page. On any other element (frame / frameset are not modeled) they do
      // nothing at all.
      if(!attr.namespace && /^(?:frameborder|scrolling|marginwidth|marginheight)$/.test(attr.name)) { if(node.tagName!=='iframe') (node.inertAttributes ??= []).push(attr.name); continue; }
      // A canvas's width / height set its bitmap (and an intrinsic size the layout uses only where CSS leaves it auto,
      // which the engine does not admit): recorded in the box tree as canvasSize (F71).
      if(!attr.namespace && node.tagName==='canvas' && /^(?:width|height)$/.test(attr.name)) continue;
      // Checklist F28: a presentational attribute on an element it does not map to (HTML rendering §15) does nothing:
      // width/height on a div, bgcolor on a span… Recorded for a warning instead of Unknown.
      if(!attr.namespace && presentationalInert(node.tagName,attr.name)) { (node.inertAttributes ??= []).push(attr.name); continue; }
      // F64: names that are DOM properties, not HTML attributes (indeterminate; value on a textarea or select; React's
      // defaultValue / defaultChecked) do nothing in markup (measured in Chromium, Firefox and WebKit). Recorded for a warning.
      if(!attr.namespace && (['indeterminate','defaultvalue','defaultchecked'].includes(attr.name) || (attr.name==='value' && ['textarea','select'].includes(node.tagName)))) { (node.notAttributes ??= []).push(attr.name); continue; }
      // F65: disabled, checked and selected only work on the elements that take them (measured in Chromium, Firefox and
      // WebKit: an a or div with disabled stays focusable and is not :disabled; checked on a text field is not :checked).
      if(!attr.namespace && attr.name==='disabled' && !['button','input','select','textarea','optgroup','option','fieldset','link','style'].includes(node.tagName)) (node.notAttributes ??= []).push('disabled');
      if(!attr.namespace && attr.name==='checked' && !(node.tagName==='input' && ['checkbox','radio'].includes(String(attrs.type ?? '').trim().toLowerCase()))) (node.notAttributes ??= []).push('checked');
      if(!attr.namespace && attr.name==='selected' && node.tagName!=='option') { (node.notAttributes ??= []).push('selected'); continue; }
      // F67: placeholder shows only in a text-like field or textarea (not a select, checkbox, date or range), and maxlength
      // limits only text fields (a number input takes any length) — measured in Chromium, Firefox and WebKit. maxlength has
      // no rendering of its own.
      const textType = /^(?:|text|search|url|tel|email|password)$/.test(String(attrs.type ?? '').trim().toLowerCase());
      if(!attr.namespace && attr.name==='placeholder' && !(node.tagName==='textarea' || (node.tagName==='input' && (textType || String(attrs.type ?? '').trim().toLowerCase()==='number')))) { (node.notAttributes ??= []).push('placeholder'); continue; }
      if(!attr.namespace && attr.name==='maxlength') { if(!(node.tagName==='textarea' || (node.tagName==='input' && textType))) (node.notAttributes ??= []).push('maxlength'); continue; }
      // F66: readonly only stops editing text (a textarea or a text-like input); a checkbox, radio or select still changes
      // (measured in Chromium, Firefox and WebKit).
      if(!attr.namespace && attr.name==='readonly' && !(node.tagName==='textarea' || (node.tagName==='input' && /^(?:|text|search|url|tel|email|password|number|date|month|week|time|datetime-local)$/.test(String(attrs.type ?? '').trim().toLowerCase())))) (node.notAttributes ??= []).push('readonly');
      if(attr.namespace || !/^(?:list|class|id|style|dir|target|title|role|lang|tabindex|href|disabled|alt|src|type|for|name|value|placeholder|required|readonly|checked|autocomplete|headers|scope|controls|autoplay|muted|loop|playsinline|poster|kind|srclang|label|accesskey|ismap|colspan|rowspan|hidden|inert|autofocus|popover|popovertarget|popovertargetaction|aria-[\w-]+|data-[\w-]+)$/.test(attr.name) && renderingAttributes.has(attr.name)) (node.adapterUnknowns ??= []).push({code:'U_LAYOUT_HTML',message:`HTML rendering attribute needs an adapter: ${attr.name}`});
    }
    // An inline svg is one replaced box: its content is SVG, not CSS boxes, so its children are not converted.
    const inlineSvg=node.tagName==='svg' && node.namespaceURI==='http://www.w3.org/2000/svg';
    // (On the element: Unknown where the layout reaches it.)
    if(node.namespaceURI!=='http://www.w3.org/1999/xhtml' && !inlineSvg) (node.adapterUnknowns ??= []).push({code:'U_LAYOUT_HTML',message:'Foreign element needs a size adapter'});
    // Its <title> child names it (SVG accessibility API mappings), like an aria-label.
    const svgTitle=inlineSvg ? node.childNodes.find(n=>n.tagName==='title')?.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join('').trim() : undefined;
    // The colors it draws with: its fill/stroke attributes and those of its shapes (one value each across the shapes,
    // 'mixed' otherwise; a style attribute on a shape is not read, so it is 'dynamic').
    const svgPaint=(()=>{
      if(!inlineSvg) return undefined;
      // Leaf shapes with their ancestor chain inside the svg (a g's attributes inherit to its shapes).
      const shapes=[], leaves=[]; (function walk(n,chain){ for(const c of n.childNodes ?? []) if(c.tagName && c.tagName!=='title' && c.tagName!=='desc'){ shapes.push(c); const next=[...chain,c]; if(c.childNodes?.some(k=>k.tagName)) walk(c,next); else leaves.push(next); } })(node,[]);
      const own=Object.fromEntries(['fill','stroke'].filter(k=>attrs[k]!==undefined).map(k=>[k,attrs[k].trim().toLowerCase()]));
      const translucent=[node,...shapes].some(c=>c.attrs.some(a=>/^(?:opacity|fill-opacity|stroke-opacity)$/.test(a.name) && Number(a.value)!==1));
      const of=key=>{
        if(translucent || shapes.some(c=>c.attrs.some(a=>a.name==='style'))) return 'dynamic';
        const values=leaves.map(chain=>[...chain].reverse().map(c=>c.attrs.find(a=>a.name===key)?.value.trim().toLowerCase()).find(v=>v!==undefined));
        if(values.every(v=>v===undefined)) return undefined;
        return new Set(values).size===1 ? values[0] : 'mixed';
      };
      // F41: every shape sets this paint itself (an attribute on it or a g around it, not inherit): an inherited CSS value
      // from the svg never reaches it. Not where a style attribute could set it.
      const setByAll=key=>leaves.length>0 && !shapes.some(c=>c.attrs.some(a=>a.name==='style')) && leaves.every(chain=>{ const v=[...chain].reverse().map(c=>c.attrs.find(a=>a.name===key)?.value.trim().toLowerCase()).find(v=>v!==undefined); return v!==undefined && v!=='inherit'; });
      return {...own,...(of('fill')!==undefined ? {shapeFill:of('fill')} : {}),...(of('stroke')!==undefined ? {shapeStroke:of('stroke')} : {}),...(setByAll('fill') ? {fillSet:true} : {}),...(setByAll('stroke') ? {strokeSet:true} : {}),shapes:shapes.length};
    })();
    // the svg's own elements, for selector checks only (class and tag selectors on its shapes)
    // Past the bounds the box tree accepts (64 levels, 2048 elements) it is left out rather than rejecting the page.
    let svgCount=0;
    const svgTreeFull=inlineSvg ? (function tree(n,depth){ if(depth>64) return null; const out=[]; for(const c of n.childNodes.filter(c=>c.tagName)){ if(++svgCount>2048) return null; const a=Object.fromEntries(c.attrs.map(x=>[x.name,x.value])); const children=tree(c,depth+1); if(!children) return null; out.push({tag:c.tagName,classes:(a.class ?? '').split(/\s+/).filter(Boolean),...(a.id!==undefined ? {id:a.id} : {}),attributes:a,children}); } return out; })(node,0) : undefined;
    const svgTree=svgTreeFull ?? [];
    if(inlineSvg) { const facts=accessibilityFacts('svg',attrs); facts.svgSize={...(facts.svgSize ?? {}),paint:svgPaint}; return {tag:'svg',attributes:attrs,...(attrs.id!==undefined ? {id:attrs.id} : {}),...facts,...(svgTitle ? {named:true} : {}),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),text:false,runs:[],children:[],...(svgTree.length ? {svgTree} : {})}; }
    // (A table section or row the parser inserted — no start tag in the source — is marked implied: checklist F26.)
    // Checklist F27: the parser changed the structure written in the source — an element with no source location at all
    // (an empty <p> made from a stray </p>, after a block closed the open paragraph), or one whose required end tag the
    // parser supplied early (a nested <a>, a <div> inside a <button>…). Optional end tags (p, li, td, …), void and
    // foreign (SVG, MathML) elements are left alone.
    const html5=node.namespaceURI==='http://www.w3.org/1999/xhtml';
    const optionalEnd=new Set(['html','head','body','p','li','dt','dd','option','optgroup','rt','rp','tr','td','th','thead','tbody','tfoot','colgroup','caption']);
    const restructured=node.fostered ? 'fostered' : node.nestedForm ? 'nested-form' : node.writtenIn ? 'auto-closed' : node.droppedTags ? 'dropped' : !html5 || !node.sourceCodeLocation && ['tbody','tr','colgroup','html','head','body'].includes(node.tagName) ? undefined : !node.sourceCodeLocation ? 'implied' : node.sourceCodeLocation.startTag && !node.sourceCodeLocation.endTag && !optionalEnd.has(node.tagName) && !voidTags.has(node.tagName) ? 'unclosed' : undefined;
    return {...(node.adapterUnknowns ? {adapterUnknowns:node.adapterUnknowns.map(u=>({...u}))} : {}),...(node.notAttributes ? {notAttributes:[...node.notAttributes]} : {}),...(node.inertAttributes ? {inertAttributes:[...node.inertAttributes]} : {}),...(node.droppedTags ? {droppedTags:[...node.droppedTags]} : {}),...(node.writtenIn ? {writtenIn:node.writtenIn} : {}),...(node.paragraphFlow ? {paragraphFlow:node.paragraphFlow} : {}),...(['tbody','tr','colgroup'].includes(node.tagName) && !node.sourceCodeLocation ? {implied:true} : {}),...(restructured ? {restructured} : {}),tag:node.tagName,attributes:attrs,...(attrs.id!==undefined ? {id:attrs.id} : {}),...(attrs.lang!==undefined ? {lang:attrs.lang.trim()} : {}),...accessibilityFacts(node.tagName,attrs),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),
      text:node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)) ? {textContent:node.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(' ').replace(/[\t\n\r ]+/g,' ').trim()} : {}),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && n.value && !/[^\t\n\r ]/.test(n.value)) ? {whitespace:true} : {}),
      // DOM order of text and child elements: text strings and child indices.
      runs:(()=>{ let i=0; return node.childNodes.flatMap(n=>n.tagName ? [i++] : n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value) ? [n.value.replace(/[\t\n\r ]+/g,' ').trim()] : []); })(),
      // Component boundaries an adapter marks (<!--isle-boundary:component Item-->, slot, children, html): content
      // rendered here comes from another component or the caller.
      ...(node.childNodes.some(n=>n.nodeName==='#comment' && /^isle-boundary:/.test(n.data)) ? {boundaries:node.childNodes.filter(n=>n.nodeName==='#comment' && /^isle-boundary:/.test(n.data)).map(n=>{ const m=/^isle-boundary:(\w+)(?: ([^\s=]+))?/.exec(n.data); return {kind:m?.[1] ?? 'component',...(m?.[2] ? {name:m[2]} : {})}; })} : {}),
      // A datalist's options are never laid out (it is display: none; they show in a field's popup): not converted.
      children:node.tagName==='datalist' ? [] : node.childNodes.filter(n=>n.tagName).map(child=>convert(child,depth+1))};
  }
  const tree=convert(roots[0]);
  if(asHtml && metaViewport!==undefined) tree.metaViewport=metaViewport;
  return {tree,diagnostics};
}
