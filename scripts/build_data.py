#!/usr/bin/env python3
"""Extract photos from trombinoscope.svg, reconcile PDFs, and generate tablal_226.csv."""

import base64
import csv
import io
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
BUQUES_PDF = ROOT / "Liste_buques_226-1.pdf"
REPARTSS_PDF = ROOT / "repartss_famss_onscrits.pdf"
TROMBI_SVG = ROOT / "trombinoscope.svg"
PHOTOS_DIR = ROOT / "photos"
CSV_OUT = ROOT / "tablal_226.csv"

BUQUE_NAME_ALIASES = {
    "droguere": "droguere poncelet",
    "garisi": "garrisi",
    "gerenter de saluneaux": "gerentet de saluneaux",
    "grezskowiak": "grzeskowiak",
    "joingneault": "joigneault",
    "khemeri": "khemiri",
    "la force": "laforce",
    "lassalle": "lassale",
    "levy": "levy vuillermet",
    "maillard": "mailliard",
    "morel micro": "morel alaric",
    "pena": "pena perez",
    "roquain bieron": "rocquain bieron",
    "tezenas": "tezenas de montcel",
    "vingand": "vigand",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def slugify(s: str) -> str:
    return norm(s).replace(" ", "-")


def smart_title(s: str) -> str:
    """Format uppercase trombinoscope names into readable Title Case while preserving accents."""
    particles = {"de", "du", "des", "la", "le", "les"}
    words = s.split()
    out = []
    for idx, w in enumerate(words):
        low = w.lower()
        if idx > 0 and low in particles:
            out.append(low)
        else:
            out.append(low[:1].upper() + low[1:])
    return " ".join(out)


def parse_buques(pdf_path: Path) -> dict[str, tuple[str, str]]:
    reader = PdfReader(str(pdf_path))
    rows_raw: list[tuple[str, str]] = []

    for page in reader.pages:
        rows = defaultdict(list)

        def visitor(text, cm, tm, fontDict, fontSize):
            if text and text.strip():
                px = cm[0] * tm[4] + cm[2] * tm[5] + cm[4]
                py = cm[1] * tm[4] + cm[3] * tm[5] + cm[5]
                rows[round(py, 1)].append((px, text))

        page.extract_text(visitor_text=visitor)
        ys = sorted(rows.keys(), reverse=True)
        merged: list[list] = []
        for y in ys:
            if merged and abs(merged[-1][0] - y) <= 5:
                merged[-1][1].extend(rows[y])
            else:
                merged.append([y, list(rows[y])])

        mid = float(page.mediabox.width) * 0.47
        for _, items in merged:
            items.sort(key=lambda t: t[0])
            left = "".join(t for x, t in items if x < mid).strip()
            right = "".join(t for x, t in items if x >= mid).strip()
            if left.lower().startswith("nom de pek"):
                continue
            assert left and right, f"Empty cell in buques PDF: {(left, right)}"
            if right.endswith("(AM Trad's et pas droit)"):
                right = right.replace(" (AM Trad's et pas droit)", "").strip()
            rows_raw.append((left, right))

    assert len(rows_raw) == 177, f"Expected 177 buques, got {len(rows_raw)}"

    out: dict[str, tuple[str, str]] = {}
    for name, buque in rows_raw:
        k = BUQUE_NAME_ALIASES.get(norm(name), norm(name))
        assert k not in out, f"Duplicate buque key: {k}"
        out[k] = (name, buque)
    return out


def parse_repartss(pdf_path: Path) -> dict[str, tuple[str, str]]:
    reader = PdfReader(str(pdf_path))
    rows_raw: list[tuple[str, str]] = []

    for page in reader.pages:
        lines = [l.strip() for l in page.extract_text().splitlines() if l.strip()]
        i = 0
        while i < len(lines) and (
            lines[i].startswith("Répart") or lines[i] in ("Fam'ss", "Onscrit")
        ):
            i += 1
        body = lines[i:]
        assert len(body) % 2 == 0, f"Odd body line count in repartss: {len(body)}"
        for j in range(0, len(body), 2):
            fam_raw, name = body[j], body[j + 1]
            m = re.search(r"(\d+(?:-\d+)*)\s*$", fam_raw)
            assert m, f"Could not extract fam'ss number from: {fam_raw!r} ({name})"
            rows_raw.append((name, m.group(1)))

    assert len(rows_raw) == 174, f"Expected 174 repartss, got {len(rows_raw)}"

    out: dict[str, tuple[str, str]] = {}
    for name, famss in rows_raw:
        k = norm(name)
        assert k not in out, f"Duplicate repartss key: {k}"
        out[k] = (name, famss)
    return out


def parse_matrix(transform: str) -> list[float] | None:
    m = re.search(r"matrix\(([^)]+)\)", transform or "")
    return [float(x) for x in m.group(1).split(",")] if m else None


def parse_trombi(svg_path: Path) -> dict[str, tuple[str, str]]:
    tree = ET.parse(str(svg_path))
    root = tree.getroot()

    imgs = []
    for el in root.iter():
        if el.tag.endswith("image"):
            mat = parse_matrix(el.attrib.get("transform", ""))
            assert mat, f"Missing matrix on image {el.attrib.get('id')}"
            href = el.attrib.get("{http://www.w3.org/1999/xlink}href") or el.attrib.get("href", "")
            imgs.append((el.attrib.get("id"), mat[4], mat[5], mat[0], mat[3], href))

    assert len(imgs) == 184, f"Expected 184 trombi images, got {len(imgs)}"

    img_texts: dict[int, list[tuple[float, float, str]]] = defaultdict(list)
    for el in root.iter():
        if el.tag.endswith("text"):
            mat = parse_matrix(el.attrib.get("transform", ""))
            if not mat:
                continue
            s = "".join(el.itertext()).strip()
            style = el.attrib.get("style", "") + "".join(
                ";" + c.attrib.get("style", "") for c in el
            )
            mfs = re.search(r"font-size:([0-9.]+)", style)
            fs = float(mfs.group(1)) if mfs else 16.0
            tcx = mat[4] + (len(s) * fs * 0.58 * mat[0]) / 2.0
            ty = mat[5]
            candidates = [
                idx
                for idx, (_, ix, iy, iw, ih, _) in enumerate(imgs)
                if 0 <= ty - (iy + ih) <= 90
            ]
            best = min(
                candidates,
                key=lambda idx: abs(tcx - (imgs[idx][1] + imgs[idx][3] / 2.0)),
            )
            img_texts[best].append((ty, mat[4], s))

    assert len(img_texts) == 184, f"Matched {len(img_texts)} / 184 trombi images"

    out: dict[str, tuple[str, str]] = {}
    for idx, (iid, _, _, _, _, href) in enumerate(imgs):
        name = " ".join(s for _, _, s in sorted(img_texts[idx]))
        k = norm(name)
        assert k not in out, f"Duplicate trombi key: {k}"
        out[k] = (name, href)
    return out


def main() -> None:
    buques = parse_buques(BUQUES_PDF)
    repartss = parse_repartss(REPARTSS_PDF)
    trombi = parse_trombi(TROMBI_SVG)

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    # Remove stale webp files if any
    for old in PHOTOS_DIR.glob("*.webp"):
        old.unlink()

    keys = sorted(set(buques.keys()) | set(repartss.keys()))
    records = []

    for k in keys:
        if k in repartss:
            display_name = repartss[k][0]
        elif k in trombi:
            display_name = smart_title(trombi[k][0])
        else:
            display_name = smart_title(buques[k][0])

        buque = buques[k][1] if k in buques else ""
        famss = repartss[k][1] if k in repartss else ""

        photo_rel = ""
        if k in trombi:
            _, href = trombi[k]
            b64_data = href.split(",", 1)[1]
            im = Image.open(io.BytesIO(base64.b64decode(b64_data))).convert("RGB")
            im = im.resize((420, 560), Image.Resampling.LANCZOS)
            slug = slugify(display_name)
            photo_path = PHOTOS_DIR / f"{slug}.webp"
            im.save(str(photo_path), format="WEBP", quality=82, method=4)
            photo_rel = f"photos/{slug}.webp"

        records.append((k, display_name, buque, famss, photo_rel))

    records.sort(key=lambda r: r[0])

    with open(CSV_OUT, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["nom", "buque", "famss", "photo"])
        for _, nom, buque, famss, photo in records:
            writer.writerow([nom, buque, famss, photo])

    complete = sum(1 for r in records if r[2] and r[3] and r[4])
    no_famss = [r[1] for r in records if r[2] and not r[3]]
    no_buque = [r[1] for r in records if not r[2] and r[3]]
    no_photo = [r[1] for r in records if not r[4]]
    total_kb = sum(p.stat().st_size for p in PHOTOS_DIR.glob("*.webp")) / 1024

    print(f"Generated {CSV_OUT.name}: {len(records)} rows ({complete} complete)")
    print(f"  Without fam'ss ({len(no_famss)}): {no_famss}")
    print(f"  Without buque  ({len(no_buque)}): {no_buque}")
    print(f"  Without photo  ({len(no_photo)}): {no_photo}")
    print(f"Photos written: {len(list(PHOTOS_DIR.glob('*.webp')))} files, {total_kb:.1f} KB total")


if __name__ == "__main__":
    main()
