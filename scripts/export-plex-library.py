from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

TYPE_MAP = {
    1: "movie",
    2: "show",
    3: "season",
    4: "episode",
    8: "artist",
    9: "album",
    10: "track",
}

SECTION_TYPE_MAP = {
    1: "movie",
    2: "show",
    8: "audio",
    13: "photo",
}


def to_iso(value: int | str | None) -> str | None:
    if value in (None, "", 0, "0"):
        return None

    try:
        return datetime.fromtimestamp(int(value)).astimezone().isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        try:
            return datetime.fromisoformat(str(value)).astimezone().isoformat()
        except ValueError:
            return str(value)


def trim(text: str | None, max_length: int = 220) -> str | None:
    if not text:
        return None

    compact = " ".join(text.split())
    if len(compact) <= max_length:
        return compact

    return f"{compact[: max_length - 3]}..."


def split_csv(value: str | None) -> list[str]:
    if not value:
        return []

    return [part.strip() for part in value.split(",") if part and part.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    db_path = Path(args.db_path).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    sections = [
        {
            "id": row["id"],
            "name": row["name"],
            "sectionType": SECTION_TYPE_MAP.get(row["section_type"], str(row["section_type"])),
            "itemCount": 0,
            "lastScannedAt": to_iso(row["scanned_at"]),
        }
        for row in conn.execute(
            """
            SELECT id, name, section_type, scanned_at
            FROM library_sections
            ORDER BY name
            """
        )
    ]

    items = []
    section_counts = {section["id"]: 0 for section in sections}

    query = """
        SELECT
            mi.id AS rating_key,
            mi.title,
            mi.metadata_type,
            ls.name AS section_name,
            mi.year,
            parent.title AS parent_title,
            grandparent.title AS grandparent_title,
            mi.summary,
            mi.added_at,
            ls.id AS section_id,
            mi.originally_available_at,
            mi.rating,
            mi.content_rating,
            NULLIF(mi.studio, '') AS studio,
            mi."index" AS item_index,
            parent."index" AS parent_index,
            MAX(media.duration) AS duration_ms,
            GROUP_CONCAT(DISTINCT CASE WHEN tags.tag_type = 1 AND tags.tag <> '' THEN tags.tag END) AS genres
        FROM metadata_items mi
        LEFT JOIN library_sections ls ON ls.id = mi.library_section_id
        LEFT JOIN metadata_items parent ON parent.id = mi.parent_id
        LEFT JOIN metadata_items grandparent ON grandparent.id = parent.parent_id
        LEFT JOIN media_items media ON media.metadata_item_id = mi.id
        LEFT JOIN taggings tg ON tg.metadata_item_id = mi.id
        LEFT JOIN tags ON tags.id = tg.tag_id
        WHERE mi.deleted_at IS NULL
          AND mi.title IS NOT NULL
          AND mi.title <> ''
          AND ls.id IS NOT NULL
          AND ls.name IS NOT NULL
          AND mi.metadata_type IN (1, 2, 3, 4, 8, 9, 10)
        GROUP BY
            mi.id,
            mi.title,
            mi.metadata_type,
            ls.name,
            mi.year,
            parent.title,
            grandparent.title,
            mi.summary,
            mi.added_at,
            ls.id,
            mi.originally_available_at,
            mi.rating,
            mi.content_rating,
            mi.studio,
            mi."index",
            parent."index"
        ORDER BY ls.name, mi.title
    """

    for row in conn.execute(query):
        item_type = TYPE_MAP.get(row["metadata_type"], str(row["metadata_type"]))
        item = {
            "ratingKey": row["rating_key"],
            "title": row["title"],
            "itemType": item_type,
            "section": row["section_name"] or "Unknown",
            "year": row["year"],
            "parentTitle": row["parent_title"],
            "grandparentTitle": row["grandparent_title"],
            "summarySnippet": trim(row["summary"]),
            "addedAt": to_iso(row["added_at"]),
            "originallyAvailableAt": to_iso(row["originally_available_at"]),
            "rating": row["rating"],
            "contentRating": row["content_rating"] or None,
            "studio": row["studio"] or None,
            "durationMs": row["duration_ms"],
            "genres": split_csv(row["genres"]),
            "seasonIndex": row["parent_index"] if item_type == "episode" else None,
            "episodeIndex": row["item_index"] if item_type == "episode" else None,
        }
        items.append(item)
        section_id = row["section_id"]
        if section_id in section_counts:
            section_counts[section_id] += 1

    for section in sections:
        section["itemCount"] = section_counts.get(section["id"], 0)

    payload = {
        "generatedAt": datetime.now().astimezone().isoformat(),
        "databasePath": str(db_path),
        "sections": sections,
        "items": items,
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    summary = {
        "generatedAt": payload["generatedAt"],
        "databasePath": payload["databasePath"],
        "outputPath": str(output_path),
        "sectionCount": len(sections),
        "indexedItemCount": len(items),
        "sections": sections,
    }

    print(json.dumps(summary))


if __name__ == "__main__":
    main()
