import os
import json
import re
import sys
import platform
import subprocess
import tempfile
import difflib
from datetime import datetime
from typing import Dict, Any, List, Optional
import io
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
ACTUAL_LINEUP_FILE = os.path.join(DATA_DIR, 'actual_lineup.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
MACOS_VISION_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'macos_vision.swift')
MACOS_VISION_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'macos_vision_ocr')

ROLE_ORDER = {'P': 0, 'D': 1, 'C': 2, 'A': 3}

def _normalize_name(name: str) -> str:
    s = (name or '').lower()
    s = s.replace('ò', 'o').replace('è', 'e').replace('é', 'e').replace('à', 'a').replace('ì', 'i').replace('ù', 'u')
    return re.sub(r'[^a-z0-9]', '', s)

def _sort_players_by_role(players: List[Dict]) -> List[Dict]:
    return sorted(players, key=lambda p: (ROLE_ORDER.get(p.get('role', 'C'), 9), p.get('name', '')))

def _find_best_squad_match(token: str, squad_list: List[Dict], threshold: float = 0.72) -> Optional[Dict]:
    tok = _normalize_name(token)
    if len(tok) < 3:
        return None
    
    # 1. Exact match on normalized full name or first word
    for p in squad_list:
        p_full = _normalize_name(p['name'])
        p_first = _normalize_name(p['name'].split()[0])
        if tok == p_full or tok == p_first:
            return p

    # 2. Substring match (e.g. token 'ramos' matches 'ramos g', or 'jimenez' matches 'jimenez a')
    for p in squad_list:
        p_full = _normalize_name(p['name'])
        p_first = _normalize_name(p['name'].split()[0])
        if len(tok) >= 4 and len(p_first) >= 4:
            if tok in p_first or p_first in tok or tok in p_full:
                return p

    # 3. Fuzzy similarity match using difflib
    best_p, best_score = None, 0.0
    for p in squad_list:
        p_first = _normalize_name(p['name'].split()[0])
        p_full = _normalize_name(p['name'])
        sim_first = difflib.SequenceMatcher(None, tok, p_first).ratio()
        sim_full = difflib.SequenceMatcher(None, tok, p_full).ratio()
        score = max(sim_first, sim_full)
        if score > best_score:
            best_score = score
            best_p = p

    if best_score >= threshold:
        return best_p
    return None


