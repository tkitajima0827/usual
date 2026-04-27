"""
Chatwork 税理士紹介依頼チャンネル監視・マネーフォワード顧客紹介フォーム自動応募

使い方:
    CHATWORK_API_TOKEN=<token> python3 chatwork_apply.py

環境変数:
    CHATWORK_API_TOKEN  (必須) ChatworkのAPIトークン
    ROOM_ID             (任意) ルームID (デフォルト: 246111943)
    HOURS               (任意) 遡る時間数 (デフォルト: 3)
"""

import os
import re
import time
import datetime
import requests
from playwright.sync_api import sync_playwright, Page

# ─── 定数 ────────────────────────────────────────────────────────────────────

CHATWORK_API_BASE = "https://api.chatwork.com/v2"
DEFAULT_ROOM_ID = "246111943"
DEFAULT_HOURS = 3
CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

TARGET_PREFECTURES = {"東京都", "神奈川県", "埼玉県", "千葉県"}

# 事務所情報
OFFICE_NAME = "ステラリンクス税理士事務所"
OFFICE_PREFECTURE = "東京都"
PHONE = "03-6285-2646"
CONTACT_NAME = "北島智行"
EMAIL = "customer_info@stella-l.com"

# ─── Chatwork API ─────────────────────────────────────────────────────────────


def cw_headers(token: str) -> dict:
    return {"X-ChatWorkToken": token}


def fetch_recent_messages(token: str, room_id: str, hours: int) -> list[dict]:
    url = f"{CHATWORK_API_BASE}/rooms/{room_id}/messages"
    resp = requests.get(url, headers=cw_headers(token), params={"force": 1}, timeout=30)
    resp.raise_for_status()
    cutoff_ts = int(
        (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)).timestamp()
    )
    return [m for m in resp.json() if m.get("send_time", 0) >= cutoff_ts]


# ─── テキスト正規化 ────────────────────────────────────────────────────────────


def normalize(text: str) -> str:
    """全角数字・記号→半角"""
    table = str.maketrans(
        "０１２３４５６７８９，．　・",
        "0123456789,. ·",
    )
    return text.translate(table)


# ─── フィルタリングロジック ────────────────────────────────────────────────────


def is_tax_accountant_case(text: str) -> bool:
    """社労士案件を除外し、税理士案件のみ通す"""
    if "社労士" in text and "税理士" not in text:
        return False
    # 「税理士」が明示されていれば対象
    return "税理士" in text


def check_revenue(text: str) -> bool:
    """
    年商1,000万円超の案件のみ True を返す。
    「〜1,000万」「1,000万以下」等は False。
    """
    n = normalize(text)

    # 明示的な除外パターン
    # "1,000万以下" / "〜1,000万" など
    exclude_patterns = [
        r"年商[^。\n]*?[〜～]1[,，]?000\s*万",          # 〜1000万
        r"年商[^。\n]*?1[,，]?000\s*万[円]?以下",        # 1000万以下
        r"年商[^。\n]*?〜?1[,，]?000\s*万[円]?未満",     # 1000万未満
    ]
    for pat in exclude_patterns:
        if re.search(pat, n):
            return False

    # 億円パターン（どれも1000万超）
    if re.search(r"年商[^。\n]*?[0-9]+\s*億", n):
        return True

    # "1,000万超" / "1000万超" → include
    if re.search(r"年商[^。\n]*?1[,，]?000\s*万[円]?超", n):
        return True

    # 数値抽出: 万円単位で1000超
    m = re.search(r"年商[^。\n]*?([0-9][0-9,，]*)\s*万", n)
    if m:
        val = int(m.group(1).replace(",", "").replace("，", ""))
        return val > 1000

    return False


def check_location(text: str) -> bool:
    """
    一都三県、またはそれ以外でも「地域の希望」が「特にない」「リモート」なら True
    """
    n = normalize(text)

    # 都道府県の抽出
    pref_match = re.search(
        r"(?:所在地|住所|都道府県)[：:\s]*([^\s\n　]+?(?:都|道|府|県))",
        text,
    )
    if pref_match:
        pref = pref_match.group(1).strip()
        for target in TARGET_PREFECTURES:
            if target in pref:
                return True
    else:
        # 本文中に直接含まれているか
        for pref in TARGET_PREFECTURES:
            if pref in text:
                return True

    # 一都三県外でも「地域の希望」が条件を満たす場合
    region_match = re.search(
        r"地域[のノ]希望[：:\s]*([^\n]+)",
        text,
    )
    if region_match:
        region = region_match.group(1)
        if re.search(r"特[にに]?な[いい]|なし|リモート|remote|不問", region, re.IGNORECASE):
            return True

    return False


