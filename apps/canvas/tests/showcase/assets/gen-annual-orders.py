#!/usr/bin/env python3
# annual-orders.csv — the Paged Annual's data-chapter order book: 48 rows of
# the (fictional) print shop's year, one row per job.
#
# stdlib only, NO randomness — every field is derived from the fixed tables
# below, so re-running is byte-stable:
#
#     python3 gen-annual-orders.py
#
# The columns exercise paged.data end to end:
#   id          stable integer key
#   customer    realistic shop names (self-authored, fictional)
#   region      exactly FOUR groups (Alpine/Harbour/Plateau/Old Town) for
#               grouping + group headers
#   product     the shop's own product line
#   qty         integers (SUM/AVG demos)
#   unit_price  decimals (currency formatting)
#   order_date  ISO dates across the annual's year (date functions)
#   sku         Code-128-able strings (uppercase + digits + dashes)
#   ean         13 digits with a VALID EAN-13 check digit (computed below)
#   upc         12 digits with a VALID UPC-A check digit (computed below)
#   url         per-order URL (QR demos)
#   notes       free text, SOME EMPTY (ISBLANK/COALESCE demos)
#
# All content is self-authored for the Paged Annual; no third-party data.

import os

HERE = os.path.dirname(os.path.abspath(__file__))

CUSTOMERS = [
    # (customer, region) — 12 accounts across the four regions.
    ("Bergfeld Booksellers", "Alpine"),
    ("The Pass Hotel", "Alpine"),
    ("Kettner Chocolatier", "Alpine"),
    ("Quayside Fish Market", "Harbour"),
    ("Harbour Light Theatre", "Harbour"),
    ("Mole & Anchor Tavern", "Harbour"),
    ("Plateau Agricultural Fair", "Plateau"),
    ("Windrow Seed Company", "Plateau"),
    ("The Long Field Gallery", "Plateau"),
    ("Old Town Apothecary", "Old Town"),
    ("Corvus Stationers", "Old Town"),
    ("The Bellfounders' Guild", "Old Town"),
]

PRODUCTS = [
    # (product, unit_price) — the shop's line, priced per copy.
    ("Letterpress poster", "4.80"),
    ("Concert programme", "1.35"),
    ("Menu card", "2.10"),
    ("Wedding invitation", "3.25"),
    ("Shop ledger", "12.50"),
    ("Seed catalogue", "5.60"),
    ("Exhibition folio", "9.75"),
    ("Label sheet", "0.85"),
]

QTYS = [120, 250, 80, 500, 60, 340, 150, 1000, 45, 220, 400, 90]

# Note text stays comma-free: the file is plain unquoted CSV by design.
NOTES = {
    2: "rush job on a two-day turnaround",
    5: "",
    7: "reprint of last year's run",
    11: "customer supplied paper",
    14: "second colour added on press",
    19: "",
    22: "bundled with the fair programme",
    27: "foil seal on the cover",
    31: "",
    36: "delivered in two lots",
    41: "gold ink with a test run first",
    46: "",
}


def ean13(twelve):
    """EAN-13 check digit: weights 1,3 alternating from the FIRST digit."""
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(twelve))
    return twelve + str((10 - s % 10) % 10)


def upca(eleven):
    """UPC-A check digit: weights 3,1 alternating from the FIRST digit."""
    s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(eleven))
    return eleven + str((10 - s % 10) % 10)


REGION_CODE = {"Alpine": "ALP", "Harbour": "HBR", "Plateau": "PLT", "Old Town": "OLD"}


def main():
    rows = ["id,customer,region,product,qty,unit_price,order_date,sku,ean,upc,url,notes"]
    for i in range(48):
        oid = 1001 + i
        customer, region = CUSTOMERS[i % len(CUSTOMERS)]
        product, price = PRODUCTS[(i * 5) % len(PRODUCTS)]
        qty = QTYS[(i * 7) % len(QTYS)]
        # One order every ~7-8 days across the annual's year.
        month = (i // 4) + 1
        day = (i % 4) * 7 + 3
        date = f"2025-{month:02d}-{day:02d}"
        sku = f"PA-2025-{oid}-{REGION_CODE[region]}"
        ean = ean13(f"900783{oid:06d}")
        upc = upca(f"072034{oid % 100000:05d}")
        url = f"https://paged.media/annual/orders/{oid}"
        note = NOTES.get(i, "") if i in NOTES else (
            "" if i % 9 == 4 else f"run of {qty} for {region.lower()} delivery"
        )
        rows.append(
            f"{oid},{customer},{region},{product},{qty},{price},{date},{sku},{ean},{upc},{url},{note}"
        )
    out = os.path.join(HERE, "annual-orders.csv")
    with open(out, "w", newline="") as f:
        f.write("\n".join(rows) + "\n")
    print("wrote annual-orders.csv")


if __name__ == "__main__":
    main()
