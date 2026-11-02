"""
VeriCare AI - Master Seed Script
Single-command initialization for the entire synthetic clinical database,
security indexes, demo accounts, and clinical test scenarios.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.create_indexes import create_indexes
from scripts.seed_users import seed_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("scripts.seed")


async def run_master_seed():
    logger.info("=" * 60)
    logger.info("VeriCare AI: Initializing Database & Indexes")
    logger.info("=" * 60)
    
    # 1. Ensure all MongoDB unique and compound indexes exist
    await create_indexes()
    logger.info("Indexes successfully built.")

    # 2. Seed all synthetic patients, users, encounters, safety rules, scenarios
    await seed_all()
    logger.info("Synthetic dataset seeded successfully.")
    
    logger.info("=" * 60)
    logger.info("DEMO ACCOUNTS READY (Password for all: synthetic-dev-password)")
    logger.info("=" * 60)
    logger.info("  Senior Doctor / Verifier: dr.lin@vericare.local (USR-VERIFIER-001)")
    logger.info("  Cardiologist / Doctor:    dr.marcus@vericare.local (USR-DOC-CARDIO-001)")
    logger.info("  Doctor (Ward):            dr.chen@vericare.local (USR-DOC-METRO-001)")
    logger.info("  Patient (Eleanor Vance):  eleanor.vance@synthetic.local (PAT-SYN-001)")
    logger.info("  Hospital Admin:           admin.metro@vericare.local (HOSP-METRO-01)")
    logger.info("  System Admin:             system.admin@vericare.local")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_master_seed())
