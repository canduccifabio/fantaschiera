import os
import json
import re
import urllib.request
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'sosfanta_preview.json')

DEFAULT_PREVIEW_URL = 'https://www.sosfanta.com/chi-schierare-fantacalcio/preview-6a-giornata-seriea-campionato-fantacalcio-tutti-consigli-chi-schierare/'
CATEGORY_URL = 'https://www.sosfanta.com/chi-schierare-fantacalcio/'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

PLAYER_ALIASES_MAP = {
    'ramos g.': ['goncalo ramos', 'ramos', 'gonçalo ramos'],
    'dybala': ['dybala', 'paulo dybala'],
    'jimenez a.': ['jimenez', 'alex jimenez'],
    'taylor k.': ['taylor', 'k. taylor'],
    'vasquez': ['vasquez', 'johan vasquez'],
    'frendrup': ['frendrup'],
    'moreira': ['moreira', 'diego moreira'],
    'belghali': ['belghali'],
    'mangas': ['mangas'],
    'gallo': ['gallo', 'antonino gallo'],
    'cacciamani': ['cacciamani'],
    'fitz-jim': ['fitz-jim', 'fitz jim'],
    'kvernadze': ['kvernadze'],
    'ghedjemis': ['ghedjemis'],
    'ramon': ['ramon', 'jacobo ramon'],
    'wesley': ['wesley'],
    'maignan': ['maignan', 'mike maignan'],
    'mandas': ['mandas', 'christos mandas'],
    'motta': ['motta'],
    'dodò': ['dodò', 'dodo'],
    'zaniolo': ['zaniolo', 'nicolò zaniolo'],
    'chukwueze': ['chukwueze', 'samu chukwueze'],
    'busio': ['busio', 'gianluca busio'],
    'camarda': ['camarda', 'francesco camarda'],
    'cutrone': ['cutrone', 'patrick cutrone']
}

