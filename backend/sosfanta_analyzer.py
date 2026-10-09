import os
import json
import re
import urllib.request
from typing import List, Dict, Any
from bs4 import BeautifulSoup

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'sosfanta_preview.json')

DEFAULT_PREVIEW_URL = 'https://www.sosfanta.com/chi-schierare-fantacalcio/preview-6a-giornata-seriea-campionato-fantacalcio-tutti-consigli-chi-schierare/'

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

    def _load_cache(self) -> Dict[str, Any]:
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

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
                
                title_el = soup.select_one('.article-page-subtitle, h2, h3')
                title = title_el.get_text(strip=True) if title_el else f"Partita {page}"
                
                paras = [p.get_text(separator=' ', strip=True) for p in soup.find_all('p') 
                         if len(p.get_text(strip=True)) > 35 
                         and 'RIPRODUZIONE' not in p.text 
                         and 'Installa' not in p.text
                         and 'navighi' not in p.text]
                         
                slide_text = " ".join(paras)
                all_text.append(slide_text)
                slides_content.append({
                    'page': page,
                    'title': title,
                    'text': slide_text
                })
            except Exception as e:
                print(f"[SOSFanta] Errore pagina {page}: {e}")

        combined_text = "\n\n".join(all_text)
        result = {
            'preview_url': self.preview_url,
            'combined_text': combined_text,
            'slides': slides_content
        }

        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        self.scraped_data = result
        print(f"[SOSFanta] Download completato! Testo totale: {len(combined_text)} caratteri.")
        return result

    def get_full_text(self) -> str:
        if not self.scraped_data or not self.scraped_data.get('combined_text'):
            self.scrape_all_slides()
        return self.scraped_data.get('combined_text', '')

    def analyze_player(self, player_name: str, team: str) -> Dict[str, Any]:
        """Analyzes a specific player against the SOSFanta preview article."""
        full_text = self.get_full_text()
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
                'category': 'NEUTRO',
                'badge': 'info',
                'icon': '👉',
                'quote': f"Non citato nei ballottaggi chiave di SOS Fanta.",
                'summary': f"Nessun alert negativo: segue la valutazione standard della partita."
            }

        s_lower = found_sentence.lower()

        # Classify verdict using semantic patterns
        if any(w in s_lower for w in ['si mette e basta', 'va schierato', 'sempre', 'non si può togliere', 'top', 'intoccabile']):
            category = 'SCHIERARE ASSOLUTO'
            badge = 'success'
            icon = '🌟'
            summary = "Consigliatissimo dalla redazione di SOS Fanta! Da mettere titolare senza dubbi."
            bonus_score = 8.0
        elif any(w in s_lower for w in ['promosso', 'molto bene', 'in forma', 'ottima soluzione', 'approvato', 'da confermare', 'torna da schierare']):
            category = 'PROMOSSO'
            badge = 'success'
            icon = '✅'
            summary = "Promosso a pieni voti da SOS Fanta, momento di forma positivo."
            bonus_score = 5.0
        elif any(w in s_lower for w in ['incontenibile', 'potete pensarci', 'non sottovalutare', 'sorpresa']):
            category = 'IDEA A SORPRESA'
            badge = 'warning'
            icon = '🚀'
            summary = "Possibile sorpresa di giornata secondo SOS Fanta. Buona scommessa."
            bonus_score = 4.0
        elif any(w in s_lower for w in ['schierabile', 'ci può stare', 'buon voto', 'ok', 'sufficienza', 'da 6']):
            category = 'SCHIERABILE'
            badge = 'primary'
            icon = '👍'
            summary = "Schierabile per un buon voto/sufficienza tranquilla."
            bonus_score = 2.0
        elif any(w in s_lower for w in ['copertura', 'riserva']):
            category = 'COPERTURA'
            badge = 'secondary'
            icon = '🛡️'
            summary = "Indicato soprattutto come copertura sicura a voto."
            bonus_score = 0.0
        elif any(w in s_lower for w in ['meno', 'non ispirano', 'pericolo', 'difficile', 'evitare']):
            category = 'ATTENZIONE / RISCHIOSO'
            badge = 'danger'
            icon = '⚠️'
            summary = "SOS Fanta invita alla cautela: sconsigliato o a rischio malus."
            bonus_score = -5.0
        else:
            category = 'CITATO'
            badge = 'info'
            icon = '💬'
            summary = "Citato nell'analisi partita."
            bonus_score = 1.0

        return {
            'mentioned': True,
            'category': category,
            'badge': badge,
            'icon': icon,
            'quote': found_sentence,
            'summary': summary,
            'bonus_score': bonus_score
        }

    def analyze_entire_squad(self, user_players: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Returns targeted SOSFanta advice for each player in user's squad."""
        results = []
        for p in user_players:
            analysis = self.analyze_player(p['name'], p.get('team', ''))
            results.append({
                'name': p['name'],
                'role': p.get('role', 'C'),
                'team': p.get('team', ''),
                'qa': p.get('qa', 0),
                'fvm': p.get('fvm', 0),
                'photo': p.get('photo', ''),
                'sosfanta': analysis
            })
        # Sort so that top recommended players appear first
        priority_map = {
            'SCHIERARE ASSOLUTO': 1,
            'PROMOSSO': 2,
            'IDEA A SORPRESA': 3,
            'SCHIERABILE': 4,
            'CITATO': 5,
            'COPERTURA': 6,
            'NEUTRO': 7,
            'ATTENZIONE / RISCHIOSO': 8
        }
        results.sort(key=lambda x: priority_map.get(x['sosfanta']['category'], 10))
        return results

sosfanta_analyzer = SOSFantaAnalyzer()
