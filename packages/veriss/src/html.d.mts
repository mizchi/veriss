import type {LayoutOptions,LayoutSummary} from './layout-contracts.d.ts';
/** One HTML fragment root and an explicit complete author stylesheet. */
export function analyzeHTML(html:string,options:LayoutOptions):LayoutSummary;
/** A W_HTML_RESTRUCTURED warning: where the HTML parser builds another tree than the markup writes. */
export interface HTMLRestructuring {
  code:'W_HTML_RESTRUCTURED'; severity:'warning'; box:string; path:string; tag:string; rule:'html-structure';
  kind:'fostered'|'nested-form'|'implied'|'unclosed'|'dropped'|'auto-closed'; message:string; fix:string;
  dropped?:string[]; writtenIn?:string; atRoot?:true; line?:number;
}
/** The parser's restructurings of a document or single-root fragment, without analyzing anything else. */
/** dom: the markup is built through the DOM API (no parser restructures it): a <p> holding flow content is reported as
 *  E_HTML_PARAGRAPH_CONTENT (a spec-tier error) instead of the parser's empty <p>. */
export function htmlRestructurings(html:string,name?:string,options?:{dom?:boolean}):(HTMLRestructuring|{code:'E_HTML_PARAGRAPH_CONTENT';severity:'error';box:string;path:string;tag:'p';child:string;message:string;fix:string;line?:number})[];
