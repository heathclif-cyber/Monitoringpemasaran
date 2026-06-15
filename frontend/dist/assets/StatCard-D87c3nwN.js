import{k as o,j as t,l as a}from"./index-BCjWR1Lq.js";import{C as p,a as g}from"./card-CqYJFSHi.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=o("Box",[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=o("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=o("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=o("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=o("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=o("Wallet",[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]]);function T(n,d="vs bln lalu"){const r=new Date().getMonth(),i=n[r]??0,e=r>0?n[r-1]??0:0;return i===0&&e===0?void 0:e===0?{pct:i>0?100:0,label:d}:{pct:(i-e)/Math.abs(e)*100,label:d}}function v(n){return`${n>0?"+":""}${n.toFixed(1)}%`}function C({label:n,value:d,subtitle:x,icon:r,iconClassName:i,trend:e,onClick:c,wrapValue:l,compact:s}){const h=e&&e.pct>0,m=e&&e.pct<0,u=e&&e.pct===0;return t.jsx(p,{className:a("border-border/80",c&&"cursor-pointer hover:border-border hover:shadow-sm transition-all"),onClick:c,children:t.jsx(g,{className:a("p-4",s&&"p-3.5",l&&!s&&"p-5"),children:t.jsxs("div",{className:"flex items-start justify-between gap-2",children:[t.jsxs("div",{className:"min-w-0 flex-1",children:[t.jsx("p",{className:a("text-xs text-muted-foreground font-medium",l?"leading-snug":"truncate"),children:n}),t.jsx("p",{className:a("font-bold text-foreground tabular-nums",s&&"mt-1 text-sm leading-snug break-words",l&&!s&&"mt-1.5 text-base sm:text-lg leading-snug break-words",!l&&!s&&"mt-1 text-2xl truncate"),children:d}),e&&t.jsxs("div",{className:a("flex items-center gap-1 mt-1 text-xs font-medium",h&&"text-emerald-600 dark:text-emerald-400",m&&"text-rose-600 dark:text-rose-400",u&&"text-muted-foreground"),children:[h&&t.jsx(y,{size:12}),m&&t.jsx(k,{size:12}),u&&t.jsx(f,{size:12}),t.jsx("span",{children:v(e.pct)}),t.jsx("span",{className:"text-muted-foreground font-normal",children:e.label})]}),x&&t.jsx("p",{className:a("text-muted-foreground",s?"text-xs mt-0.5 leading-snug":l?"text-sm mt-1 leading-snug break-words":"text-xs mt-0.5"),children:x})]}),r&&t.jsx(r,{size:s?18:22,className:a("text-primary shrink-0",s?"ml-2":"ml-3",i)})]})})})}export{b as B,w as R,C as S,y as T,N as W,T as c};
