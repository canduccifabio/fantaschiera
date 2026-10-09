import urllib.request
import json
import os
import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

PLAYERS_FILE = os.path.join(DATA_DIR, 'players_cache.json')
FIXTURES_FILE = os.path.join(DATA_DIR, 'fixtures_cache.json')
INJURIES_FILE = os.path.join(DATA_DIR, 'injuries_cache.json')

TEAM_MAPPING = {
    'Atalanta': 'ATA', 'Bologna': 'BOL', 'Cagliari': 'CAG', 'Como': 'COM',
    'Fiorentina': 'FIO', 'Frosinone': 'FRO', 'Genoa': 'GEN', 'Inter': 'INT',
    'Juventus': 'JUV', 'Lazio': 'LAZ', 'Lecce': 'LEC', 'Milan': 'MIL',
    'Monza': 'MON', 'Napoli': 'NAP', 'Parma': 'PAR', 'Roma': 'ROM',
    'Sassuolo': 'SAS', 'Torino': 'TOR', 'Udinese': 'UDI', 'Venezia': 'VEN',
    'Verona': 'VER', 'Empoli': 'EMP'
}

CODE_TO_TEAM = {v: k for k, v in TEAM_MAPPING.items()}

# Team defensive/difficulty ratings (1: weak defense/easy matchup for attackers, 5: solid defense/hard matchup)
TEAM_DIFFICULTY = {
    'INT': 4.8, 'JUV': 4.5, 'NAP': 4.4, 'MIL': 4.2, 'ATA': 4.3,
    'ROM': 4.0, 'LAZ': 3.8, 'BOL': 3.7, 'FIO': 3.6, 'TOR': 3.3,
    'UDI': 3.2, 'COM': 3.1, 'GEN': 3.0, 'PAR': 2.9, 'EMP': 2.8,
    'VER': 2.8, 'LEC': 2.7, 'CAG': 2.6, 'MON': 2.6, 'SAS': 2.7,
    'FRO': 2.5, 'VEN': 2.4
}

