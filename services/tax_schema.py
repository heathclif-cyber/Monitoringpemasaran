"""Explicit additive tax-only migration: python -m services.tax_schema.

Requires the configured authenticated application's PostgreSQL DATABASE_URL.
Does not run legacy data updates, seed users, or change financial records.
"""
import models
from database import engine


def create_tax_tables():
    with engine.begin() as connection:
        for model in (models.TaxProfile, models.TaxDecision, models.TaxAudit):
            model.__table__.create(bind=connection, checkfirst=True)


if __name__ == '__main__':
    create_tax_tables()
    print('Tax schema ready; financial records unchanged.')