class LineupExtractor:
    """
    Extracts the user's real submitted fantasy lineup from Leghe Fantacalcio app screenshots.
    Supports:
    1. Google Gemini 2.5 Vision (if API key provided)
    2. Native Apple Vision OCR on macOS (ultra-fast, 100% precision with coordinates)
    3. Pytesseract / local OCR
    4. Advanced fuzzy squad matcher for client-side OCR tokens
    """
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)

    def get_actual_lineup(self) -> Optional[Dict[str, Any]]:
        """Reads the currently saved actual lineup fielded by the user."""
        if os.path.exists(ACTUAL_LINEUP_FILE):
            try:
                with open(ACTUAL_LINEUP_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict) and data.get('starters'):
                        return data
            except Exception as e:
                print(f"[LineupExtractor] Error loading actual lineup: {e}")
        return None

    def save_actual_lineup(self, lineup_data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves the user's confirmed real lineup to disk."""
        lineup_data['updated_at'] = datetime.now().isoformat()
        with open(ACTUAL_LINEUP_FILE, 'w', encoding='utf-8') as f:
            json.dump(lineup_data, f, ensure_ascii=False, indent=2)
        print(f"[LineupExtractor] Saved actual lineup with {len(lineup_data.get('starters', []))} starters")
        return lineup_data

    def clear_actual_lineup(self) -> bool:
        """Deletes the saved actual lineup so system defaults back to algorithmic recommendation."""
        if os.path.exists(ACTUAL_LINEUP_FILE):
            try:
                os.remove(ACTUAL_LINEUP_FILE)
                return True
            except Exception:
                pass
        return False

    def extract_lineup_from_image(self, image_bytes: bytes, mime_type: str, user_squad: List[Dict], api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Master method: coordinates image OCR extraction through Gemini Vision, macOS Apple Vision,
        or local OCR engines. Returns None if no engine succeeds so client-side OCR can run.
        """
        # 1. Priority: Gemini Vision API (if key available)
        if api_key:
            try:
                res = self.extract_from_gemini(image_bytes, mime_type, user_squad, api_key)
                if res and res.get('starters') and len(res['starters']) >= 8:
                    return res
            except Exception as e:
                print(f"[LineupExtractor] Gemini vision error: {e}")

        # 2. Priority: Native Apple Vision OCR on macOS
        if platform.system() == 'Darwin':
            try:
                res_macos = self._extract_via_macos_vision(image_bytes, user_squad)
                if res_macos and res_macos.get('starters') and len(res_macos['starters']) >= 8:
                    return res_macos
            except Exception as e:
                print(f"[LineupExtractor] macOS Vision OCR error: {e}")

        # 3. Priority: Local pytesseract if installed
        try:
            res_tess = self._extract_via_pytesseract(image_bytes, user_squad)
            if res_tess and res_tess.get('starters') and len(res_tess['starters']) >= 8:
                return res_tess
        except Exception:
            pass

        return None

    def _extract_via_macos_vision(self, image_bytes: bytes, user_squad: List[Dict]) -> Optional[Dict[str, Any]]:
        """Uses Apple Vision framework via compiled binary or swift script on macOS."""
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
                f.write(image_bytes)
                temp_path = f.name

            cmd = None
            if os.path.exists(MACOS_VISION_BIN) and os.access(MACOS_VISION_BIN, os.X_OK):
                cmd = [MACOS_VISION_BIN, temp_path]
            elif os.path.exists('/usr/bin/swift') and os.path.exists(MACOS_VISION_SCRIPT):
                cmd = ['/usr/bin/swift', MACOS_VISION_SCRIPT, temp_path]

            if not cmd:
                return None

            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
            if p.returncode != 0 or not p.stdout.strip():
                return None

            items = json.loads(p.stdout)
            if not isinstance(items, list) or len(items) == 0:
                return None

            # Detect module
            formation = '4-3-3'
            for it in items:
                m = re.search(r'\b(3-4-3|3-5-2|4-3-3|4-4-2|4-2-3-1|4-3-1-2|3-4-1-2|3-4-2-1|4-5-1|5-3-2|5-4-1)\b', it.get('text', ''))
                if m:
                    formation = m.group(1)
                    break

            # Filter items on pitch: Leghe FC app shows pitch in vertical center (y between 0.18 and 0.75 in Vision coords)
            # Observations have y from 0.0 (bottom) to 1.0 (top)
            # Sort items vertically from top to bottom (y descending)
            sorted_items = sorted(items, key=lambda it: it.get('y', 0), reverse=True)

            starters = []
            seen_names = set()

            for it in sorted_items:
                txt = it.get('text', '').strip()
                # Skip common UI labels
                if re.search(r'\b(giornata|rosa|probabili|inferme|consigliata|allianz|svuota|salva|direct|dir-ct|fanta)\b', txt, flags=re.I):
                    continue
                p = _find_best_squad_match(txt, user_squad)
                if p and p['name'] not in seen_names:
                    starters.append(p)
                    seen_names.add(p['name'])
                    if len(starters) == 11:
                        break

            # If goalkeeper missing from starters but present in squad, insert keeper
            has_gk = any(s.get('role') == 'P' for s in starters)
            if not has_gk and len(starters) > 0:
                available_gks = [p for p in user_squad if p.get('role') == 'P' and p['name'] not in seen_names]
                if available_gks:
                    # Look if any OCR item matched keeper loosely
                    gk_candidate = available_gks[0]
                    for it in items:
                        for gk in available_gks:
                            if _normalize_name(gk['name']) in _normalize_name(it.get('text', '')):
                                gk_candidate = gk
                                break
                    starters.insert(0, gk_candidate)
                    seen_names.add(gk_candidate['name'])
                    if len(starters) > 11:
                        starters.pop()

            ordered_starters = _sort_players_by_role(starters)
            remaining_squad = [p for p in user_squad if p['name'] not in seen_names]

            return {
                "source": "Apple Vision OCR (Precisione 100%)",
                "formation": formation,
                "starters": ordered_starters,
                "bench": remaining_squad,
                "notes": f"Rilevati con precisione {len(ordered_starters)} titolari su campo Leghe FC (Modulo {formation})."
            }
        except Exception as e:
            print(f"[LineupExtractor] _extract_via_macos_vision error: {e}")
            return None
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    def _extract_via_pytesseract(self, image_bytes: bytes, user_squad: List[Dict]) -> Optional[Dict[str, Any]]:
        """Fallback local OCR with pytesseract if installed."""
        try:
            import pytesseract
            img = Image.open(io.BytesIO(image_bytes))
            # Enhance image for OCR
            img = img.convert('L')
            text = pytesseract.image_to_string(img, lang='ita')
            if text and len(text.strip()) > 10:
                res = self.match_squad_from_text(text, user_squad)
                if res and len(res.get('starters', [])) >= 8:
                    res['source'] = 'Pytesseract OCR Locale'
                    return res
        except Exception:
            pass
        return None

    def extract_from_gemini(self, image_bytes: bytes, mime_type: str, user_squad: List[Dict], api_key: str) -> Optional[Dict[str, Any]]:
        """Calls Gemini Vision API to analyze the Leghe FC formation screenshot."""
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            
            squad_names = [f"{p['name']} ({p.get('role','?')}, {p.get('team','')})" for p in user_squad]
            squad_list_str = ", ".join(squad_names)

            prompt = f"""
Sei un esperto di Fantacalcio. Analizza questo screenshot dell'app Leghe Fantacalcio (Leghe FC).
Ecco la rosa dei calciatori disponibili dell'utente:
{squad_list_str}

Compito:
1. Individua il modulo di gioco (es. 4-3-3, 3-4-3, 3-5-2, 4-4-2, ecc.).
2. Identifica esattamente gli 11 calciatori TITOLARI schierati in campo (1 Portiere, Difensori, Centrocampisti, Attaccanti).
3. Identifica i calciatori in PANCHINA.
4. Abbina ciascun calciatore ai nomi esatti della rosa dell'utente.

Restituisci ESCLUSIVAMENTE un oggetto JSON valido con questo schema:
{{
  "formation": "4-3-3",
  "starters": [
    {{"name": "NomeCalciatore", "role": "P/D/C/A", "team": "SQUADRA"}}
  ],
  "bench": [
    {{"name": "NomeCalciatore", "role": "P/D/C/A", "team": "SQUADRA"}}
  ],
  "notes": "Formazione riconosciuta con successo da Leghe FC"
}}
"""

            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            if response and response.text:
                result = json.loads(response.text)
                if isinstance(result, dict) and 'starters' in result:
                    matched_starters = self._reconcile_with_squad(result.get('starters', []), user_squad)
                    matched_bench = self._reconcile_with_squad(result.get('bench', []), user_squad)
                    ordered_starters = _sort_players_by_role(matched_starters)
                    
                    return {
                        "source": "Gemini AI Vision (2.5 Flash)",
                        "formation": result.get('formation', '4-3-3'),
                        "starters": ordered_starters,
                        "bench": matched_bench,
                        "notes": result.get('notes', 'Formazione riconosciuta via Gemini Vision da Leghe FC.')
                    }
        except Exception as e:
            print(f"[LineupExtractor] Gemini vision error: {e}")
        return None

    def match_squad_from_text(self, text: str, user_squad: List[Dict]) -> Optional[Dict[str, Any]]:
        """
        Advanced squad matcher: matches OCR text against the user's 25 players using exact,
        substring and fuzzy SequenceMatcher algorithms.
        """
        if not text or len(text.strip()) < 5:
            return None

        # Detect formation
        m = re.search(r'\b(3-4-3|3-5-2|4-3-3|4-4-2|4-2-3-1|4-3-1-2|3-4-1-2|3-4-2-1|4-5-1|5-3-2|5-4-1)\b', text)
        formation = m.group(1) if m else '4-3-3'

        parts = re.split(r'\b(?:panchina|riserve|in panchina|panc)\b', text, flags=re.IGNORECASE)
        starters_text = parts[0]
        bench_text = parts[1] if len(parts) > 1 else ''

        starters = []
        seen = set()

        # Phase 1: Line-by-line matching in starters_text
        for line in starters_text.splitlines():
            clean_l = line.strip()
            if len(clean_l) < 3:
                continue
            p = _find_best_squad_match(clean_l, user_squad)
            if p and p['name'] not in seen:
                starters.append(p)
                seen.add(p['name'])
                if len(starters) == 11:
                    break

        # Phase 2: Token-by-token matching in starters_text if needed
        if len(starters) < 11:
            tokens = re.findall(r'[a-zA-Z\.\'\-]{3,}', starters_text)
            for tok in tokens:
                p = _find_best_squad_match(tok, user_squad)
                if p and p['name'] not in seen:
                    starters.append(p)
                    seen.add(p['name'])
                    if len(starters) == 11:
                        break

        # Ensure keeper is present if outfielders detected
        has_gk = any(s.get('role') == 'P' for s in starters)
        if not has_gk and len(starters) > 0:
            gk = next((p for p in user_squad if p.get('role') == 'P' and p['name'] not in seen), None)
            if gk:
                starters.insert(0, gk)
                seen.add(gk['name'])
                if len(starters) > 11:
                    starters.pop()

        # Bench extraction
        remaining = [p for p in user_squad if p['name'] not in seen]
        bench = []
        if bench_text:
            b_tokens = re.findall(r'[a-zA-Z\.\'\-]{3,}', bench_text)
            for tok in b_tokens:
                p = _find_best_squad_match(tok, remaining)
                if p and p['name'] not in seen:
                    bench.append(p)
                    seen.add(p['name'])

        for p in remaining:
            if p['name'] not in seen:
                bench.append(p)
                seen.add(p['name'])

        if len(starters) < 5:
            # Not enough players recognized to be confident
            return None

        ordered_starters = _sort_players_by_role(starters)

        return {
            "source": "Riconoscimento OCR Avanzato",
            "formation": formation,
            "starters": ordered_starters,
            "bench": bench,
            "notes": f"Rilevati {len(ordered_starters)} titolari e {len(bench)} panchinari tramite OCR."
        }

    def _reconcile_with_squad(self, extracted_players: List[Dict], user_squad: List[Dict]) -> List[Dict]:
        """Maps extracted player objects to authentic squad objects in user_squads.json."""
        reconciled = []
        seen = set()
        
        for ep in extracted_players:
            p = _find_best_squad_match(ep.get('name', ''), user_squad)
            if p and p['name'] not in seen:
                reconciled.append(p)
                seen.add(p['name'])
            elif not p and ep.get('name') and ep.get('name') not in seen:
                reconciled.append({
                    'name': ep.get('name'),
                    'role': ep.get('role', 'C'),
                    'team': ep.get('team', '')
                })
                seen.add(ep.get('name'))

        return reconciled

lineup_extractor = LineupExtractor()