def clean_player_name(name: str) -> str:
    """Normalizes player name for matching."""
    if not name:
        return ""
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def fetch_html(url: str, timeout: int = 12) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def scrape_players_database():
    """Scrapes all 600+ Serie A players from Fantacalcio.it quotazioni."""
    url = 'https://www.fantacalcio.it/quotazioni-fantacalcio'
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.select_one('table')
        players = []
        if table:
            for tr in table.select('tbody tr.player-row'):
                name = tr.get('data-filter-keywords') or (tr.select_one('.player-name').text.strip() if tr.select_one('.player-name') else '')
                name = clean_player_name(name)
                role = (tr.get('data-filter-role-classic') or 'c').upper()
                tds = [td.text.strip() for td in tr.select('td')]
                team = tds[0] if len(tds) > 0 else ""
                qi = int(tds[1]) if len(tds) > 1 and tds[1].isdigit() else 0
                qa = int(tds[2]) if len(tds) > 2 and tds[2].isdigit() else 0
                fvm = int(tds[3]) if len(tds) > 3 and tds[3].isdigit() else 0
                
                img_el = tr.select_one('img')
                photo = img_el.get('src') if img_el else ""
                
                # Penalty taker and free kicks heuristics or flags
                is_penalty = False
                if name.lower() in ['calhanoglu', 'dybala', 'retegui', 'vlahovic', 'lautaro', 'martinez l.', 'pulisic', 'paz n.', 'gudmundsson', 'zapata', 'lukaku', 'soule']:
                    is_penalty = True
                    
                players.append({
                    'id': f"{team}_{name}".lower().replace(' ', '_').replace('.', ''),
                    'name': name,
                    'role': role,
                    'team': team,
                    'team_full': CODE_TO_TEAM.get(team, team),
                    'qi': qi,
                    'qa': qa,
                    'fvm': fvm,
                    'photo': photo,
                    'is_penalty_taker': is_penalty
                })
                
        if players:
            with open(PLAYERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(players, f, ensure_ascii=False, indent=2)
            print(f"[Scraper] Saved {len(players)} players to {PLAYERS_FILE}")
            return players
    except Exception as e:
        print(f"[Scraper] Error scraping players: {e}")
        
    # Return cached if exists
    if os.path.exists(PLAYERS_FILE):
        with open(PLAYERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def scrape_injuries():
    """Scrapes injured and suspended players from Fantacalcio.it."""
    url = 'https://www.fantacalcio.it/indisponibili-serie-a'
    injuries_map = {} # player_name_clean -> {type, reason, return_date, team}
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, 'html.parser')
        
        # Each row.row-responsive contains a team's infirmary
        rows = soup.select('.row.row-responsive')
        for r in rows:
            text = r.get_text(separator=' | ', strip=True)
            # Find team name nearby or in text
            parent_team = ""
            for full_team, code in TEAM_MAPPING.items():
                if full_team in text:
                    parent_team = full_team
                    break
                    
            # Parse sections: Infortunati, Squalificati, Diffidati
            # Let's inspect paragraphs or text chunks
            chunks = text.split(' | ')
            current_mode = "Infortunati"
            i = 0
            while i < len(chunks):
                chunk = chunks[i].strip()
                if chunk in ['Infortunati', 'Squalificati', 'Diffidati']:
                    current_mode = chunk
                    i += 1
                    continue
                if chunk == 'Nessuno':
                    i += 1
                    continue
                # If chunk is a player name (short, capitalize) followed by description
                if len(chunk) < 30 and i + 1 < len(chunks) and len(chunks[i+1]) > 20:
                    player_name = clean_player_name(chunk)
                    desc = chunks[i+1].strip()
                    injuries_map[player_name.lower()] = {
                        'name': player_name,
                        'team': parent_team,
                        'type': current_mode,
                        'reason': desc,
                        'is_out': current_mode in ['Infortunati', 'Squalificati']
                    }
                    i += 2
                    continue
                i += 1
                
        with open(INJURIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(injuries_map, f, ensure_ascii=False, indent=2)
        print(f"[Scraper] Saved {len(injuries_map)} injury records to {INJURIES_FILE}")
        return injuries_map
    except Exception as e:
        print(f"[Scraper] Error scraping injuries: {e}")
        
    if os.path.exists(INJURIES_FILE):
        with open(INJURIES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def parse_match_datetime(date_str: str) -> datetime:
    """Parses Italian match date like 'sabato 10 ottobre, 15:00' to datetime object."""
    # Current year from local time
    year = 2026
    month_map = {
        'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4,
        'maggio': 5, 'giugno': 6, 'luglio': 7, 'agosto': 8,
        'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
    }
    match = re.search(r'(\d{1,2})\s+([a-zA-Z]+)[,\s]+(\d{1,2}):(\d{2})', date_str.lower())
    if match:
        day = int(match.group(1))
        month_name = match.group(2)
        hour = int(match.group(3))
        minute = int(match.group(4))
        month = month_map.get(month_name, 10)
        return datetime(year, month, day, hour, minute)
    # Fallback to tomorrow 15:00
    now = datetime.now()
    return now + timedelta(days=1, hours=2)

def scrape_fixtures_and_lineups():
    """Scrapes fixtures, kickoff dates/times, lineups, percentages and ballottaggi."""
    url = 'https://www.fantacalcio.it/probabili-formazioni-serie-a'
    fixtures = []
    earliest_kickoff = None
    
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, 'html.parser')
        match_items = soup.select('li.match.match-item')
        
        for idx, m in enumerate(match_items):
            match_info = m.select_one('.match-info')
            match_info_text = match_info.get_text(separator=' - ', strip=True) if match_info else ""
            
            # Extract date string and stadium
            date_match = re.search(r'((?:luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica)\s+\d{1,2}\s+[a-zA-Z]+,\s+\d{1,2}:\d{2})', match_info_text, re.I)
            date_str = date_match.group(1) if date_match else "sabato 10 ottobre, 15:00"
            stadium = match_info_text.split(' - ')[-1] if ' - ' in match_info_text else ""
            
            dt = parse_match_datetime(date_str)
            if earliest_kickoff is None or dt < earliest_kickoff:
                earliest_kickoff = dt
                
            # Lineups
            lineups = m.select('ul.team-lineup')
            home_lineup_players = []
            away_lineup_players = []
            home_formation = "4-3-3"
            away_formation = "4-3-3"
            
            if len(lineups) >= 2:
                home_formation = lineups[0].get('data-formation', '4-3-3')
                away_formation = lineups[1].get('data-formation', '4-3-3')
                home_lineup_players = [clean_player_name(p.get_text(strip=True)) for p in lineups[0].select('.player-name')]
                away_lineup_players = [clean_player_name(p.get_text(strip=True)) for p in lineups[1].select('.player-name')]
                if len(home_lineup_players) == 11:
                    home_lineup_players = list(reversed(home_lineup_players))
                if len(away_lineup_players) == 11:
                    away_lineup_players = list(reversed(away_lineup_players))
                
            # Player items with percentage
            player_percentages = {}
            for pill in m.select('.player-item.pill'):
                name_el = pill.select_one('.player-name')
                val_el = pill.select_one('.progress-value')
                role_el = pill.select_one('.role')
                if name_el:
                    p_name = clean_player_name(name_el.get_text(strip=True))
                    perc_val = 90
                    if val_el:
                        match_pct = re.search(r'(\d+)%', val_el.text)
                        if match_pct:
                            perc_val = int(match_pct.group(1))
                    role_code = role_el.get('data-value', 'c').upper() if role_el else 'C'
                    is_starter = 'starters' in (pill.parent.get('class') if pill.parent else [])
                    player_percentages[p_name.lower()] = {
                        'name': p_name,
                        'percentage': perc_val,
                        'role': role_code,
                        'is_starter': is_starter
                    }
                    
            # Ballottaggi
            ballots = []
            for b in m.select('.ballot'):
                b_text = b.get_text(separator=' ', strip=True)
                b_clean = b_text.replace('Grafico ballottaggio', '').strip()
                if b_clean:
                    ballots.append(b_clean)
                    
            # Extract team names
            team_names = []
            for t in m.select('.team-name, .name, h3, h4'):
                txt = t.get_text(strip=True)
                if txt and txt not in team_names and txt not in ['Presentazione squadre', 'Dettaglio calciatori']:
                    team_names.append(txt)
                    
            home_team = team_names[0] if len(team_names) > 0 else f"Home_{idx+1}"
            away_team = team_names[1] if len(team_names) > 1 else f"Away_{idx+1}"
            
            home_code = TEAM_MAPPING.get(home_team, home_team[:3].upper())
            away_code = TEAM_MAPPING.get(away_team, away_team[:3].upper())
            
            fixtures.append({
                'id': idx + 1,
                'home_team': home_team,
                'home_code': home_code,
                'away_team': away_team,
                'away_code': away_code,
                'date_str': date_str,
                'datetime_iso': dt.isoformat(),
                'stadium': stadium,
                'home_formation': home_formation,
                'away_formation': away_formation,
                'home_lineup': home_lineup_players,
                'away_lineup': away_lineup_players,
                'player_percentages': player_percentages,
                'ballottaggi': ballots
            })
            
        alert_datetime = earliest_kickoff - timedelta(hours=1) if earliest_kickoff else datetime.now() + timedelta(days=1)
        
        result = {
            'earliest_kickoff_iso': earliest_kickoff.isoformat() if earliest_kickoff else "",
            'alert_time_iso': alert_datetime.isoformat(),
            'fixtures': fixtures,
            'last_updated': datetime.now().isoformat()
        }
        
        with open(FIXTURES_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"[Scraper] Saved {len(fixtures)} fixtures. Earliest kickoff: {earliest_kickoff}. Alert: {alert_datetime}")
        return result
        
    except Exception as e:
        print(f"[Scraper] Error scraping fixtures: {e}")
        
    if os.path.exists(FIXTURES_FILE):
        with open(FIXTURES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'fixtures': [], 'earliest_kickoff_iso': '', 'alert_time_iso': ''}

def sync_all_data():
    """Runs all scrapers and caches all data."""
    print("[Scraper] Starting full sync...")
    players = scrape_players_database()
    injuries = scrape_injuries()
    fixtures = scrape_fixtures_and_lineups()
    return {
        'players_count': len(players),
        'injuries_count': len(injuries),
        'fixtures_count': len(fixtures.get('fixtures', [])),
        'alert_time': fixtures.get('alert_time_iso', ''),
        'earliest_kickoff': fixtures.get('earliest_kickoff_iso', '')
    }

if __name__ == '__main__':
    res = sync_all_data()
    print("Sync completed successfully:", res)
