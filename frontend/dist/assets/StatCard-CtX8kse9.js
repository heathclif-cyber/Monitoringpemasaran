import{c as u,r as p,j as t,n as l}from"./index-C5g6YRPd.js";import{C as g,c as y}from"./card-Bw8GEGPt.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=u("Box",[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=u("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=u("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=u("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=u("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=u("Wallet",[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]]);function z(r,a="vs bln lalu"){const o=new Date().getMonth(),i=r[o]??0,e=o>0?r[o-1]??0:0;return i===0&&e===0?void 0:e===0?{pct:i>0?100:0,label:a}:{pct:(i-e)/Math.abs(e)*100,label:a}}function b(r){return`${r>0?"+":""}${r.toFixed(1)}%`}function j({children:r,className:a,minSize:h=12,maxSize:o=22}){const i=p.useRef(null),e=p.useRef(null);return p.useEffect(()=>{const d=i.current,s=e.current;if(!d||!s)return;const n=()=>{let x=o;s.style.fontSize=`${x}px`,s.style.whiteSpace="nowrap";const m=d.clientWidth;for(;x>h&&s.scrollWidth>m;)x-=.5,s.style.fontSize=`${x}px`;s.scrollWidth>m&&(s.style.whiteSpace="normal",s.style.wordBreak="break-word")};n();const c=new ResizeObserver(n);return c.observe(d),()=>c.disconnect()},[r,h,o]),t.jsx("div",{ref:i,className:l("w-full min-w-0",a),children:t.jsx("span",{ref:e,className:"inline-block max-w-full font-bold tabular-nums leading-tight text-foreground",style:{fontSize:`${o}px`},children:r})})}function C({label:r,value:a,subtitle:h,icon:o,iconClassName:i,trend:e,onClick:d,wrapValue:s,compact:n,fitValue:c}){const x=e&&e.pct>0,m=e&&e.pct<0,f=e&&e.pct===0;return t.jsx(g,{className:l("border-border/80",d&&"cursor-pointer hover:border-border hover:shadow-sm transition-all"),onClick:d,children:t.jsx(y,{className:l("p-4",(n||c)&&"p-3.5",s&&!n&&!c&&"p-5"),children:t.jsxs("div",{className:"flex items-start justify-between gap-2",children:[t.jsxs("div",{className:"min-w-0 flex-1",children:[t.jsx("p",{className:l("text-xs text-muted-foreground font-medium",s||c?"leading-snug":"truncate"),children:r}),c?t.jsx(j,{className:"mt-1",children:a}):t.jsx("p",{className:l("font-bold text-foreground tabular-nums",n&&"mt-1 text-sm leading-snug break-words",s&&!n&&"mt-1.5 text-base sm:text-lg leading-snug break-words",!s&&!n&&"mt-1 text-2xl truncate"),children:a}),e&&t.jsxs("div",{className:l("flex items-center gap-1 mt-1 text-xs font-medium",x&&"text-emerald-600 dark:text-emerald-400",m&&"text-rose-600 dark:text-rose-400",f&&"text-muted-foreground"),children:[x&&t.jsx(w,{size:12}),m&&t.jsx(v,{size:12}),f&&t.jsx(k,{size:12}),t.jsx("span",{children:b(e.pct)}),t.jsx("span",{className:"text-muted-foreground font-normal",children:e.label})]}),h&&t.jsx("p",{className:l("text-muted-foreground",n?"text-xs mt-0.5 leading-snug":s?"text-sm mt-1 leading-snug break-words":"text-xs mt-0.5"),children:h})]}),o&&t.jsx(o,{size:n?18:22,className:l("text-primary shrink-0",n?"ml-2":"ml-3",i)})]})})})}export{R as B,T as R,C as S,w as T,W,z as c};
