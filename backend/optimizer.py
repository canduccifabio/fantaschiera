import json
import os
import re
from typing import List, Dict, Any, Tuple

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
PLAYERS_FILE = os.path.join(DATA_DIR, 'players_cache.json')
FIXTURES_FILE = os.path.join(DATA_DIR, 'fixtures_cache.json')
INJURIES_FILE = os.path.join(DATA_DIR, 'injuries_cache.json')

ALLOWED_FORMATIONS = {
    '3-4-3': {'P': 1, 'D': 3, 'C': 4, 'A': 3},
    '3-5-2': {'P': 1, 'D': 3, 'C': 5, 'A': 2},
    '4-3-3': {'P': 1, 'D': 4, 'C': 3, 'A': 3},
    '4-4-2': {'P': 1, 'D': 4, 'C': 4, 'A': 2},
    '4-5-1': {'P': 1, 'D': 4, 'C': 5, 'A': 1},
    '4-2-3-1': {'P': 1, 'D': 4, 'C': 5, 'A': 1},
    '3-4-2-1': {'P': 1, 'D': 3, 'C': 5, 'A': 2},
    '5-3-2': {'P': 1, 'D': 5, 'C': 3, 'A': 2},
    '5-4-1': {'P': 1, 'D': 5, 'C': 4, 'A': 1}
}

# Opponent defense difficulty rating (1: fragile defense, 5: wall)
TEAM_DIFFICULTY = {
    'INT': 4.8, 'JUV': 4.5, 'NAP': 4.4, 'MIL': 4.2, 'ATA': 4.3,
    'ROM': 4.0, 'LAZ': 3.8, 'BOL': 3.7, 'FIO': 3.6, 'TOR': 3.3,
    'UDI': 3.2, 'COM': 3.1, 'GEN': 3.0, 'PAR': 2.9, 'EMP': 2.8,
    'VER': 2.8, 'LEC': 2.7, 'CAG': 2.6, 'MON': 2.6, 'SAS': 2.7,
    'FRO': 2.5, 'VEN': 2.4
}