def check_service_expectation(text: str) -> bool:
    """
    「必要最低限の画一的な対応で良いので費用を抑えたい」が含まれていたら False
    """
    return "必要最低限の画一的な対応" not in text


def check_mf_status(text: str) -> bool:
    """
    「利用予定はない/今お使いの他社会計ソフトを利用」が含まれていたら False
    """
    exclude_phrases = [
        "利用予定はない",
        "他社会計ソフトを利用",
        "利用予定はない/今お使いの他社会計ソフトを利用",
    ]
    for phrase in exclude_phrases:
        if phrase in text:
            return False
    return True


def matches_all_criteria(text: str) -> bool:
    checks = [
        ("税理士案件か", is_tax_accountant_case(text)),
        ("年商1,000万超か", check_revenue(text)),
        ("所在地/地域条件", check_location(text)),
        ("サービス期待値", check_service_expectation(text)),
        ("MFクラウド利用状況", check_mf_status(text)),
    ]
    passed = True
    for name, result in checks:
        status = "OK" if result else "NG"
        print(f"    [{status}] {name}")
        if not result:
            passed = False
    return passed


# ─── 投稿パース ────────────────────────────────────────────────────────────────


def extract_case_number(text: str) -> str:
    """お問合わせ番号を抽出"""
    m = re.search(r"お問合[わ]?せ番号[：:\s]*([A-Za-z0-9\-_]+)", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"案件番号[：:\s]*([A-Za-z0-9\-_]+)", text)
    if m:
        return m.group(1).strip()
    return ""


def extract_form_url(text: str) -> str:
    """マネーフォワードクラウド顧客紹介希望フォームのURLを抽出"""
    # Chatwork記法: [タイトル](URL)
    m = re.search(r"\[(?:[^\]]*マネーフォワード[^\]]*顧客紹介[^\]]*)\]\((https?://[^\)]+)\)", text)
    if m:
        return m.group(1)
    # 直後にURLがある場合
    m = re.search(r"顧客紹介希望フォーム[^\n]*\n?(https?://\S+)", text)
    if m:
        return m.group(1)
    # 単純にhttps://forms を探す
    m = re.search(r"(https?://[^\s\n]+(?:form|Form)[^\s\n]*)", text)
    if m:
        return m.group(1)
    # 最後の手段: メッセージ中の全URL
    urls = re.findall(r"https?://\S+", text)
    for url in urls:
        if "form" in url.lower() or "mf" in url.lower() or "moneyforward" in url.lower():
            return url
    return urls[0] if urls else ""


def extract_business_keywords(text: str) -> dict:
    """投稿から業種・年商・希望内容等を抽出"""
    info = {}

    m = re.search(r"(?:業種|業態|事業内容)[：:\s]*([^\n]+)", text)
    if m:
        info["業種"] = m.group(1).strip()

    m = re.search(r"年商[：:\s]*([^\n]+)", text)
    if m:
        info["年商"] = m.group(1).strip()

    m = re.search(r"(?:依頼内容|希望内容|ご要望)[：:\s]*([^\n]+)", text)
    if m:
        info["依頼内容"] = m.group(1).strip()

    m = re.search(r"(?:従業員|社員)[数員]?[：:\s]*([^\n]+)", text)
    if m:
        info["従業員"] = m.group(1).strip()

    m = re.search(r"(?:設立|創業)[：:\s]*([^\n]+)", text)
    if m:
        info["設立"] = m.group(1).strip()

    return info


# ─── ポイント欄生成 ────────────────────────────────────────────────────────────

