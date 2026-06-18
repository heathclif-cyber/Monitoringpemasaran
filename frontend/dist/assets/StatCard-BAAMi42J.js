import{c as h,r as f,j as t,n as l}from"./index-CX9rNbq0.js";import{C as g,c as y}from"./card-B_ICQNgz.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=h("Box",[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=h("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=h("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=h("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=h("Wallet",[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]]);function z(r,a="vs bln lalu"){const o=new Date().getMonth(),i=r[o]??0,e=o>0?r[o-1]??0:0;return i===0&&e===0?void 0:e===0?{pct:i>0?100:0,label:a}:{pct:(i-e)/Math.abs(e)*100,label:a}}function w(r){return`${r>0?"+":""}${r.toFixed(1)}%`}function v({children:r,className:a,minSize:u=12,maxSize:o=22}){const i=f.useRef(null),e=f.useRef(null);return f.useEffect(()=>{const d=i.current,s=e.current;if(!d||!s)return;const n=()=>{let x=o;s.style.fontSize=`${x}px`,s.style.whiteSpace="nowrap";const m=d.clientWidth;for(;x>u&&s.scrollWidth>m;)x-=.5,s.style.fontSize=`${x}px`;s.scrollWidth>m&&(s.style.whiteSpace="normal",s.style.wordBreak="break-word")};n();const c=new ResizeObserver(n);return c.observe(d),()=>c.disconnect()},[r,u,o]),t.jsx("div",{ref:i,className:l("w-full min-w-0",a),children:t.jsx("span",{ref:e,className:"inline-block max-w-full font-bold tabular-nums leading-tight text-foreground",style:{fontSize:`${o}px`},children:r})})}function R({label:r,value:a,subtitle:u,icon:o,iconClassName:i,trend:e,onClick:d,wrapValue:s,compact:n,fitValue:c}){const x=e&&e.pct>0,m=e&&e.pct<0,p=e&&e.pct===0;return t.jsx(g,{className:l("border-border/80",d&&"cursor-pointer hover:border-border hover:shadow-sm transition-all"),onClick:d,children:t.jsx(y,{className:l("p-4",(n||c)&&"p-3.5",s&&!n&&!c&&"p-5"),children:t.jsxs("div",{className:"flex items-start justify-between gap-2",children:[t.jsxs("div",{className:"min-w-0 flex-1",children:[t.jsx("p",{className:l("text-xs text-muted-foreground font-medium",s||c?"leading-snug":"truncate"),children:r}),c?t.jsx(v,{className:"mt-1",children:a}):t.jsx("p",{className:l("font-bold text-foreground tabular-nums",n&&"mt-1 text-sm leading-snug break-words",s&&!n&&"mt-1.5 text-base sm:text-lg leading-snug break-words",!s&&!n&&"mt-1 text-2xl truncate"),children:a}),e&&t.jsxs("div",{className:l("flex items-center gap-1 mt-1 text-xs font-medium",x&&"text-emerald-600 dark:text-emerald-400",m&&"text-rose-600 dark:text-rose-400",p&&"text-muted-foreground"),children:[x&&t.jsx(k,{size:12}),m&&t.jsx(j,{size:12}),p&&t.jsx(b,{size:12}),t.jsx("span",{children:w(e.pct)}),t.jsx("span",{className:"text-muted-foreground font-normal",children:e.label})]}),u&&t.jsx("p",{className:l("text-muted-foreground",n?"text-xs mt-0.5 leading-snug":s?"text-sm mt-1 leading-snug break-words":"text-xs mt-0.5"),children:u})]}),o&&t.jsx(o,{size:n?18:22,className:l("text-primary shrink-0",n?"ml-2":"ml-3",i)})]})})})}export{T as B,R as S,k as T,W,z as c};