class LineupOptimizer:
    def __init__(self):
        self.players_db = self._load_json(PLAYERS_FILE, [])
        self.fixtures_data = self._load_json(FIXTURES_FILE, {'fixtures': []})
        self.injuries_db = self._load_json(INJURIES_FILE, {})
        
        # Build quick player lookup by normalized name
        self.players_lookup = {}
        for p in self.players_db:
            norm = self._normalize_name(p['name'])
            self.players_lookup[norm] = p
            
    def _load_json(self, path: str, default: Any) -> Any:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return default

    def _normalize_name(self, name: str) -> str:
        if not name:
            return ""
        name = name.lower().replace('.', ' ').strip()
        name = re.sub(r'\s+', ' ', name)
        return name

    def reload_data(self):
        self.players_db = self._load_json(PLAYERS_FILE, [])
        self.fixtures_data = self._load_json(FIXTURES_FILE, {'fixtures': []})
        self.injuries_db = self._load_json(INJURIES_FILE, {})
        self.players_lookup = {}
        for p in self.players_db:
            norm = self._normalize_name(p['name'])
            self.players_lookup[norm] = p

    def find_player_match(self, player_team: str) -> Tuple[Dict, bool]:
        """Finds the upcoming match for a given team code and whether it's at home."""
        for match in self.fixtures_data.get('fixtures', []):
            if match.get('home_code') == player_team or player_team in match.get('home_team', ''):
                return match, True
            if match.get('away_code') == player_team or player_team in match.get('away_team', ''):
                return match, False
        return {}, False

    def evaluate_player(self, player: Dict) -> Dict:
        """
        Evaluates a single player and computes:
        - Fanta-Score / Indice di Schierabilità (0 - 100)
        - Titolarità %
        - Status (Titolare, Ballottaggio, Panchina, Infortunato, Squalificato)
        - Matchup details (Avversario, Casa/Trasferta, Difficoltà)
        - Spiegazione motivata (Perché schierarlo o no)
        """
        norm_name = self._normalize_name(player['name'])
        role = player.get('role', 'C').upper()
        team = player.get('team', '')
        qa = player.get('qa', 10)
        fvm = player.get('fvm', 50)
        is_penalty = player.get('is_penalty_taker', False)
        
        # 1. Check injuries & suspensions
        injury_info = None
        for in_name, in_data in self.injuries_db.items():
            if in_name in norm_name or norm_name in in_name:
                injury_info = in_data
                break
                
        is_out = False
        injury_reason = ""
        injury_type = ""
        if injury_info:
            injury_type = injury_info.get('type', '')
            injury_reason = injury_info.get('reason', '')
            is_out = injury_info.get('is_out', False)
            
        if is_out:
            return {
                **player,
                'score': 0,
                'titolarita_pct': 0,
                'status': 'INDISPONIBILE',
                'badge_class': 'danger',
                'stars': 0,
                'match_info': "Non disponibile",
                'advice': f"❌ {injury_type.upper()}: {injury_reason}",
                'opponent': "-",
                'is_home': False
            }

        # 2. Check Match Fixture & Probabili Formazioni
        match, is_home = self.find_player_match(team)
        opponent_code = match.get('away_code' if is_home else 'home_code', 'SERIE A') if match else 'N/A'
        opponent_name = match.get('away_team' if is_home else 'home_team', 'Avversario') if match else 'Avversario'
        opp_diff = TEAM_DIFFICULTY.get(opponent_code, 3.0)
        match_date = match.get('date_str', 'Prossimo turno') if match else 'Prossimo turno'

        # Check starting probability in match
        titolarita_pct = 70 # default if not found
        ballottaggio_note = ""
        is_starter = False
        
        if match:
            # Check player_percentages
            p_pcts = match.get('player_percentages', {})
            for p_key, p_val in p_pcts.items():
                if p_key in norm_name or norm_name in p_key:
                    titolarita_pct = p_val.get('percentage', 70)
                    is_starter = p_val.get('is_starter', False)
                    break
                    
            # Check ballottaggi
            for bal in match.get('ballottaggi', []):
                if norm_name in bal.lower() or any(part in bal.lower() for part in norm_name.split()):
                    ballottaggio_note = bal
                    break

        # 3. Algorithm: Compute Fanta-Score (0-100)
        # Components:
        # A) Titolarità factor (0 - 35 pts)
        titolarita_factor = (titolarita_pct / 100.0) * 35.0
        if ballottaggio_note and titolarita_pct < 60:
            titolarita_factor *= 0.85

        # B) Matchup factor (0 - 30 pts)
        # For Attackers & Midfielders: lower opp_diff means easier opponent -> more bonus!
        # For Goalkeepers & Defenders: lower opp_diff means higher clean sheet chance!
        home_bonus = 5.0 if is_home else 0.0
        if role in ['A', 'C']:
            # Difficulty 2.4 (easy) -> 26 pts; Difficulty 4.8 (hard) -> 12 pts
            matchup_score = (5.2 - opp_diff) * 6.5 + home_bonus
        elif role == 'P':
            # Goalkeeper: facing low scoring team is very favorable
            matchup_score = (5.2 - opp_diff) * 6.0 + (home_bonus * 1.5)
        else: # D
            # Defender: good defensive matchup
            matchup_score = (5.2 - opp_diff) * 5.8 + (home_bonus * 1.2)

        matchup_score = max(5.0, min(30.0, matchup_score))

        # C) Player Quality & Fanta-Value (0 - 25 pts)
        # Based on QA (1-40) and FVM (1-500)
        qa_clamped = min(38, max(1, qa))
        quality_score = (qa_clamped / 38.0) * 18.0 + (min(400, fvm) / 400.0) * 7.0

        # D) Bonus Special Skills (0 - 10 pts)
        special_bonus = 0.0
        if is_penalty:
            special_bonus += 7.0
        if role == 'C' and qa >= 15: # high scoring midfielder
            special_bonus += 3.0
        if role == 'D' and is_home and qa >= 12: # attacking wingback
            special_bonus += 2.5

        # Final composite score
        total_score = titolarita_factor + matchup_score + quality_score + special_bonus
        total_score = round(max(10.0, min(99.0, total_score)), 1)

        # Star rating (1 to 5)
        if total_score >= 82:
            stars = 5
            status = 'TOP DI GIORNATA'
            badge_class = 'success'
        elif total_score >= 72:
            stars = 4
            status = 'CONSIGLIATO'
            badge_class = 'primary'
        elif total_score >= 60:
            stars = 3
            status = 'SCHIERABILE'
            badge_class = 'info'
        elif total_score >= 48:
            stars = 2
            status = 'RISCHIOSO'
            badge_class = 'warning'
        else:
            stars = 1
            status = 'SCONSIGLIATO'
            badge_class = 'secondary'

        # Generate Human-Friendly Advice & Reason
        reasons = []
        if is_penalty:
            reasons.append("primo rigorista (+3 bonus)")
        if titolarita_pct >= 85:
            reasons.append(f"titolare quasi certo ({titolarita_pct}%)")
        elif ballottaggio_note:
            reasons.append(f"in ballottaggio ({ballottaggio_note[:60]})")
        else:
            reasons.append(f"titolarità al {titolarita_pct}%")

        if is_home:
            reasons.append(f"gioca in casa contro {opponent_name}")
        else:
            reasons.append(f"trasferta a {opponent_name}")

        if opp_diff <= 2.8:
            reasons.append("avversario con difesa vulnerabile")
        elif opp_diff >= 4.2:
            reasons.append("partita tosta contro difesa ermetica")

        if role == 'P' and is_home and opp_diff <= 2.9:
            reasons.append("alta probabilità di Clean Sheet / imbattibilità")

        advice_text = f"{'🌟 ' if stars >= 4 else '👉 '}{status}: {', '.join(reasons).capitalize()}."

        match_venue_str = f"vs {opponent_code} ({'C' if is_home else 'T'})"

        return {
            **player,
            'score': total_score,
            'titolarita_pct': titolarita_pct,
            'status': status,
            'badge_class': badge_class,
            'stars': stars,
            'match_info': f"{match_venue_str} • {match_date}",
            'opponent': opponent_code,
            'opponent_name': opponent_name,
            'is_home': is_home,
            'advice': advice_text,
            'ballottaggio_note': ballottaggio_note
        }

    def optimize_lineup(self, user_players: List[Dict], preferred_formation: str = None, use_defense_modifier: bool = False) -> Dict:
        """
        Takes user's players list, evaluates everyone, selects the best formation
        and assigns starters + bench according to Fantacalcio rules.
        """
        # 1. Evaluate all squad players
        evaluated_players = [self.evaluate_player(p) for p in user_players]
        
        # Group by role
        by_role = {'P': [], 'D': [], 'C': [], 'A': []}
        for p in evaluated_players:
            role = p.get('role', 'C').upper()
            if role in by_role:
                by_role[role].append(p)
            else:
                by_role['C'].append(p)
                
        # Sort each role by score descending
        for r in by_role:
            by_role[r].sort(key=lambda x: x['score'], reverse=True)
            
        # 2. Test all allowed formations or specific formation
        formations_to_eval = [preferred_formation] if preferred_formation and preferred_formation in ALLOWED_FORMATIONS else list(ALLOWED_FORMATIONS.keys())
        
        best_module = None
        best_total_score = -1
        best_starters = []
        best_details = {}
        
        for form_name in formations_to_eval:
            reqs = ALLOWED_FORMATIONS[form_name]
            # Check if user has enough players for this formation
            if len(by_role['P']) < reqs['P'] or len(by_role['D']) < reqs['D'] or len(by_role['C']) < reqs['C'] or len(by_role['A']) < reqs['A']:
                continue
                
            selected_starters = []
            selected_starters.extend(by_role['P'][:reqs['P']])
            selected_starters.extend(by_role['D'][:reqs['D']])
            selected_starters.extend(by_role['C'][:reqs['C']])
            selected_starters.extend(by_role['A'][:reqs['A']])
            
            # Base score sum
            total_score = sum(p['score'] for p in selected_starters)
            
            # Defense Modifier calculation (bonus if 4 or 5 defenders)
            mod_bonus = 0.0
            if use_defense_modifier and reqs['D'] >= 4:
                # Top 3 defenders + GK score estimate
                gk_score = by_role['P'][0]['score'] if by_role['P'] else 50
                top3_def = sum(p['score'] for p in by_role['D'][:3]) / 3.0
                avg_def = (gk_score + top3_def * 3.0) / 4.0
                if avg_def >= 75:
                    mod_bonus = 18.0 # Estimated +3 or +6 modifier
                elif avg_def >= 65:
                    mod_bonus = 10.0 # Estimated +1 modifier
                total_score += mod_bonus
                
            if total_score > best_total_score:
                best_total_score = total_score
                best_module = form_name
                best_starters = selected_starters
                best_details = {
                    'formation': form_name,
                    'total_score': round(total_score, 1),
                    'defense_modifier_bonus': round(mod_bonus, 1),
                    'starters_count': len(selected_starters)
                }

        # Fallback to 3-4-3 or whatever is possible if no formation met full criteria
        if not best_module:
            best_module = '3-4-3'
            best_starters = (by_role['P'][:1] + by_role['D'][:3] + by_role['C'][:4] + by_role['A'][:3])
            best_details = {'formation': best_module, 'total_score': round(sum(p['score'] for p in best_starters), 1), 'defense_modifier_bonus': 0}

        # 3. Create the Bench (Panchina)
        starter_ids = {p.get('id', p.get('name')) for p in best_starters}
        bench = []
        
        # Bench order: 1 GK, 2 D, 2 C, 2 A
        bench_p = [p for p in by_role['P'] if p.get('id', p.get('name')) not in starter_ids]
        bench_d = [p for p in by_role['D'] if p.get('id', p.get('name')) not in starter_ids]
        bench_c = [p for p in by_role['C'] if p.get('id', p.get('name')) not in starter_ids]
        bench_a = [p for p in by_role['A'] if p.get('id', p.get('name')) not in starter_ids]
        
        bench.extend(bench_p[:2])
        bench.extend(bench_d[:3])
        bench.extend(bench_c[:3])
        bench.extend(bench_a[:3])
        
        # Tribuna (extra players not in bench)
        bench_ids = {p.get('id', p.get('name')) for p in bench}
        tribuna = [p for p in evaluated_players if p.get('id', p.get('name')) not in starter_ids and p.get('id', p.get('name')) not in bench_ids]

        # 4. Ballottaggi & Tough Choices inside user's squad
        key_decisions = []
        # Compare highest benched player with lowest starter player per role
        for r_name in ['A', 'C', 'D']:
            r_starters = [p for p in best_starters if p['role'] == r_name]
            r_bench = [p for p in bench if p['role'] == r_name]
            if r_starters and r_bench:
                lowest_starter = min(r_starters, key=lambda x: x['score'])
                highest_bench = max(r_bench, key=lambda x: x['score'])
                diff = abs(lowest_starter['score'] - highest_bench['score'])
                if diff <= 6.0:
                    key_decisions.append({
                        'role': r_name,
                        'starter': lowest_starter['name'],
                        'starter_score': lowest_starter['score'],
                        'benched': highest_bench['name'],
                        'benched_score': highest_bench['score'],
                        'note': f"Ballottaggio serrato: {lowest_starter['name']} ({lowest_starter['score']}) vs {highest_bench['name']} ({highest_bench['score']}). Differenza di soli {round(diff, 1)} punti."
                    })

        return {
            'recommended_formation': best_module,
            'total_expected_score': best_details.get('total_score', 0),
            'defense_modifier_active': use_defense_modifier,
            'defense_modifier_bonus': best_details.get('defense_modifier_bonus', 0),
            'starters': best_starters,
            'bench': bench,
            'tribuna': tribuna,
            'key_decisions': key_decisions,
            'all_formations': list(ALLOWED_FORMATIONS.keys())
        }

if __name__ == '__main__':
    optimizer = LineupOptimizer()
    print("Optimizer initialized. Players indexed:", len(optimizer.players_lookup))
