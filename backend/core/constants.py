"""Application constants."""

import os

DIVIDER = "-" * 80

ALLOWED_TARGETS = os.getenv("ALLOWED_TARGETS", "target,localhost,127.0.0.1").split(",")
