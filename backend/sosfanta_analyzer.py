import os
import json
import re
import urllib.request
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'sosfanta_preview.json')
LLM_CACHE_PREFIX = os.path.join(DATA_DIR, 'sosfanta_llm_cache_giornata_')

DEFAULT_PREVIEW_URL = 'https://www.sosfanta.com/chi-schierare-fantacalcio/preview-7a-giornata-seriea-campionato-fantacalcio-tutti-consigli-chi-schierare/'
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
        # Fallback to current fixtures cache
        fixtures_file = os.path.join(DATA_DIR, 'fixtures_cache.json')
        if os.path.exists(fixtures_file):
            try:
                with open(fixtures_file, 'r', encoding='utf-8') as f:
                    f_data = json.load(f)
                    if f_data.get('matchday'):
                        return int(f_data['matchday'])
            except Exception:
                pass
        return 7

    def get_matchday_label(self, matchday: Optional[int] = None) -> str:
        """Returns human readable matchday label (e.g. '7ª Giornata')."""
        num = matchday if matchday is not None else self.get_matchday_number()
        return f"{num}ª Giornata"

    def get_data_for_matchday(self, matchday: Optional[int] = None) -> Dict[str, Any]:
        """Returns scraped preview data for a specific matchday, isolating rounds cleanly."""
        matchday = int(matchday) if matchday else self.get_matchday_number()

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

        # 3. If matchday is current/upcoming, check if published online right now via auto-discovery or direct probe
        discovered = self.auto_discover_latest_preview_url()
        target_preview = None
        if discovered and self.get_matchday_number(discovered) == matchday:
            target_preview = discovered
        else:
            # Deterministic probe of standard SOS Fanta URL format
            candidate_url = f"https://www.sosfanta.com/chi-schierare-fantacalcio/preview-{matchday}a-giornata-seriea-campionato-fantacalcio-tutti-consigli-chi-schierare/"
            try:
                req = urllib.request.Request(candidate_url, headers=HEADERS)
                resp = urllib.request.urlopen(req, timeout=5)
                if resp.status == 200:
                    target_preview = candidate_url
            except Exception:
                pass

        if target_preview:
            self.preview_url = target_preview
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
        target_md = self.get_matchday_number(target_url)
        md_file = os.path.join(DATA_DIR, f'sosfanta_preview_giornata_{target_md}.json')
        
        needs_scrape = force or (target_url != self.preview_url) or (not os.path.exists(md_file)) or (not self.scraped_data.get('slides'))
        if needs_scrape and target_url:
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

    def _load_llm_cache(self, matchday: int) -> Dict[str, Any]:
        """Loads cached LLM analysis for a given matchday."""
        fpath = f"{LLM_CACHE_PREFIX}{matchday}.json"
        if os.path.exists(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_llm_cache(self, matchday: int, data: Dict[str, Any]):
        """Saves LLM analysis results into matchday cache."""
        os.makedirs(DATA_DIR, exist_ok=True)
        fpath = f"{LLM_CACHE_PREFIX}{matchday}.json"
        try:
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[SOSFanta LLM] Errore salvataggio cache: {e}")

    def analyze_preview_with_llm(self, matchday: int, user_players: Optional[List[Dict[str, Any]]] = None, api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Invokes Google Gemini 2.5 LLM to perform deep semantic analysis of the SOS Fanta preview
        and extract precise player valuations with clause separation and fantacalcio nuance.
        """
        key = api_key or os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
        if not key:
            return None

        data = self.get_data_for_matchday(matchday)
        if not data.get('is_published') or not data.get('combined_text'):
            return None

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=key)
            full_text = data.get('combined_text', '')

            players_clause = ""
            if user_players:
                p_names = [f"{p['name']} ({p.get('team', '')})" for p in user_players]
                players_clause = f"Concentrati in particolare su questi calciatori della rosa:\n{', '.join(p_names)}\n\n"

            prompt = f"""
Sei un analista esperto di Fantacalcio ed esperto di analisi semantica e NLP del giornalismo sportivo italiano.
Analizza con estrema precisione il seguente articolo con i consigli di SOS Fanta per la {matchday}ª Giornata di Serie A.

{players_clause}TESTO DELL'ARTICOLO SOS FANTA:
\"\"\"
{full_text}
\"\"\"

ISTRUZIONI CRITICHE DI ANALISI E SEPARAZIONE CLAUSOLE:
1. SEPARAZIONE DELLE CLAUSOLE NELLE FRASI MULTIPLE: Spesso i giornalisti mettono 2-3 calciatori nella stessa frase con verdetti opposti (es. "Il più affidabile è Mangas tra i difensori, ma anche Birindelli può dire la sua da quarto slot o come copertura" -> Mangas è il più affidabile e consigliato; Birindelli è solo copertura/quarto slot; oppure "Non troppa fiducia in Ehizibue e Marcandalli, leggermente meglio Ostigard e Vasquez" -> Ehizibue è sconsigliato, Vasquez è leggermente meglio/schierabile). NON attribuire mai il giudizio di un calciatore a un altro!
2. "SCHIERARE ASSOLUTO": Chi viene indicato con espressioni come "si mette senza se e senza ma", "si mette e basta", "va schierato", "non si può togliere", "intoccabile", "top da schierare sempre" (es. Goncalo Ramos, Wesley, Raimondo).
3. "PROMOSSO / CERTEZZA": Chi viene definito "più di una scommessa", "ispira", "più affidabile", "grande affidabilità", "promosso", "in forma", "ottima soluzione", "da 6,5" (garanzia modificatore di difesa), "in fascia più da bonus" / "da bonus" (es. Kvernadze, Mangas, Taylor, Belghali, Ramon, Moreira).
4. "MASSIMA PRUDENZA / PANCHINA / RISCHIO S.V.": Chi viene indicato come "al massimo andrà in panchina", "massima prudenza", "non si correranno rischi", "la riserva deve essere sicurissima" (es. Dybala). Questi calciatori sono ad alto rischio senza voto e NON devono essere schierati titolari senza riserva sicura!
5. "SCHIERABILE / ALTERNATIVA": Chi è "leggermente meglio", "quarto slot", "terzo slot", "da sufficienza", "da 6", "buon voto", "ci può stare" (es. Vasquez, Gallo, Jimenez).
6. "COPERTURA CON RISERVA": Indicato solo come rincalzo con riserva a copertura voto (es. Birindelli, Colpani con copertura).
7. "SCONSIGLIATO / EVITARE": Chi ha "non troppa fiducia", "evitare", "no a", "non ispirano", "pericolo malus" (es. Ehizibue, Frendrup).

Restituisci ESCLUSIVAMENTE un oggetto JSON valido con questo formato:
{{
  "Nome Del Calciatore": {{
    "category": "SCHIERARE ASSOLUTO" | "PROMOSSO / CERTEZZA" | "SCHIERABILE / ALTERNATIVA" | "COPERTURA CON RISERVA" | "MASSIMA PRUDENZA / PANCHINA / RISCHIO S.V." | "SCONSIGLIATO / EVITARE" | "CITATO",
    "badge": "success" | "danger" | "primary" | "secondary" | "warning" | "info",
    "icon": "🌟" | "✅" | "👍" | "🛡️" | "🚨" | "⚠️" | "💬",
    "quote": "Frase completa in cui è citato",
    "clause": "Esatta clausola che si riferisce a lui",
    "summary": "Spiegazione sintetica ed accurata del verdetto",
    "bonus_score": float
  }}
}}
"""
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )
            raw_json = response.text.strip()
            parsed = json.loads(raw_json)
            if isinstance(parsed, dict) and len(parsed) > 0:
                self._save_llm_cache(matchday, parsed)
                print(f"[SOSFanta LLM] Analisi completata con successo con Gemini! {len(parsed)} calciatori mappati.")
                return parsed
        except Exception as e:
            print(f"[SOSFanta LLM] Errore chiamata Gemini: {e}")
        return None

    @staticmethod
    def extract_player_clause(sentence: str, alias: str) -> str:
        """
        Splits a compound sentence into clauses and isolates the specific clause
        that directly refers to the given player alias, preventing sentiment
        poisoning from adjacent players while preserving decimal grades (e.g. 6,5)
        and lists of players sharing the same verdict.
        """
        contrast_regex = r'[;:\n]|(?:,\s*(?=(?:ma|mentre|invece|tuttavia|però|leggermente meglio|più da bonus|no a|non troppa fiducia|al massimo|occhio a|da 6|da 7)\b))|(?:\s+(?:ma|mentre|invece|tuttavia|però)\s+)'
        clauses = [c.strip() for c in re.split(contrast_regex, sentence, flags=re.I) if c.strip()]
        for c in clauses:
            if re.search(rf'\b{re.escape(alias)}\b', c, re.I):
                return c
        return sentence

    def analyze_player(self, player_name: str, team: str, matchday: int = 7) -> Dict[str, Any]:
        """
        Analyzes a specific player against the SOSFanta preview article for the requested matchday.
        Employs Gemini LLM cache first, followed by clause-aware syntactic NLP parsing.
        """
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
        
        aliases = list(PLAYER_ALIASES_MAP.get(norm_name, [norm_name]))
        if '.' in norm_name:
            aliases.append(norm_name.replace('.', ''))
            aliases.append(norm_name.split()[0])

        # 1. Check matchday LLM cache
        llm_cache = self._load_llm_cache(matchday)
        if llm_cache:
            for k, val in llm_cache.items():
                k_norm = k.lower().strip()
                if k_norm == norm_name or any(a.lower() in k_norm or k_norm in a.lower() for a in aliases):
                    return {
                        'mentioned': True,
                        'is_published': True,
                        'matchday': matchday,
                        'matchday_label': f"{matchday}ª Giornata",
                        'category': val.get('category', 'CITATO'),
                        'badge': val.get('badge', 'info'),
                        'icon': val.get('icon', '💬'),
                        'quote': val.get('quote', ''),
                        'clause': val.get('clause', ''),
                        'summary': val.get('summary', ''),
                        'bonus_score': float(val.get('bonus_score', 0.0))
                    }

        # 2. Robust sentence and matched alias detection
        found_sentence = None
        matched_alias = None
        for alias in aliases:
            pattern = re.compile(rf'([^.\n!?]*\b{re.escape(alias)}\b[^.\n!?]*[.!?]?)', re.I)
            matches = pattern.findall(full_text)
            if matches:
                for m in matches:
                    cand = m.strip()
                    if len(cand) >= len(alias) + 3 and re.search(rf'\b{re.escape(alias)}\b', cand, re.I):
                        found_sentence = cand
                        matched_alias = alias
                        break
            if found_sentence:
                break

        if not found_sentence or not matched_alias:
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

        # 3. Clause isolation for targeted sentiment without neighbor poisoning
        target_clause = self.extract_player_clause(found_sentence, matched_alias)
        s_lower = found_sentence.lower()
        c_lower = target_clause.lower()
        has_multiple_clauses = (target_clause.strip() != found_sentence.strip())

        # Rule A: MASSIMA PRUDENZA / PANCHINA / RISCHIO S.V. (Critical priority alert)
        bench_sv_patterns = [
            'al massimo andrà in panchina', 'al massimo in panchina', 'massima prudenza', 
            'non si correranno rischi', 'non correranno rischi', 'riserva deve essere sicurissima', 
            'riserva sicurissima', 'difficilmente a voto', 'rischio s.v.', 'non rischiate'
        ]
        if any(w in c_lower for w in bench_sv_patterns) or (not has_multiple_clauses and any(w in s_lower for w in bench_sv_patterns)):
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'MASSIMA PRUDENZA / PANCHINA / RISCHIO S.V.',
                'badge': 'danger',
                'icon': '🚨',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': f"Allerta SOS Fanta per la {matchday}ª giornata: andrà al massimo in panchina con massima prudenza e riserva sicurissima. Rischio s.v. elevatissimo, da evitare titolare.",
                'bonus_score': -16.0
            }

        # Rule B: SCHIERARE ASSOLUTO (Unquestioned Starter / Must Start)
        must_start_patterns = [
            'si mette senza se e senza ma', 'senza se e senza ma', 'si mette e basta', 
            'si schiera e basta', 'va schierato', 'non si può togliere', 'intoccabile', 
            'top e si schiera sempre', 'si schiera sempre', 'da mettere senza se e senza ma', 
            'assolutamente da mettere', 'non si discute', 'da mettere assolutamente'
        ]
        if any(w in c_lower for w in must_start_patterns) or (not has_multiple_clauses and any(w in s_lower for w in must_start_patterns)):
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'SCHIERARE ASSOLUTO',
                'badge': 'success',
                'icon': '🌟',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': f"Consigliatissimo da SOS Fanta per la {matchday}ª giornata: si mette senza se e senza ma! Da schierare titolare fisso.",
                'bonus_score': 9.0
            }

        # Rule C: PROMOSSO / CERTEZZA (e.g. Kvernadze: "più di una scommessa e ispira", Mangas: "il più affidabile", Belghali: "più da bonus", Ramon: "da 6,5")
        promoted_patterns = [
            'più di una scommessa', 'ormai è più di una scommessa', 'più affidabile', 
            'il più affidabile', 'grande affidabilità', 'ispira', 'ispirano', 'promosso', 
            'promossi', 'in forma', 'ottima soluzione', 'approvato', 'da confermare', 
            'torna da schierare', 'semaforo verde', 'stuzzica', 'stuzzicano',
            'più da bonus', 'in fascia più da bonus', 'in fascia da bonus', 'giocatori da bonus',
            'giocatore da bonus', 'da bonus', 'porta bonus', 'possono portare bonus', 'può portare bonus',
            'da 6,5', 'da 6.5', 'da 7', 'da 7,5', 'da 7.5', 'comunque convince', 'convince',
            'perfetto per il modificatore', 'da modificatore'
        ]
        if any(w in c_lower for w in promoted_patterns) or (not has_multiple_clauses and any(w in s_lower for w in promoted_patterns)):
            if any(b in c_lower for b in ['da bonus', 'più da bonus', 'in fascia più da bonus', 'in fascia da bonus', 'giocatori da bonus']):
                summary = f"Consigliato da SOS Fanta per la {matchday}ª giornata: elemento da bonus proiettato in avanti, ottimo potenziale da bonus (+3/+1) da schierare."
            elif any(b in c_lower for b in ['da 6,5', 'da 6.5', 'da 7', 'convince', 'comunque convince', 'modificatore']):
                summary = f"Promosso da SOS Fanta per la {matchday}ª giornata con rendimento atteso da 6,5: garanzia di ottimo voto e preziosissimo per il modificatore di difesa."
            else:
                summary = f"Promosso a pieni voti da SOS Fanta per la {matchday}ª giornata: grande affidabilità e momento di forma positivo nel reparto."
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'PROMOSSO / CERTEZZA',
                'badge': 'success',
                'icon': '✅',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': summary,
                'bonus_score': 7.0
            }

        # Rule D: COPERTURA CON RISERVA (Target clause check only so Mangas is never poisoned by Birindelli)
        coverage_patterns = [
            'come copertura', 'solo come copertura', 'basta avere una copertura', 
            'solo con copertura', 'da copertura', 'copertura sicura'
        ]
        if any(w in c_lower for w in coverage_patterns) or (not has_multiple_clauses and any(w in s_lower for w in coverage_patterns)):
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'COPERTURA CON RISERVA',
                'badge': 'secondary',
                'icon': '🛡️',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': f"Indicato da SOS Fanta per la {matchday}ª giornata soprattutto come opzione a voto con copertura sicura in panchina.",
                'bonus_score': 0.0
            }

        # Rule E: SCONSIGLIATO / EVITARE (e.g. Ehizibue, Frendrup: "Non troppa fiducia", "no a")
        avoid_patterns = [
            'non troppa fiducia', 'poca fiducia', 'evitare', 'no a', 'non ispirano', 
            'potete trovare di meglio', 'trovare di meglio', 'pericolo'
        ]
        if any(w in c_lower for w in avoid_patterns) or (not has_multiple_clauses and any(w in s_lower for w in avoid_patterns)):
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'SCONSIGLIATO / EVITARE',
                'badge': 'danger',
                'icon': '⚠️',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': f"SOS Fanta invita alla cautela per la {matchday}ª giornata: sconsigliato per rischio malus o scarso rendimento.",
                'bonus_score': -8.0
            }

        # Rule F: SCHIERABILE / ALTERNATIVA (e.g. Vasquez: "leggermente meglio", "quarto slot", "ci può stare")
        playable_patterns = [
            'leggermente meglio', 'meglio di', 'quarto slot', 'terzo slot', 'da 6', 
            'da sufficienza', 'buon voto', 'schierabile', 'schierabili', 'ci può stare', 
            'si possono mettere', 'si può mettere', 'si può schierare', 'può dire la sua', 
            'intriga', 'chance'
        ]
        if any(w in c_lower for w in playable_patterns) or (not has_multiple_clauses and any(w in s_lower for w in playable_patterns)):
            return {
                'mentioned': True,
                'is_published': True,
                'matchday': matchday,
                'matchday_label': f"{matchday}ª Giornata",
                'category': 'SCHIERABILE / ALTERNATIVA',
                'badge': 'primary',
                'icon': '👍',
                'quote': found_sentence,
                'clause': target_clause,
                'summary': f"Schierabile per la {matchday}ª giornata: valida soluzione di reparto da sufficienza o quarto slot.",
                'bonus_score': 3.0
            }

        # Fallback: CITATO
        return {
            'mentioned': True,
            'is_published': True,
            'matchday': matchday,
            'matchday_label': f"{matchday}ª Giornata",
            'category': 'CITATO',
            'badge': 'info',
            'icon': '💬',
            'quote': found_sentence,
            'clause': target_clause,
            'summary': f"Citato nell'analisi partita della {matchday}ª giornata.",
            'bonus_score': 1.0
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
            'PROMOSSO / CERTEZZA': 2,
            'PROMOSSO': 2,
            'IDEA A SORPRESA': 3,
            'SCHIERABILE / ALTERNATIVA': 4,
            'SCHIERABILE': 4,
            'CITATO': 5,
            'COPERTURA CON RISERVA': 6,
            'COPERTURA': 6,
            'NEUTRO': 7,
            'IN ARRIVO': 8,
            'ATTENZIONE / RISCHIOSO': 9,
            'SCONSIGLIATO / EVITARE': 10,
            'SCONSIGLIATO': 10,
            'MASSIMA PRUDENZA / PANCHINA / RISCHIO S.V.': 11
        }
        results.sort(key=lambda x: priority_map.get(x['sosfanta']['category'], 12))
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
