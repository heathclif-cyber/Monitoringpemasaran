import{c as a,j as t,l as d}from"./index-B-caCvrj.js";import{C as p,a as u}from"./card-VFk_ywnt.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=a("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=a("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=a("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function w(s,r="vs bln lalu"){const n=new Date().getMonth(),o=s[n]??0,e=n>0?s[n-1]??0:0;return o===0&&e===0?void 0:e===0?{pct:o>0?100:0,label:r}:{pct:(o-e)/Math.abs(e)*100,label:r}}function v(s){return`${s>0?"+":""}${s.toFixed(1)}%`}function M({label:s,value:r,subtitle:i,icon:n,iconClassName:o,trend:e,onClick:c}){const l=e&&e.pct>0,x=e&&e.pct<0,m=e&&e.pct===0;return t.jsx(p,{className:d("border-border/80",c&&"cursor-pointer hover:border-border hover:shadow-sm transition-all"),onClick:c,children:t.jsx(u,{className:"p-4",children:t.jsxs("div",{className:"flex items-start justify-between",children:[t.jsxs("div",{className:"min-w-0 flex-1",children:[t.jsx("p",{className:"text-xs text-muted-foreground font-medium truncate",children:s}),t.jsx("p",{className:"text-2xl font-bold text-foreground mt-1 truncate tabular-nums",children:r}),e&&t.jsxs("div",{className:d("flex items-center gap-1 mt-1 text-xs font-medium",l&&"text-emerald-600 dark:text-emerald-400",x&&"text-rose-600 dark:text-rose-400",m&&"text-muted-foreground"),children:[l&&t.jsx(j,{size:12}),x&&t.jsx(f,{size:12}),m&&t.jsx(h,{size:12}),t.jsx("span",{children:v(e.pct)}),t.jsx("span",{className:"text-muted-foreground font-normal",children:e.label})]}),i&&t.jsx("p",{className:"text-xs text-muted-foreground mt-0.5",children:i})]}),n&&t.jsx(n,{size:22,className:d("text-primary shrink-0 ml-3",o)})]})})})}export{k as R,M as S,j as T,w as c};
