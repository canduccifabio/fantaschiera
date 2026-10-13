import os
import json
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import io
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
ACTUAL_LINEUP_FILE = os.path.join(DATA_DIR, 'actual_lineup.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')

def _normalize_name(name: str) -> str:
    s = (name or '').lower()
    s = s.replace('ò', 'o').replace('è', 'e').replace('é', 'e').replace('à', 'a').replace('ì', 'i').replace('ù', 'u')
    return re.sub(r'[^a-z0-9]', '', s)

class LineupExtractor:
    """
    Extracts the user's real submitted fantasy lineup from Leghe Fantacalcio app screenshots.
    Supports Google Gemini Vision (google-genai) and client-side / local OCR matching against the user's squad.
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
3. Identifica i calciatori in PANCHINA (ordinati se possibile).
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
  "notes": "Breve nota tattica sulla formazione schierata"
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
                    # Validate that starters belong to user squad
                    matched_starters = self._reconcile_with_squad(result.get('starters', []), user_squad)
                    matched_bench = self._reconcile_with_squad(result.get('bench', []), user_squad)
                    
                    return {
                        "source": "Gemini AI Vision (2.5 Flash)",
                        "formation": result.get('formation', '4-3-3'),
                        "starters": matched_starters,
                        "bench": matched_bench,
                        "notes": result.get('notes', 'Formazione riconosciuta via Gemini Vision da Leghe FC.')
                    }
        except Exception as e:
            print(f"[LineupExtractor] Gemini vision error: {e}")
        return None

    def match_squad_from_text(self, text: str, user_squad: List[Dict]) -> Dict[str, Any]:
        """
        Fallback parser: matches OCR tokens or text against the user's squad.
        Distinguishes starters (on pitch) from bench (panchina).
        """
        raw_clean = text.lower()
        
        # Split on common bench separators in Italian
        parts = re.split(r'\b(?:panchina|riserve|in panchina|panc)\b', raw_clean)
        starters_part = parts[0]
        bench_part = parts[1] if len(parts) > 1 else ""

        def extract_matching_players(chunk: str, available_squad: List[Dict]) -> List[Dict]:
            found = []
            tokens = set(re.findall(r'[a-z0-9]{3,}', chunk))
            for p in available_squad:
                p_norm = _normalize_name(p['name'])
                # check if player name appears in chunk
                p_lower = p['name'].lower()
                if (p_lower in chunk) or (p_norm in tokens):
                    found.append(p)
                else:
                    # Substring check for compound names like "Jimenez A." -> "jimenez"
                    parts_p = [clean_tok for clean_tok in re.findall(r'[a-z0-9]{3,}', p_norm)]
                    for tok in parts_p:
                        if tok in tokens:
                            found.append(p)
                            break
            return found

        starters = extract_matching_players(starters_part, user_squad)
        remaining_squad = [p for p in user_squad if p['name'] not in [s['name'] for s in starters]]
        
        bench = []
        if bench_part:
            bench = extract_matching_players(bench_part, remaining_squad)
        else:
            # If no bench section, all other squad members are bench
            bench = [p for p in remaining_squad if p['name'] not in [s['name'] for s in starters]]

        # Try to infer formation module
        roles_count = {'P': 0, 'D': 0, 'C': 0, 'A': 0}
        for s in starters:
            r = s.get('role', 'C')
            if r in roles_count:
                roles_count[r] += 1
        
        formation = f"{roles_count['D']}-{roles_count['C']}-{roles_count['A']}"
        if roles_count['P'] == 0 and len(starters) > 0:
            # Pick first available keeper from squad if missing
            gk = next((p for p in user_squad if p.get('role') == 'P'), None)
            if gk and gk not in starters:
                starters.insert(0, gk)
                roles_count['P'] = 1

        return {
            "source": "OCR / Fuzzy Squad Matcher",
            "formation": formation if len(starters) == 11 else "4-3-3",
            "starters": starters,
            "bench": bench,
            "notes": f"Rilevati {len(starters)} titolari e {len(bench)} panchinari tramite analisi ottica."
        }

    def _reconcile_with_squad(self, extracted_players: List[Dict], user_squad: List[Dict]) -> List[Dict]:
        """Maps extracted player objects to authentic squad objects in user_squads.json."""
        reconciled = []
        seen = set()
        
        for ep in extracted_players:
            ep_name = _normalize_name(ep.get('name', ''))
            best_match = None
            for p in user_squad:
                p_norm = _normalize_name(p['name'])
                if ep_name == p_norm or (len(ep_name) >= 4 and ep_name in p_norm) or (len(p_norm) >= 4 and p_norm in ep_name):
                    best_match = p
                    break
            
            if best_match and best_match['name'] not in seen:
                reconciled.append(best_match)
                seen.add(best_match['name'])
            elif not best_match and ep.get('name'):
                # Keep original with role if not found
                reconciled.append({
                    'name': ep.get('name'),
                    'role': ep.get('role', 'C'),
                    'team': ep.get('team', '')
                })

        return reconciled

lineup_extractor = LineupExtractor()