STRENGTHS = [
    ("資金調達", "資金調達（融資・補助金）支援と健全な財務体質づくりが得意です。"),
    ("管理会計", "意思決定のための管理会計を活用した月次経営判断サポートを提供しています。"),
    ("マネーフォワード", "マネーフォワードを活用した経理自動化・バックオフィス効率化支援を得意としています。"),
    ("起業", "起業・設立初期からの経理体制構築とマネーフォワード導入支援の実績があります。"),
    ("経営", "MBAと現場経験を融合した再現性の高い経営支援・伴走型スタイルが特徴です。"),
    ("組織", "23歳から80人超のマネジメント経験に基づく組織・人材課題への対応力があります。"),
    ("料金", "顧問料を年商・利益に連動させた利害一致型の料金体系を採用しています。"),
    ("税務", "追徴リスクのない誠実な税務対応と長期的な信頼関係を大切にしています。"),
]

INDUSTRY_KEYWORDS = {
    "飲食": ["資金調達", "管理会計", "マネーフォワード"],
    "IT": ["マネーフォワード", "管理会計", "経営"],
    ("起業", "設立", "創業"): ["起業", "マネーフォワード", "経営"],
    "製造": ["管理会計", "資金調達", "マネーフォワード"],
    "小売": ["管理会計", "マネーフォワード", "資金調達"],
    "不動産": ["管理会計", "資金調達", "税務"],
    "医療": ["税務", "管理会計", "マネーフォワード"],
    "建設": ["資金調達", "管理会計", "税務"],
}


def build_appeal_text(text: str, info: dict) -> str:
    """案件内容に応じて100〜200文字のポイント欄テキストを生成"""
    industry = info.get("業種", "")
    revenue = info.get("年商", "")
    needs = info.get("依頼内容", "")
    full = text + industry + needs

    selected_keys: list[str] = []
    for kw, priorities in INDUSTRY_KEYWORDS.items():
        if isinstance(kw, tuple):
            if any(k in full for k in kw):
                selected_keys = priorities
                break
        elif kw in full:
            selected_keys = priorities
            break

    if not selected_keys:
        # MFクラウド・経営支援 をデフォルトで選択
        selected_keys = ["マネーフォワード", "管理会計", "経営"]

    # 対応する強みテキストを取得
    points: list[str] = []
    for key, desc in STRENGTHS:
        if key in selected_keys and desc not in points:
            points.append(desc)
        if len(points) >= 2:
            break

    # 資金調達ニーズがあれば追加
    if re.search(r"融資|補助金|資金調達", full) and len(points) < 3:
        for key, desc in STRENGTHS:
            if key == "資金調達" and desc not in points:
                points.append(desc)

    body = "".join(points)

    # 結びの文
    closing = "社長と同じ熱量で経営戦略を共に考える伴走型スタイルで、貴社の成長を全力でサポートいたします。"

    appeal = body + closing

    # 200文字以内に収める
    if len(appeal) > 200:
        appeal = appeal[:197] + "..."

    # 100文字以上を保証
    if len(appeal) < 100:
        supplement = "マネーフォワードを活用した経理効率化と、意思決定に役立つ管理会計サポートで経営者の右腕として支援いたします。"
        appeal = appeal + supplement
        appeal = appeal[:200]

    return appeal


# ─── フォーム送信 (Playwright) ────────────────────────────────────────────────