class SOSFantaAnalyzer:
    def __init__(self, preview_url: str = DEFAULT_PREVIEW_URL):
        self.preview_url = preview_url.rstrip('/') + '/'
        self.scraped_data = self._load_cache()
        self._matchday_cache: Dict[int, Dict[str, Any]] = {}
        if self.scraped_data and self.scraped_data.get('preview_url'):
            self.preview_url = self.scraped_data['preview_url']

    def _load_cache(self) -> Dict[str, Any]:
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    @staticmethod
    def auto_discover_latest_preview_url() -> Optional[str]:
        """Discovers the latest matchday preview article from SOSFanta category page."""
        try:
            req = urllib.request.Request(CATEGORY_URL, headers=HEADERS)
            html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            for a in soup.find_all('a', href=True):
                href = a['href']
                if re.search(r'preview-\d+a-giornata', href, re.I):
                    if href.startswith('http'):
                        return href.rstrip('/') + '/'
                    elif href.startswith('/'):
                        return f"https://www.sosfanta.com{href}".rstrip('/') + '/'
        except Exception as e:
            print(f"[SOSFanta] Auto-discovery error: {e}")
        return None

    def get_matchday_number(self, url: Optional[str] = None) -> int:
        target = url or self.preview_url or ''
        m = re.search(r'preview-(\d+)a-giornata', target, re.I)
        if m:
            return int(m.group(1))
        return 6

    def get_matchday_label(self, matchday: Optional[int] = None) -> str:
        """Returns human readable matchday label (e.g. '6ª Giornata')."""
        num = matchday if matchday is not None else self.get_matchday_number()
        return f"{num}ª Giornata"

    def get_data_for_matchday(self, matchday: int = 7) -> Dict[str, Any]:
        """Returns scraped preview data for a specific matchday, isolating rounds cleanly."""
        matchday = int(matchday) if matchday else 7

        if matchday in self._matchday_cache:
            return self._matchday_cache[matchday]

        # 1. Check matchday-specific archive file
        md_file = os.path.join(DATA_DIR, f'sosfanta_preview_giornata_{matchday}.json')
        if os.path.exists(md_file):
            try:
                with open(md_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if data.get('slides') and len(data.get('slides', [])) > 0:
                        data['is_published'] = True
                        data['matchday_number'] = matchday
                        self._matchday_cache[matchday] = data
                        return data
            except Exception:
                pass

        # 2. Check if currently loaded scraped_data matches the requested matchday
        if self.scraped_data and self.get_matchday_number() == matchday and self.scraped_data.get('slides'):
            self.scraped_data['is_published'] = True
            self.scraped_data['matchday_number'] = matchday
            self._matchday_cache[matchday] = self.scraped_data
            return self.scraped_data

        # 3. Check if base cache file matches matchday 6
        if matchday == 6 and os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if self.get_matchday_number(data.get('preview_url', '')) == 6 and data.get('slides'):
                        data['is_published'] = True
                        data['matchday_number'] = 6
                        self._matchday_cache[matchday] = data
                        return data
            except Exception:
                pass

        # 4. If matchday is current/upcoming, check if published online right now
        if matchday >= 7:
            discovered = self.auto_discover_latest_preview_url()
            if discovered and self.get_matchday_number(discovered) == matchday:
                self.preview_url = discovered
                res = self.scrape_all_slides()
                res['is_published'] = True
                res['matchday_number'] = matchday
                self._matchday_cache[matchday] = res
                return res

        # 5. Not yet published on SOS Fanta (published usually 24-48h before kickoff)
        res = {
            'preview_url': None,
            'matchday': f'{matchday}ª Giornata',
            'matchday_number': matchday,
            'is_published': False,
            'status_notice': f'Preview {matchday}ª Giornata in attesa di pubblicazione su SOS Fanta (uscita prevista giovedì/venerdì prima del kickoff).',
            'combined_text': '',
            'slides': []
        }
        self._matchday_cache[matchday] = res
        return res

    def check_and_update_latest_preview(self, force: bool = False) -> Dict[str, Any]:
        """Checks if a new matchday preview exists and automatically scrapes it."""
        discovered = self.auto_discover_latest_preview_url()
        updated = False
        target_url = discovered if discovered else self.preview_url
        if force or (target_url != self.preview_url) or not self.scraped_data.get('slides'):
            self.preview_url = target_url
            self.scrape_all_slides()
            updated = True
        return {
            "updated": updated,
            "preview_url": self.preview_url,
            "matchday": self.get_matchday_label(),
            "slides_count": len(self.scraped_data.get('slides', []))
        }

    def scrape_all_slides(self) -> Dict[str, Any]:
        """Scrapes all 10 slides of the matchday preview from SOSFanta."""
        all_text = []
        slides_content = []

        print(f"[SOSFanta] Scarico le 10 schede della preview da: {self.preview_url}")
        for page in range(1, 11):
            page_url = self.preview_url if page == 1 else f"{self.preview_url}{page}/"
            try:
                req = urllib.request.Request(page_url, headers=HEADERS)
                html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')
                soup = BeautifulSoup(html, 'html.parser')
                
                title_el = soup.select_one('.article-page-subtitle')
                if not title_el:
                    title_el = soup.select_one('h2, h3')
                title = title_el.get_text(strip=True) if title_el else f"Partita {page}"
                title = re.sub(r'^(LE SQUADRE DI SERIE A\s*[-:]?\s*)', '', title, flags=re.I).strip()
                if not title or title.lower() == 'le squadre di serie a':
                    title = f"Partita {page}"
                
                paras = [p.get_text(separator=' ', strip=True) for p in soup.find_all('p') 
                         if len(p.get_text(strip=True)) > 35 
                         and 'RIPRODUZIONE' not in p.text 
                         and 'Installa' not in p.text
                         and 'navighi' not in p.text
                         and 'Registro Imprese' not in p.text
                         and 'titolare del trattamento' not in p.text
                         and 'cookie' not in p.text.lower()]
                         
                slide_text = "\n\n".join(paras)
                all_text.append(f"[{title}]\n" + slide_text)
                slides_content.append({
                    'page': page,
                    'title': title,
                    'paragraphs': paras,
                    'text': slide_text
                })
            except Exception as e:
                print(f"[SOSFanta] Errore pagina {page}: {e}")

        combined_text = "\n\n".join(all_text)
        md_label = self.get_matchday_label()
        md_num = self.get_matchday_number()
        result = {
            'preview_url': self.preview_url,
            'matchday': md_label,
            'matchday_number': md_num,
            'is_published': True,
            'combined_text': combined_text,
            'slides': slides_content
        }

        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        # Save matchday specific archive
        md_cache_file = os.path.join(DATA_DIR, f'sosfanta_preview_giornata_{md_num}.json')
        try:
            with open(md_cache_file, 'w', encoding='utf-8') as af:
                json.dump(result, af, ensure_ascii=False, indent=2)
        except Exception:
            pass

        self.scraped_data = result
        print(f"[SOSFanta] Download completato per {md_label}! Testo totale: {len(combined_text)} caratteri.")
        return result

    def get_full_text(self) -> str:
        if not self.scraped_data or not self.scraped_data.get('combined_text'):
            self.scrape_all_slides()
        return self.scraped_data.get('combined_text', '')

    def analyze_player(self, player_name: str, team: str, matchday: int = 7) -> Dict[str, Any]:
        """Analyzes a specific player against the SOSFanta preview article for the requested matchday."""
        data = self.get_data_for_matchday(matchday)
        if not data.get('is_published', True) or not data.get('combined_text'):
            return {
                'mentioned': False,
                'is_published': False,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'IN ARRIVO',
                'badge': 'secondary',
                'icon': '⏳',
                'quote': f"Preview {matchday}ª Giornata in attesa di pubblicazione su SOS Fanta (uscita prevista giovedì/venerdì).",
                'summary': f"La redazione di SOS Fanta pubblicherà i consigli per la {matchday}ª giornata a ridosso del turno. La valutazione attuale si basa su probabili formazioni e metriche IA.",
                'bonus_score': 0.0
            }

        full_text = data.get('combined_text', '')
        norm_name = player_name.lower().strip()
        
        aliases = PLAYER_ALIASES_MAP.get(norm_name, [norm_name])
        if '.' in norm_name:
            aliases.append(norm_name.replace('.', ''))
            aliases.append(norm_name.split()[0])

        found_sentence = None
        for alias in aliases:
            # Look for sentence containing alias
            pattern = re.compile(rf'([^.\n]*?\b{re.escape(alias)}\b[^.\n]*?\.)', re.I)
            matches = pattern.findall(full_text)
            if matches:
                found_sentence = matches[0].strip()
                break

        if not found_sentence:
            return {
                'mentioned': False,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'NEUTRO',
                'badge': 'info',
                'icon': '👉',
                'quote': f"Non citato nei ballottaggi chiave di SOS Fanta ({matchday}ª Giornata).",
                'summary': f"Nessun alert negativo: segue la valutazione standard della partita.",
                'bonus_score': 0.0
            }

        s_lower = found_sentence.lower()

        # Classify verdict using semantic patterns
        if any(w in s_lower for w in ['si mette e basta', 'va schierato', 'sempre', 'non si può togliere', 'top', 'intoccabile']):
            category = 'SCHIERARE ASSOLUTO'
            badge = 'success'
            icon = '🌟'
            summary = f"Consigliatissimo dalla redazione di SOS Fanta per la {matchday}ª giornata! Da mettere titolare senza dubbi."
            bonus_score = 8.0
        elif any(w in s_lower for w in ['promosso', 'molto bene', 'in forma', 'ottima soluzione', 'approvato', 'da confermare', 'torna da schierare']):
            category = 'PROMOSSO'
            badge = 'success'
            icon = '✅'
            summary = f"Promosso a pieni voti da SOS Fanta per la {matchday}ª giornata, momento di forma positivo."
            bonus_score = 5.0
        elif any(w in s_lower for w in ['incontenibile', 'potete pensarci', 'non sottovalutare', 'sorpresa']):
            category = 'IDEA A SORPRESA'
            badge = 'warning'
            icon = '🚀'
            summary = f"Possibile sorpresa della {matchday}ª giornata secondo SOS Fanta. Buona scommessa."
            bonus_score = 4.0
        elif any(w in s_lower for w in ['schierabile', 'ci può stare', 'buon voto', 'ok', 'sufficienza', 'da 6']):
            category = 'SCHIERABILE'
            badge = 'primary'
            icon = '👍'
            summary = f"Schierabile per la {matchday}ª giornata per un buon voto/sufficienza tranquilla."
            bonus_score = 2.0
        elif any(w in s_lower for w in ['copertura', 'riserva']):
            category = 'COPERTURA'
            badge = 'secondary'
            icon = '🛡️'
            summary = f"Indicato soprattutto come copertura sicura a voto per la {matchday}ª giornata."
            bonus_score = 0.0
        elif any(w in s_lower for w in ['meno', 'non ispirano', 'pericolo', 'difficile', 'evitare']):
            category = 'ATTENZIONE / RISCHIOSO'
            badge = 'danger'
            icon = '⚠️'
            summary = f"SOS Fanta invita alla cautela per la {matchday}ª giornata: a rischio malus."
            bonus_score = -5.0
        else:
            category = 'CITATO'
            badge = 'info'
            icon = '💬'
            summary = f"Citato nell'analisi partita della {matchday}ª giornata."
            bonus_score = 1.0

        return {
            'mentioned': True,
            'is_published': True,
            'matchday': matchday,
            'matchday_label': f"{matchday}ª Giornata",
            'category': category,
            'badge': badge,
            'icon': icon,
            'quote': found_sentence,
            'summary': summary,
            'bonus_score': bonus_score
        }

    def analyze_entire_squad(self, user_players: List[Dict[str, Any]], matchday: int = 7) -> List[Dict[str, Any]]:
        """Returns targeted SOSFanta advice for each player in user's squad for the specified matchday."""
        results = []
        for p in user_players:
            analysis = self.analyze_player(p['name'], p.get('team', ''), matchday=matchday)
            results.append({
                'name': p['name'],
                'role': p.get('role', 'C'),
                'team': p.get('team', ''),
                'qa': p.get('qa', 0),
                'fvm': p.get('fvm', 0),
                'photo': p.get('photo', ''),
                'sosfanta': analysis
            })
        priority_map = {
            'SCHIERARE ASSOLUTO': 1,
            'PROMOSSO': 2,
            'IDEA A SORPRESA': 3,
            'SCHIERABILE': 4,
            'CITATO': 5,
            'COPERTURA': 6,
            'NEUTRO': 7,
            'IN ARRIVO': 8,
            'ATTENZIONE / RISCHIOSO': 9
        }
        results.sort(key=lambda x: priority_map.get(x['sosfanta']['category'], 10))
        return results

    def get_full_article_data(self, user_players: Optional[List[Dict[str, Any]]] = None, matchday: int = 7) -> Dict[str, Any]:
        """Returns full article text and slides with user player highlights for requested matchday."""
        data = self.get_data_for_matchday(matchday)
        if not data.get('is_published', True) or not data.get('slides'):
            return {
                'preview_url': None,
                'matchday': f'{matchday}ª Giornata',
                'is_published': False,
                'status_notice': f'Preview {matchday}ª Giornata in attesa di pubblicazione su SOS Fanta (uscita prevista giovedì/venerdì).',
                'slides_count': 0,
                'slides': []
            }

        slides = data.get('slides', [])
        enriched_slides = []

        # Precompute analyses ONCE per player (25 calls instead of 250 calls)
        player_analyses = {}
        if user_players:
            for p in user_players:
                analysis = self.analyze_player(p['name'], p.get('team', ''), matchday=matchday)
                if analysis.get('mentioned'):
                    player_analyses[p['name']] = {
                        'player': p,
                        'analysis': analysis
                    }

        for s in slides:
            slide_copy = dict(s)
            matched_players = []
            slide_text = s.get('text', '')
            for p_name, p_info in player_analyses.items():
                p = p_info['player']
                analysis = p_info['analysis']
                if analysis.get('quote') and analysis['quote'] in slide_text:
                    matched_players.append({
                        'name': p['name'],
                        'role': p.get('role', 'C'),
                        'team': p.get('team', ''),
                        'category': analysis['category'],
                        'badge': analysis['badge'],
                        'icon': analysis['icon'],
                        'quote': analysis['quote']
                    })
            slide_copy['my_players'] = matched_players
            enriched_slides.append(slide_copy)

        return {
            "preview_url": data.get('preview_url'),
            "matchday": f"{matchday}ª Giornata",
            "is_published": True,
            "slides_count": len(enriched_slides),
            "slides": enriched_slides
        }

sosfanta_analyzer = SOSFantaAnalyzer()
