import{c as o,j as s,l}from"./index-mb13Pgtj.js";import{C as m,a as h}from"./card-Cs2WDnw0.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=o("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=o("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=o("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=o("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function M(e,a="vs bln lalu"){const n=new Date().getMonth(),r=e[n]??0,t=n>0?e[n-1]??0:0;return r===0&&t===0?void 0:t===0?{pct:r>0?100:0,label:a}:{pct:(r-t)/Math.abs(t)*100,label:a}}function v(e){return`${e>0?"+":""}${e.toFixed(1)}%`}function N({label:e,value:a,subtitle:c,icon:n,iconClassName:r,trend:t,onClick:i}){const x=t&&t.pct>0,d=t&&t.pct<0,p=t&&t.pct===0;return s.jsx(m,{className:l("border-slate-200/80",i&&"cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"),onClick:i,children:s.jsx(h,{className:"p-4",children:s.jsxs("div",{className:"flex items-start justify-between",children:[s.jsxs("div",{className:"min-w-0 flex-1",children:[s.jsx("p",{className:"text-xs text-slate-500 font-medium truncate",children:e}),s.jsx("p",{className:"text-2xl font-bold text-slate-900 mt-1 truncate tabular-nums",children:a}),t&&s.jsxs("div",{className:l("flex items-center gap-1 mt-1 text-xs font-medium",x&&"text-emerald-600",d&&"text-rose-600",p&&"text-slate-400"),children:[x&&s.jsx(j,{size:12}),d&&s.jsx(f,{size:12}),p&&s.jsx(u,{size:12}),s.jsx("span",{children:v(t.pct)}),s.jsx("span",{className:"text-slate-400 font-normal",children:t.label})]}),c&&s.jsx("p",{className:"text-xs text-slate-400 mt-0.5",children:c})]}),n&&s.jsx(n,{size:22,className:l("text-brand-600 shrink-0 ml-3",r)})]})})})}export{k as R,N as S,j as T,M as c};
