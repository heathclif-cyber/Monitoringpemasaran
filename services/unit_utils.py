"""Shared unit name normalization for charts and filters."""

UNIT_ALIASES: dict[str, str] = {
    "Awaya Telpaputih": "Awaya-Telpaputih",
    "Minahasa Halmahera": "Minahasa-Halmahera",
}


def normalize_unit_name(name: str | None) -> str:
    if not name or not str(name).strip() or str(name).strip() == "-":
        return ""
    cleaned = str(name).strip()
    return UNIT_ALIASES.get(cleaned, cleaned)


def unit_filter_variants(unit: str) -> list[str]:
    """All spellings in DB that should match this canonical unit filter."""
    canonical = normalize_unit_name(unit) or unit.strip()
    variants = {canonical, unit.strip()}
    for alias, canon in UNIT_ALIASES.items():
        if canon == canonical:
            variants.add(alias)
    return list(variants)