def fill_form(page: Page, case_number: str, appeal_text: str) -> bool:
    """マネーフォワードクラウド顧客紹介希望フォームを入力して送信する"""

    def try_fill(label_text: str, value: str) -> bool:
        """ラベルテキストで入力欄を特定して入力"""
        # label要素でフィールドを探す
        try:
            field = page.get_by_label(label_text, exact=False)
            if field.count() > 0:
                field.first.fill(value)
                return True
        except Exception:
            pass

        # placeholderで探す
        try:
            field = page.get_by_placeholder(label_text, exact=False)
            if field.count() > 0:
                field.first.fill(value)
                return True
        except Exception:
            pass

        return False

    page.wait_for_load_state("networkidle", timeout=15000)

    fields = [
        ("事務所名", OFFICE_NAME),
        ("事業所所在地", OFFICE_PREFECTURE),
        ("電話番号", PHONE),
        ("担当者名", CONTACT_NAME),
        ("メールアドレス", EMAIL),
        ("案件番号", case_number),
    ]

    for label, value in fields:
        if not try_fill(label, value):
            print(f"    警告: 「{label}」フィールドが見つかりませんでした")

    # 都道府県がselectの場合
    try:
        select = page.locator("select").first
        if select.count() > 0:
            select.select_option(label=OFFICE_PREFECTURE)
    except Exception:
        pass

    # ポイント欄（textarea）
    appeal_labels = ["ご提供できるポイント", "ポイント", "アピール", "提供できる"]
    filled_appeal = False
    for label in appeal_labels:
        try:
            field = page.get_by_label(label, exact=False)
            if field.count() > 0:
                field.first.fill(appeal_text)
                filled_appeal = True
                break
        except Exception:
            pass
    if not filled_appeal:
        # textareaを直接探す
        try:
            areas = page.locator("textarea")
            if areas.count() > 0:
                areas.last.fill(appeal_text)
        except Exception:
            print("    警告: ポイント欄が見つかりませんでした")

    # 同意チェックボックス
    try:
        checkboxes = page.locator("input[type='checkbox']")
        for i in range(checkboxes.count()):
            cb = checkboxes.nth(i)
            if not cb.is_checked():
                cb.check()
    except Exception:
        print("    警告: チェックボックスが見つかりませんでした")

    # 送信ボタン
    submit_selectors = [
        "input[type='submit']",
        "button[type='submit']",
        "button:has-text('送信')",
        "button:has-text('Submit')",
        "button:has-text('確認')",
    ]
    submitted = False
    for selector in submit_selectors:
        try:
            btn = page.locator(selector)
            if btn.count() > 0:
                btn.first.click()
                submitted = True
                break
        except Exception:
            pass

    if not submitted:
        print("    警告: 送信ボタンが見つかりませんでした")
        return False

    # 送信完了を待機
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass

    return True


# ─── メイン処理 ───────────────────────────────────────────────────────────────


def main():
    token = os.environ.get("CHATWORK_API_TOKEN")
    if not token:
        raise SystemExit("ERROR: CHATWORK_API_TOKEN が設定されていません。")

    room_id = os.environ.get("ROOM_ID", DEFAULT_ROOM_ID)
    hours = int(os.environ.get("HOURS", DEFAULT_HOURS))

    print(f"[STEP 1] Chatworkルーム {room_id} から直近{hours}時間のメッセージを取得中...")
    messages = fetch_recent_messages(token, room_id, hours)
    print(f"  → {len(messages)}件のメッセージを取得")

    if not messages:
        print("対象メッセージなし。終了します。")
        return

    print("\n[STEP 2] フィルタリング...")
    candidates = []
    for msg in messages:
        body = msg.get("body", "")
        sender = msg.get("account", {}).get("name", "不明")
        send_time = datetime.datetime.fromtimestamp(
            msg["send_time"], tz=datetime.timezone.utc
        ).astimezone().strftime("%Y-%m-%d %H:%M")
        msg_id = msg["message_id"]

        print(f"\n  --- メッセージ {msg_id} / {sender} / {send_time} ---")
        print(f"  {body[:100].replace(chr(10), ' ')}...")

        if matches_all_criteria(body):
            candidates.append(msg)
            print("  ★ 応募対象")
        else:
            print("  × 除外")

    if not candidates:
        print("\n条件を満たす案件がありませんでした。終了します。")
        return

    print(f"\n[STEP 3] {len(candidates)}件のフォームに応募します...")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            executable_path=CHROMIUM_PATH,
        )
        context = browser.new_context()

        for msg in candidates:
            body = msg.get("body", "")
            msg_id = msg["message_id"]

            case_number = extract_case_number(body)
            form_url = extract_form_url(body)
            info = extract_business_keywords(body)
            appeal = build_appeal_text(body, info)

            print(f"\n  --- 案件 {msg_id} ---")
            print(f"  お問合わせ番号: {case_number}")
            print(f"  フォームURL: {form_url}")
            print(f"  ポイント欄 ({len(appeal)}字): {appeal}")

            if not form_url:
                print("  警告: フォームURLが見つかりません。スキップします。")
                continue

            page = context.new_page()
            try:
                page.goto(form_url, timeout=20000)
                success = fill_form(page, case_number, appeal)
                if success:
                    print(f"  ✓ 送信完了")
                else:
                    print(f"  △ 送信未確認（手動確認が必要）")
            except Exception as e:
                print(f"  エラー: {e}")
            finally:
                page.close()

            time.sleep(2)

        context.close()
        browser.close()

    print("\n完了。")


if __name__ == "__main__":
    main()
