#!/usr/bin/env python3
"""
Runs on a GitHub Actions schedule (see .github/workflows/check-status.yml).

What it does:
  1. Queries Google News' public RSS search for CBSE Class 10 second board
     result coverage.
  2. Keeps only items whose publisher is on TRUSTED_PUBLISHERS below.
  3. Looks for a declaration-style headline pattern ("result declared",
     "results out", "result released", etc.) alongside CBSE/Class 10 wording.
  4. If a trusted match is found, marks data.json's "newsSignal" as detected
     (this is clearly separate from "resultDeclared", which is reserved for
     an actual official CBSE confirmation you enter yourself).
  5. Always updates newsSignal.lastChecked, whether or not anything was found,
     so the app can show "we last checked at HH:MM".

This script never copies headline text into data.json (copyright + to avoid
false confidence) — it only stores the publisher name, link, and timestamp.
"""

import json
import re
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

DATA_PATH = "data.json"

QUERY = "CBSE Class 10 second board exam result"
RSS_URL = (
    "https://news.google.com/rss/search?q="
    + urllib.parse.quote(QUERY)
    + "&hl=en-IN&gl=IN&ceid=IN:en"
)

# Only these publishers count as a "trusted" signal. Edit freely, but keep it
# to recognised, established news organisations — not random blogs.
TRUSTED_PUBLISHERS = [
    "Hindustan Times",
    "The Times of India",
    "The Indian Express",
    "NDTV",
    "India Today",
    "The Hindu",
    "Livemint",
    "ABP Live",
    "Zee News",
    "Press Trust of India",
    "PTI",
    "ANI",
    "Jagran Josh",
    "News18",
]

DECLARED_PATTERNS = [
    r"\bresult(s)?\s+(declared|out|released|announced)\b",
    r"\bdeclares?\s+result",
    r"\bresult(s)?\s+is\s+out\b",
]

CBSE_HINT = re.compile(r"\bcbse\b", re.IGNORECASE)
CLASS10_HINT = re.compile(r"class\s*10|class\s*x\b|10th", re.IGNORECASE)
DECLARED_RE = re.compile("|".join(DECLARED_PATTERNS), re.IGNORECASE)


def fetch_rss(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def parse_items(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else ""
        items.append({"title": title, "link": link, "pubDate": pub_date, "source": source})
    return items


def find_trusted_declared_item(items):
    for it in items:
        title = it["title"]
        source = it["source"]
        if not any(pub.lower() in source.lower() for pub in TRUSTED_PUBLISHERS):
            continue
        if not CBSE_HINT.search(title):
            continue
        if not CLASS10_HINT.search(title):
            continue
        if DECLARED_RE.search(title):
            return it
    return None


def main():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    news_signal = data.get("newsSignal", {})
    news_signal["lastChecked"] = now_iso
    news_signal.setdefault("detected", False)
    news_signal.setdefault("source", None)
    news_signal.setdefault("sourceUrl", None)
    news_signal.setdefault("detectedAt", None)

    try:
        xml_bytes = fetch_rss(RSS_URL)
        items = parse_items(xml_bytes)
        match = find_trusted_declared_item(items)
        if match and not news_signal.get("detected"):
            news_signal["detected"] = True
            news_signal["source"] = match["source"]
            news_signal["sourceUrl"] = match["link"]
            news_signal["detectedAt"] = now_iso
            print(f"MATCH: {match['source']} -> {match['link']}")
        elif match:
            # Already flagged before; keep original detectedAt but refresh link/source
            news_signal["source"] = match["source"]
            news_signal["sourceUrl"] = match["link"]
            print(f"Still matching: {match['source']}")
        else:
            print("No trusted declaration-style headline found this run.")
    except Exception as e:
        print(f"Check failed (non-fatal): {e}", file=sys.stderr)
        news_signal["lastError"] = str(e)

    data["newsSignal"] = news_signal

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
