# Tax classification sidecar

Correction to workflow: tax conclusions belong inline in the contract/invoice
forms, not in a separate operational menu. `/pajak` now redirects to `/kontrak`.
`TransactionTaxSummary` reads live form/selected-contract fields and distinguishes
entered tax amounts from legal eligibility that those fields cannot establish.
It does not pretend that repeating legacy tax flags is a verified legal decision.
The standalone tax page is no longer routed or listed. The previously implemented
sidecar engine/schema are retained, but are not required to use the forms.

Authenticated sidecar API: `/api/pajak/v1` (GET), `/profile`
(PUT admin), `/decision` (PUT admin/staff), `/history` (GET authenticated).
Integration accounts remain limited to `/api/integrasi/*`; this is not a new
public or SAP posting API. Existing endpoint/document formats are unchanged.

## Scope and legal references

Rule version `ID-SALES-2026-10-07.1` covers domestic commodity sales with a
reference date from 2025-08-01 to 2026-10-07. This deliberately limited ruleset
is a recommendation, not certification of complete tax compliance.

- [PMK 51/2025](https://jdih.kemenkeu.go.id/dok/pmk-51-tahun-2025): verified
  industrial/export buyer, qualifying agricultural material not manufactured,
  verified tax identity, industrial/export purchase purpose: PPh 22 at 0.25%.
  A single eligible invoice above Rp20 million exceeds the monthly exception;
  at or below that amount, complete monthly purchases/exception evidence are
  not available, so require review rather than declaring exemption.
- [PMK 131/2024](https://jdih.kemenkeu.go.id/dok/pmk-131-tahun-2024), article 3:
  nonluxury general VAT is 12% of fiscal DPP 11/12 of selling price, effectively
  11%. Pre-VAT selling price and fiscal DPP are separate values.
- [PMK 11/2025](https://jdih.kemenkeu.go.id/dok/pmk-11-tahun-2025), article 15,
  amending PMK 64/2022: BHPT specific VAT 1.1% requires eligibility and evidence
  that the PKP seller elected this scheme. It is not automatic for all crops.
- [PP 49/2022](https://jdih.kemenkeu.go.id/dok/pp-49-tahun-2022): qualifying
  white cane crystal sugar / qualifying livestock exempt VAT, not a zero rate.
  Product specifications and eligibility must be verified before selection.

Government/designated collectors, manufactured products, exports, services,
unknown identities, other taxes and special exceptions require manual review.
An ordinary trader is not a collector merely because it is a PT/CV. The master
must confirm it is not a designated collector. Master verification is a human
evidence review, not an external NPWP validation service. Check SKB and other
exceptions during that review; use manual correction where applicable.

## Data and persistence

Catalog entries are inferred by exact normalized partner and commodity/variant
identities, initially **unverified**. GET never seeds or changes the database.
Admin saves append a profile revision with evidence, date range and reason.
The highest saved revision applicable to the invoice date is selected. A
future-dated revision does not retroactively replace earlier periods.

Automatic assessments are computed on read. Manual decisions persist separately
with result, source snapshot, automatic snapshot, reason, actor, and revision.
Source/master changes flag existing decisions for review; never overwrite a
manual result. Returning to automatic mode is explicit and audited. Advisory
transaction locks and revision conflict (409) prevent concurrent lost updates.
Audit records have no API for editing/deletion and retain before/after snapshots.

Current invoice API stores gross before withholding. Pre-VAT value is estimated
as invoice gross / (1 + stored VAT rate/100), not net after PPh. Neither this
estimate nor the local proforma date is a verified tax invoice datum. Multi-
material invoices without an unambiguous unit selection require review.
Assessments do not change contract flags, posted amounts, payment balance,
deposit flags, documents or SAP. Tax verification and deposit evidence are
separate workflows. This feature does not post financial transactions.

## Migration and isolated preview

After approving production deployment, run `python -m services.tax_schema` with
the production app environment to create only `tax_profile`, `tax_decision` and
`tax_audit`. Existing startup migrations also discover these ORM tables, but
the tax-only command avoids unrelated legacy updates. Do not run production
migrations as a local preview step.

The current preview uses `monpem-tax-preview-db`, a private PostgreSQL snapshot,
and `monpem-tax-preview-api`, bound to 127.0.0.1:8013. Frontend port 5173 sets
`PREVIEW_API_TARGET=http://127.0.0.1:8013`. Preview edits are not production edits.
Production backend port 8000 and public routing remain untouched. Previous
frontend preview container is preserved as `monpem-report-preview-before-tax-master`.

Tests: pure rules via `python -m unittest discover -s tests -p test_tax_rules.py`.
API persistence/auth tests use `test_tax_api.py`, guarded to the dedicated
preview PostgreSQL host/database only. Synthetic fixtures are cleaned up;
real transactions are not changed.
