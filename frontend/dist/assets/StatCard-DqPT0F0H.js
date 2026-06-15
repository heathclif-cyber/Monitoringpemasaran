import{c as l,j as e,l as x}from"./index-BEgPe6wC.js";import{C as m,a as p}from"./card-kZOhr98e.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=l("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=l("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=l("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=l("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function w(s,a="vs bln lalu",i){const n=new Date,c=i??n.getFullYear();if(c>n.getFullYear())return;const t=c<n.getFullYear()?11:n.getMonth(),o=s[t]??0,r=t>0?s[t-1]??0:0;return o===0&&r===0?void 0:r===0?{pct:o>0?100:0,label:a}:{pct:(o-r)/Math.abs(r)*100,label:a}}function g(s){return`${s>0?"+":""}${s.toFixed(1)}%`}function M({label:s,value:a,subtitle:i,icon:n,iconClassName:c,trend:t,onClick:o}){const r=t&&t.pct>0,d=t&&t.pct<0,u=t&&t.pct===0;return e.jsx(m,{className:x("border-border/80",o&&"cursor-pointer hover:border-border hover:shadow-sm transition-all"),onClick:o,children:e.jsx(p,{className:"p-4",children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("p",{className:"text-xs text-muted-foreground font-medium truncate",children:s}),e.jsx("p",{className:"text-2xl font-bold text-foreground mt-1 truncate tabular-nums",children:a}),t&&e.jsxs("div",{className:x("flex items-center gap-1 mt-1 text-xs font-medium",r&&"text-emerald-600 dark:text-emerald-400",d&&"text-rose-600 dark:text-rose-400",u&&"text-muted-foreground"),children:[r&&e.jsx(j,{size:12}),d&&e.jsx(f,{size:12}),u&&e.jsx(h,{size:12}),e.jsx("span",{children:g(t.pct)}),e.jsx("span",{className:"text-muted-foreground font-normal",children:t.label})]}),i&&e.jsx("p",{className:"text-xs text-muted-foreground mt-0.5",children:i})]}),n&&e.jsx(n,{size:22,className:x("text-primary shrink-0 ml-3",c)})]})})})}export{k as R,M as S,j as T,w as c};
