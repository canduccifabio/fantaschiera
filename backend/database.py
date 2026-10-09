import json
import os
import re
from typing import List, Dict, Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
SQUADS_FILE = os.path.join(DATA_DIR, 'user_squads.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
PLAYERS_FILE = os.path.join(DATA_DIR, 'players_cache.json')

DEFAULT_SAMPLE_SQUAD = [
    # 3 Portieri
    {'name': 'Maignan', 'role': 'P', 'team': 'MIL', 'qa': 14, 'fvm': 60},
    {'name': 'De Gea', 'role': 'P', 'team': 'FIO', 'qa': 11, 'fvm': 40},
    {'name': 'Bijlow', 'role': 'P', 'team': 'GEN', 'qa': 6, 'fvm': 15},
    # 8 Difensori
    {'name': 'Dimarco', 'role': 'D', 'team': 'INT', 'qa': 22, 'fvm': 150},
    {'name': 'Bremer', 'role': 'D', 'team': 'JUV', 'qa': 18, 'fvm': 100},
    {'name': 'Buongiorno', 'role': 'D', 'team': 'NAP', 'qa': 16, 'fvm': 90},
    {'name': 'Pavard', 'role': 'D', 'team': 'INT', 'qa': 12, 'fvm': 60},
    {'name': 'Vasquez', 'role': 'D', 'team': 'GEN', 'qa': 9, 'fvm': 25},
    {'name': 'Ranieri L.', 'role': 'D', 'team': 'FIO', 'qa': 10, 'fvm': 30},
    {'name': 'Marcandalli', 'role': 'D', 'team': 'GEN', 'qa': 6, 'fvm': 12},
    {'name': 'Dragusin', 'role': 'D', 'team': 'FIO', 'qa': 8, 'fvm': 20},
    # 8 Centrocampisti
    {'name': 'Pulisic', 'role': 'C', 'team': 'MIL', 'qa': 28, 'fvm': 220, 'is_penalty_taker': True},
    {'name': 'Calhanoglu', 'role': 'C', 'team': 'INT', 'qa': 26, 'fvm': 210, 'is_penalty_taker': True},
    {'name': 'Paz N.', 'role': 'C', 'team': 'COM', 'qa': 29, 'fvm': 235},
    {'name': 'McTominay', 'role': 'C', 'team': 'NAP', 'qa': 22, 'fvm': 130},
    {'name': 'Frendrup', 'role': 'C', 'team': 'GEN', 'qa': 10, 'fvm': 35},
    {'name': 'Baldanzi', 'role': 'C', 'team': 'GEN', 'qa': 11, 'fvm': 40},
    {'name': 'Fagioli', 'role': 'C', 'team': 'FIO', 'qa': 9, 'fvm': 25},
    {'name': 'Ellertsson', 'role': 'C', 'team': 'GEN', 'qa': 7, 'fvm': 18},
    # 6 Attaccanti
    {'name': 'Martinez L.', 'role': 'A', 'team': 'INT', 'qa': 36, 'fvm': 418, 'is_penalty_taker': True},
    {'name': 'Thuram', 'role': 'A', 'team': 'INT', 'qa': 31, 'fvm': 260},
    {'name': 'Lookman', 'role': 'A', 'team': 'ATA', 'qa': 28, 'fvm': 230},
    {'name': 'Vitinha O.', 'role': 'A', 'team': 'GEN', 'qa': 14, 'fvm': 55},
    {'name': 'Osmajic', 'role': 'A', 'team': 'GEN', 'qa': 12, 'fvm': 45},
    {'name': 'Njie', 'role': 'A', 'team': 'FIO', 'qa': 8, 'fvm': 20}
]

def load_all_players_catalog() -> List[Dict]:
    if os.path.exists(PLAYERS_FILE):
        try:
            with open(PLAYERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def get_user_squad() -> List[Dict]:
    """Retrieves user's saved squad or returns the default sample squad."""
    if os.path.exists(SQUADS_FILE):
        try:
            with open(SQUADS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if data and isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            pass
    # Save default if not exists
    save_user_squad(DEFAULT_SAMPLE_SQUAD)
    return DEFAULT_SAMPLE_SQUAD

def save_user_squad(players: List[Dict]) -> bool:
    try:
        with open(SQUADS_FILE, 'w', encoding='utf-8') as f:
            json.dump(players, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[DB] Error saving squad: {e}")
        return False

def get_settings() -> Dict:
    defaults = {
        'defense_modifier': True,
        'alert_enabled': True,
        'preferred_formation': 'auto',
        'alert_minutes_before': 60,
        'webhook_url': ''
    }
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                defaults.update(saved)
        except Exception:
            pass
    return defaults

def save_settings(new_settings: Dict) -> bool:
    try:
        cur = get_settings()
        cur.update(new_settings)
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(cur, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[DB] Error saving settings: {e}")
        return False

def parse_text_and_match_players(raw_text: str) -> List[Dict]:
    """
    Parses arbitrary text (e.g. from WhatsApp or clipboard) and extracts players
    matching names against the 600+ Serie A database.
    """
    catalog = load_all_players_catalog()
    if not catalog:
        return []

    lines = re.split(r'[\n,;\r]+', raw_text)
    matched_players = []
    already_added = set()

    for line in lines:
        cleaned = re.sub(r'^[0-9\.\-\*\•\s]+', '', line).strip()
        cleaned = re.sub(r'[\(\[].*?[\)\]]', '', cleaned).strip() # remove bracket info
        if len(cleaned) < 3:
            continue
            
        target = cleaned.lower()
        # Find best match in catalog
        best_match = None
        for p in catalog:
            p_name = p['name'].lower()
            if p_name == target or p_name in target or target in p_name:
                best_match = p
                break
                
        if best_match and best_match['name'] not in already_added:
            already_added.add(best_match['name'])
            matched_players.append(best_match)

    return matched_players
