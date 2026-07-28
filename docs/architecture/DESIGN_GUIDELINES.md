# Design System & UI Standardization Guidelines
**Application:** Monitoringpemasaran

This document outlines the standardized design principles applied to the application to achieve a modern, minimal, "Platform-like" (SaaS) aesthetic similar to industry leaders like Vercel, Stripe, or Linear.

## 1. Core Philosophy
- **Data over Decoration:** Remove unnecessary gradients, thick shadows, and bulky glassmorphism backgrounds. 
- **High Contrast, Clean Layout:** Use bright white backgrounds for content containers and a very light gray (`slate-50`) for the app background to make the content pop.
- **Consistent Sizing:** Form elements, buttons, and layout grids must adhere to strict, predictable height and padding rules.

## 2. Color Palette
- **Backgrounds:** 
  - Main App Background: `bg-slate-50` (`#f8fafc`)
  - Content Cards / Sidebar: `bg-white` (`#ffffff`)
- **Text:** 
  - Primary / Values: `text-slate-900`
  - Secondary / Labels: `text-slate-500`
- **Borders:** `border-slate-200` (`#e2e8f0`)
- **Brand Colors:** Use `brand-600` (Teal/Emerald/Indigo depending on the theme configuration) for primary actions and active states.

## 3. Typography
- **Font Family:** `Inter` (sans-serif)
- **Data/Values:** Emphasized using `text-[15px]` or `text-base`, `font-bold` and `tracking-tight`.
- **Labels (Forms & Filters):** Keep it clean with `text-xs font-medium text-slate-500`. 
  - *Rule:* Avoid excessive `UPPERCASE` or `tracking-widest` for standard labels as it creates visual noise.
- **Section Headers:** Clean headers with bottom borders to separate sections.
  - *Example:* `<h3 class="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-3 mt-4 first:mt-0">`

## 4. Components
### 4.1 Cards (`.glass-panel`)
Replaced bulky glassmorphism with crisp, flat cards:
```css
.glass-panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    border-radius: 0.75rem; /* rounded-xl */
}
```

### 4.2 Form Inputs (`.form-input`)
Standardized height and behavior across all dropdowns, text inputs, and buttons:
- **Height:** `2.25rem` (`h-9`)
- **Padding:** `px-3`
- **Text Size:** `text-sm` (`0.875rem`)
- **Borders:** `border-slate-200`, rounded `md` (`0.375rem`).
- **Focus:** `focus:border-brand-500 focus:ring-1 focus:ring-brand-500`

### 4.3 Data Tables
- Keep table wrappers clean without bulky headers attached.
- Table headers (`<th>`): Use solid backgrounds (e.g. `bg-indigo-50` or `bg-slate-50`) with `sticky top-0` and a z-index.
- Enable text selection (`select-text`) to allow users to copy data.
- Ensure the table container has `overflow-auto` with a maximum height (e.g. `max-h-[70vh]`) for sticky headers to work properly.

## 5. Layout Spacing
- **Main Wrapper Padding:** Standardized to `padding-top: 56px;` to clear the fixed header. 
- **Section Padding:** Use `pt-6 pb-8` for `.page-section` instead of `pt-24`, reducing dead space.
- **Grids:** Use responsive grids (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) with standard gaps (`gap-4` or `gap-6`) rather than flex-wraps, ensuring perfect alignment of cards and filters.

---
*By adhering to these guidelines, any future UI additions will seamlessly match the professional standard set during the modern platform overhaul.*
