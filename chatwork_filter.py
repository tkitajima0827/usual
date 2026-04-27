"""
Chatwork channel monitor: fetch recent posts and auto-apply to those
matching the configured criteria (e.g. annual revenue >= 10M yen).

Usage:
    CHATWORK_API_TOKEN=<token> python chatwork_filter.py

Environment variables:
    CHATWORK_API_TOKEN  (required) Your Chatwork API token
    ROOM_ID             (optional) Override the default room ID
    APPLY_MESSAGE       (optional) Override the default application message
    HOURS               (optional) Look-back window in hours (default: 3)
"""

import os
import re
import time
import datetime
import requests

CHATWORK_API_BASE = "https://api.chatwork.com/v2"
DEFAULT_ROOM_ID = "246111943"
DEFAULT_HOURS = 3

# Criteria: posts that mention annual revenue >= 10M yen
REVENUE_PATTERNS = [
    r"年商[^\d]*([0-9,，]+)\s*万円以上",
    r"年商[^\d]*([0-9,，]+)\s*万円",
    r"年商[^\d]*([0-9,，]+)\s*億円",
    r"年商\s*1[,，]?000万円以上",
    r"年商.*?([0-9,，]+)\s*(万|億)円",
]

KEYWORDS_REQUIRED = ["年商1,000万円以上", "年商1000万円以上", "年商１，０００万円以上"]


def get_headers(api_token: str) -> dict:
    return {"X-ChatWorkToken": api_token}


def get_recent_messages(api_token: str, room_id: str, hours: int) -> list[dict]:
    """Fetch messages from the room posted within the last `hours` hours."""
    url = f"{CHATWORK_API_BASE}/rooms/{room_id}/messages"
    params = {"force": 1}
    resp = requests.get(url, headers=get_headers(api_token), params=params, timeout=30)
    resp.raise_for_status()
    messages = resp.json()

    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    cutoff_ts = int(cutoff.timestamp())

    return [m for m in messages if m.get("send_time", 0) >= cutoff_ts]


def extract_revenue_value(text: str) -> int | None:
    """
    Try to extract an annual revenue (年商) value in 万円 units.
    Returns None if not found.
    """
    # 億円 pattern
    m = re.search(r"年商[^\d]*([0-9,，]+)\s*億円", text)
    if m:
        val = int(m.group(1).replace(",", "").replace("，", ""))
        return val * 10000  # convert 億→万

    # 万円 pattern
    m = re.search(r"年商[^\d]*([0-9,，]+)\s*万円", text)
    if m:
        val = int(m.group(1).replace(",", "").replace("，", ""))
        return val

    return None


def matches_criteria(text: str) -> bool:
    """Return True if the post satisfies the filter criteria."""
    # Direct keyword match (covers most common formats)
    for kw in KEYWORDS_REQUIRED:
        if kw in text:
            return True

    # Numeric extraction fallback: >= 1000万円
    val = extract_revenue_value(text)
    if val is not None and val >= 1000:
        return True

    return False


def post_reply(api_token: str, room_id: str, message_id: str, reply_text: str) -> dict:
    """Post a reply message to the room (quoting the original message)."""
    url = f"{CHATWORK_API_BASE}/rooms/{room_id}/messages"
    body = f"[rp aid={message_id} to={room_id}-{message_id}]\n{reply_text}"
    data = {"body": body, "self_unread": 0}
    resp = requests.post(url, headers=get_headers(api_token), data=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    api_token = os.environ.get("CHATWORK_API_TOKEN")
    if not api_token:
        raise SystemExit("ERROR: CHATWORK_API_TOKEN environment variable is not set.")

    room_id = os.environ.get("ROOM_ID", DEFAULT_ROOM_ID)
    hours = int(os.environ.get("HOURS", DEFAULT_HOURS))
    apply_message = os.environ.get(
        "APPLY_MESSAGE",
        "はじめまして。条件を拝見し、ぜひご一緒させていただきたくご連絡いたしました。\n"
        "詳細についてお聞かせいただけますでしょうか。よろしくお願いいたします。",
    )

    print(f"Fetching messages from room {room_id} (last {hours} hours)...")
    messages = get_recent_messages(api_token, room_id, hours)
    print(f"  Found {len(messages)} messages in the time window.")

    matched = [m for m in messages if matches_criteria(m.get("body", ""))]
    print(f"  Matched {len(matched)} messages meeting criteria (年商1,000万円以上).")

    for msg in matched:
        msg_id = str(msg["message_id"])
        account = msg.get("account", {})
        sender = account.get("name", "unknown")
        send_time = datetime.datetime.fromtimestamp(
            msg["send_time"], tz=datetime.timezone.utc
        ).astimezone().strftime("%Y-%m-%d %H:%M")
        print(f"\n--- Message {msg_id} from {sender} at {send_time} ---")
        print(msg["body"][:200])
        print("Posting application reply...")
        result = post_reply(api_token, room_id, msg_id, apply_message)
        print(f"  Reply posted (message_id: {result.get('message_id')})")
        time.sleep(1)  # brief pause between posts

    if not matched:
        print("No matching posts found. Nothing to apply to.")


if __name__ == "__main__":
    main()
