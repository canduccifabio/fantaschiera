import json
import os
import re
from typing import List, Dict, Any, Tuple
from backend.sosfanta_analyzer import sosfanta_analyzer
from backend.intelligence import super_intelligence
from backend.ai_learning import ai_learning_engine

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
        """Finds upcoming match and whether player plays at home."""
        for match in self.fixtures_data.get('fixtures', []):
            if match.get('home_code') == player_team or player_team in match.get('home_team', ''):
                return match, True
            if match.get('away_code') == player_team or player_team in match.get('away_team', ''):
                return match, False
        return {}, False

    def evaluate_player(self, player: Dict) -> Dict:
        """
        Comprehensive Super-Intelligence evaluation:
        - Fanta-Score Index (0-100)
        - Expected Fantavoto (5.0 - 8.5)
        - Triple Consensus Lineups
        - Advanced SofaScore/Understat Metrics
        - Goalkeeper Clean Sheet Probability
        - Transparent motivation & score factors
        """
        norm_name = self._normalize_name(player['name'])
        role = player.get('role', 'C').upper()
        team = player.get('team', '')
        qa = player.get('qa', 10)
        fvm = player.get('fvm', 50)
        is_penalty = player.get('is_penalty_taker', False) or player.get('is_penalty', False)
        
        # 1. Injuries & Suspensions check
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
            is_susp = 'squalific' in injury_type.lower()
            return {
                **player,
                'score': 0.0,
                'expected_fantavoto': 0.0,
                'titolarita_pct': 0,
                'status': 'SQUALIFICATO' if is_susp else 'INFORTUNATO',
                'badge_class': 'danger',
                'stars': 0,
                'is_out': True,
                'injury_type': injury_type,
                'injury_reason': injury_reason,
                'match_info': "Indisponibile per il turno",
                'opponent': "-",
                'opponent_name': "-",
                'is_home': False,
                'advice': f"❌ {injury_type.upper()}: {injury_reason}",
                'sosfanta': {'category': 'INFORTUNATO', 'summary': injury_reason or 'Indisponibile', 'quote': '', 'mentioned': False},
                'motivation': {
                    'verdict_title': f"Indisponibile ({injury_type})",
                    'why_starter_or_bench': f"Escluso categoricamente dai titolari a causa di {injury_type.lower()}: {injury_reason}.",
                    'factors': []
                },
                'super_intelligence': {
                    'consensus': {'consensus_level': 'NON CONVOCATO', 'consensus_percentage': 0, 'sources': []},
                    'metrics': {'xg': 0, 'xa': 0, 'threat_score': 0, 'pure_base_grade': 0, 'trend': '❄️ Out'},
                    'goalkeeper': None
                }
            }

        # 2. Match Fixture & Base Probabilities
        match, is_home = self.find_player_match(team)
        opponent_code = match.get('away_code' if is_home else 'home_code', 'SERIE A') if match else 'N/A'
        opponent_name = match.get('away_team' if is_home else 'home_team', 'Avversario') if match else 'Avversario'
        opp_diff = TEAM_DIFFICULTY.get(opponent_code, 3.0)
        match_date = match.get('date_str', 'Prossimo turno') if match else 'Prossimo turno'

        official_pct = 70
        is_starter = False
        ballottaggio_note = ""
        if match:
            p_pcts = match.get('player_percentages', {})
            for p_key, p_val in p_pcts.items():
                if p_key in norm_name or norm_name in p_key:
                    official_pct = p_val.get('percentage', 70)
                    is_starter = p_val.get('is_starter', False)
                    break

            # Exact ballottaggio matching avoiding 1-letter false positives (e.g. 'g' in 'ramos g.' matching 'doig')
            clean_tokens = [re.sub(r'[^a-z0-9]', '', p) for p in norm_name.split()]
            valid_tokens = [t for t in clean_tokens if len(t) >= 3 and t not in ['del', 'della', 'dei', 'degli', 'san', 'van', 'von', 'dos', 'da']]
            
            for bal in match.get('ballottaggi', []):
                bal_lower = bal.lower()
                if norm_name in bal_lower:
                    ballottaggio_note = bal
                    break
                matched_token = False
                for token in valid_tokens:
                    if re.search(rf'\b{re.escape(token)}\b', bal_lower):
                        matched_token = True
                        break
                if matched_token:
                    ballottaggio_note = bal
                    break

        # 3. SUPER-INTELLIGENCE MODULE 1: Triple Consensus Lineups
        consensus_data = super_intelligence.evaluate_triple_consensus(player['name'], team, official_pct, is_starter)
        calibrated_titolarita = consensus_data['consensus_percentage']

        # 4. SUPER-INTELLIGENCE MODULE 2: SofaScore/Understat Advanced Metrics
        metrics_data = super_intelligence.get_advanced_metrics(player['name'], role)

        # 5. SUPER-INTELLIGENCE MODULE 3: Goalkeeper Clean Sheet Grid
        gk_data = None
        if role == 'P':
            gk_data = super_intelligence.evaluate_goalkeeper_matchup(player['name'], team, opponent_code, is_home)

        # 6. Editorial boost from SOS Fanta
        sf_analysis = sosfanta_analyzer.analyze_player(player['name'], team)
        sf_cat = sf_analysis.get('category', 'NEUTRO')
        
        editorial_bonus_map = {
            'SCHIERARE ASSOLUTO': 12.0,
            'PROMOSSO': 7.5,
            'IDEA A SORPRESA': 5.0,
            'SCHIERABILE': 3.0,
            'CITATO': 2.0,
            'COPERTURA': 1.0,
            'NEUTRO': 0.0,
            'ATTENZIONE / RISCHIOSO': -7.0,
            'SCONSIGLIATO': -12.0
        }
        # Dynamic weights optimized by the continuous AI learning engine
        learned_w = ai_learning_engine.get_weights()
        tit_max_w = learned_w.get('titolarita_max_weight', 35.0)
        home_b_w = learned_w.get('home_bonus_weight', 3.6)
        match_slope = learned_w.get('matchup_difficulty_slope', 2.55)
        def_base_m = learned_w.get('def_base_multiplier', 11.2)
        mid_base_m = learned_w.get('mid_base_multiplier', 10.1)
        att_base_m = learned_w.get('att_base_multiplier', 8.0)
        gk_base_m = learned_w.get('gk_base_multiplier', 18.0)
        ed_mult = learned_w.get('editorial_bonus_multiplier', 1.05)

        editorial_pts = (editorial_bonus_map.get(sf_cat, 0.0)) * ed_mult

        # --- COMPUTE COMPOSITE FANTA-SCORE INDEX (0 - 100) ---
        # A) Titolarità Consensus Factor (0 - 35 pt)
        titolarita_pts = (calibrated_titolarita / 100.0) * tit_max_w

        # B) Matchup & Opponent Factor (0 - 25 pt)
        home_bonus = home_b_w if is_home else 0.0
        matchup_pts = min(25.0, max(6.0, 11.0 + (5.0 - opp_diff) * match_slope + home_bonus))

        # C) Advanced Threat & Metrics Factor (0 - 25 pt) calibrated across all roles
        pure_base = metrics_data.get('pure_base_grade', 6.20)
        threat_score = metrics_data.get('threat_score', 3.0)

        if role == 'P':
            cs_pct = gk_data['clean_sheet_prob'] if gk_data else 35
            xgc = gk_data['expected_goals_conceded'] if gk_data else 1.2
            base_pts = min(12.0, max(6.0, (pure_base - 5.8) * gk_base_m))
            cs_pts = (cs_pct / 100.0) * 8.0
            xgc_pts = max(0.0, min(5.0, (2.0 - xgc) * 3.0))
            threat_pts = min(25.0, base_pts + cs_pts + xgc_pts)
        elif role == 'D':
            base_pts = min(14.0, max(7.0, 9.0 + (pure_base - 5.8) * def_base_m))
            off_pts = min(6.0, (threat_score / 10.0) * 6.0)
            qa_pts = min(5.0, (min(25, qa) / 25.0) * 5.0)
            threat_pts = min(25.0, base_pts + off_pts + qa_pts)
        elif role == 'C':
            base_pts = min(13.0, max(6.0, 8.0 + (pure_base - 5.8) * mid_base_m))
            off_pts = min(7.0, (threat_score / 10.0) * 7.0)
            qa_pts = min(5.0, (min(30, qa) / 30.0) * 5.0)
            threat_pts = min(25.0, base_pts + off_pts + qa_pts)
        else: # A
            base_pts = min(11.0, max(5.0, 7.0 + (pure_base - 5.8) * att_base_m))
            off_pts = min(10.0, (threat_score / 10.0) * 10.0)
            qa_pts = min(4.0, (min(36, qa) / 36.0) * 4.0)
            threat_pts = min(25.0, base_pts + off_pts + qa_pts)

        # D) Penalties & Specialties (0 - 10 pt)
        special_pts = 0.0
        if is_penalty:
            special_pts += 6.0
        if role == 'D' and pure_base >= 6.25 and is_home:
            special_pts += 2.5

        # E) Composite total score with natural nuances (no clamping to artificial floor)
        total_score = round(max(10.0, min(99.0, titolarita_pts + matchup_pts + threat_pts + special_pts + editorial_pts)), 1)

        # --- COMPUTE REALISTIC EXPECTED FANTAVOTO (5.0 - 8.5) ---
        if role == 'P':
            xgc = gk_data['expected_goals_conceded'] if gk_data else 1.2
            cs_p = (gk_data['clean_sheet_prob'] if gk_data else 30) / 100.0
            expected_fv = round(6.0 - (xgc * 0.9) + (cs_p * 0.8) + (0.3 if is_home else 0.0), 2)
        elif role == 'D':
            expected_fv = round(pure_base + (metrics_data['xa'] * 1.0) + (metrics_data['xg'] * 3.0) + (0.15 if is_home else 0.0), 2)
        elif role == 'C':
            pen_bonus = 0.6 if is_penalty else 0.0
            expected_fv = round(pure_base + (metrics_data['xg'] * 3.0) + (metrics_data['xa'] * 1.0) + pen_bonus, 2)
        else: # A
            pen_bonus = 0.8 if is_penalty else 0.0
            expected_fv = round(pure_base + (metrics_data['xg'] * 3.0) + (metrics_data['xa'] * 1.0) + pen_bonus, 2)

        # Status & Stars
        if total_score >= 80:
            stars = 5
            status = 'TOP DI GIORNATA'
            badge_class = 'success'
        elif total_score >= 70:
            stars = 4
            status = 'CONSIGLIATO'
            badge_class = 'primary'
        elif total_score >= 58:
            stars = 3
            status = 'SCHIERABILE'
            badge_class = 'info'
        elif total_score >= 45:
            stars = 2
            status = 'RISCHIOSO'
            badge_class = 'warning'
        else:
            stars = 1
            status = 'SCONSIGLIATO'
            badge_class = 'secondary'

        # Generate Human-Friendly Advice & In-depth Motivation
        reasons_list = []
        if is_penalty:
            reasons_list.append("🎯 Primo rigorista designato")
        if calibrated_titolarita >= 85:
            reasons_list.append(f"🟢 Titolarità certa al {calibrated_titolarita}% ({consensus_data['consensus_level']})")
        elif ballottaggio_note:
            reasons_list.append(f"🟡 Ballottaggio segnalato: {ballottaggio_note[:45]}")

        if is_home:
            reasons_list.append(f"🏠 Gioca in casa contro {opponent_name}")
        else:
            reasons_list.append(f"✈️ Trasferta insidiosa contro {opponent_name}")

        if metrics_data['xg'] >= 0.40:
            reasons_list.append(f"⚽ Alto indice xG atteso ({metrics_data['xg']} gol/gara)")
        if metrics_data['xa'] >= 0.25:
            reasons_list.append(f"👟 Creatore di occasioni xA ({metrics_data['xa']} assist/gara)")

        if role == 'P' and gk_data:
            reasons_list.append(f"🧤 Clean sheet probabile al {gk_data['clean_sheet_prob']}% (xGC: {gk_data['expected_goals_conceded']})")

        if sf_analysis.get('mentioned'):
            reasons_list.append(f"🔥 SOS Fanta: \"{sf_analysis['quote']}\"")

        # Paragraph explaining why he is recommended as starter or bench
        why_text = f"Consigliato titolare con indice {total_score}/100 e fanta-voto atteso di {expected_fv}. "
        if calibrated_titolarita >= 80:
            why_text += f"Presenza da titolare garantita all'unanimità (Fantacalcio.it, Sky Sport e Gazzetta). "
        if metrics_data['threat_score'] >= 5.0:
            why_text += f"Le metriche avanzate SofaScore evidenziano grande pericolosità offensiva (xG/xA: {metrics_data['xg']}/{metrics_data['xa']}). "
        if sf_analysis.get('mentioned'):
            why_text += f"Verdetto SOS Fanta: {sf_analysis['category']} ({sf_analysis['summary']})."

        factors_detail = [
            {'label': 'Triplo Consenso Fonti', 'val': f"{calibrated_titolarita}% • {consensus_data['consensus_level']}", 'desc': consensus_data['summary']},
            {'label': 'Metriche SofaScore / Understat', 'val': f"xG: {metrics_data['xg']} | xA: {metrics_data['xa']}", 'desc': f"Trend: {metrics_data['trend']} • Tiri/p: {metrics_data['shots_per_game']}"},
            {'label': 'Fattore Partita & Difesa Avversaria', 'val': f"{'In Casa 🏠' if is_home else 'Trasferta ✈️'} vs {opponent_code}", 'desc': f"Difficoltà avversario: {opp_diff}/5.0"},
            {'label': 'Consiglio SOS Fanta', 'val': sf_analysis.get('category', 'NEUTRO'), 'desc': sf_analysis.get('quote', 'Valutazione partita standard.')}
        ]

        if role in ['D', 'P']:
            factors_detail.append({
                'label': 'Impatto Modificatore Difesa',
                'val': f"Media voto base {metrics_data['pure_base_grade']}",
                'desc': "Contribuisce direttamente alla media del reparto difensivo."
            })

        return {
            **player,
            'score': total_score,
            'expected_fantavoto': expected_fv,
            'titolarita_pct': calibrated_titolarita,
            'status': status,
            'badge_class': badge_class,
            'stars': stars,
            'is_out': False,
            'match_info': f"vs {opponent_code} ({'C' if is_home else 'T'}) • {match_date}",
            'opponent': opponent_code,
            'opponent_name': opponent_name,
            'is_home': is_home,
            'advice': f"{'🌟 ' if stars >= 4 else '👉 '}{status}: {', '.join(reasons_list[:3])}.",
            'ballottaggio_note': ballottaggio_note,
            'sosfanta': sf_analysis,
            'motivation': {
                'verdict_title': f"{status} (★ {total_score}/100)",
                'expected_fv': expected_fv,
                'why_starter_or_bench': why_text,
                'factors': factors_detail
            },
            'super_intelligence': {
                'consensus': consensus_data,
                'metrics': metrics_data,
                'goalkeeper': gk_data
            }
        }

    def optimize_lineup(self, user_players: List[Dict], preferred_formation: str = None, use_defense_modifier: bool = True) -> Dict:
        """
        Optimizes lineup, calculates real expected fantapunti, tests all formations,
        and applies the user's defense modifier rules:
        - 6.00 to 6.49: +1 pt
        - 6.50 to 6.99: +3 pt
        - >= 7.00: +6 pt

        When preferred_formation is 'auto' or None, evaluates modules to find the absolute
        maximum expected points (comparing with vs without modifier impact).
        """
        evaluated_players = [self.evaluate_player(p) for p in user_players]
        
        # Filter available vs injured/suspended
        available_players = [p for p in evaluated_players if not p.get('is_out', False)]
        injured_players = [p for p in evaluated_players if p.get('is_out', False)]
        
        # Group available by role
        by_role = {'P': [], 'D': [], 'C': [], 'A': []}
        for p in available_players:
            role = p.get('role', 'C').upper()
            if role in by_role:
                by_role[role].append(p)
            else:
                by_role['C'].append(p)
                
        # Sort each role by score descending
        for r in by_role:
            by_role[r].sort(key=lambda x: x['score'], reverse=True)
            
        formations_to_eval = [preferred_formation] if preferred_formation and preferred_formation in ALLOWED_FORMATIONS else list(ALLOWED_FORMATIONS.keys())
        
        best_module = None
        best_composite_score = -1
        best_starters = []
        best_details = {}
        
        for form_name in formations_to_eval:
            reqs = ALLOWED_FORMATIONS[form_name]
            if len(by_role['P']) < reqs['P'] or len(by_role['D']) < reqs['D'] or len(by_role['C']) < reqs['C'] or len(by_role['A']) < reqs['A']:
                continue
                
            selected_starters = []
            selected_starters.extend(by_role['P'][:reqs['P']])
            selected_starters.extend(by_role['D'][:reqs['D']])
            selected_starters.extend(by_role['C'][:reqs['C']])
            selected_starters.extend(by_role['A'][:reqs['A']])
            
            # Sum expected fantavoto
            base_expected_fv = sum(p['expected_fantavoto'] for p in selected_starters)
            
            # Defense Modifier calculation
            # Rule: Portiere + 3 migliori difensori (con almeno 4 difensori in campo)
            mod_bonus = 0.0
            mod_avg = 0.0
            mod_tier = "Nessun bonus"
            if use_defense_modifier and reqs['D'] >= 4:
                gk_grade = selected_starters[0]['super_intelligence']['metrics']['pure_base_grade']
                top3_def_grades = [d['super_intelligence']['metrics']['pure_base_grade'] for d in selected_starters[1:4]]
                mod_avg = round((gk_grade + sum(top3_def_grades)) / 4.0, 2)
                
                if mod_avg >= 7.00:
                    mod_bonus = 6.0
                    mod_tier = "+6 Punti (Media Reparto ≥ 7.00)"
                elif mod_avg >= 6.50:
                    mod_bonus = 3.0
                    mod_tier = "+3 Punti (Media Reparto 6.50 - 6.99)"
                elif mod_avg >= 6.00:
                    mod_bonus = 1.0
                    mod_tier = "+1 Punto (Media Reparto 6.00 - 6.49)"
                else:
                    mod_bonus = 0.0
                    mod_tier = "0 Punti (Media Reparto < 6.00)"

            total_team_expected_pts = round(base_expected_fv + mod_bonus, 1)
            
            # Primary criterion: HIGHEST EXPECTED FANTAPUNTI (multiplied by 1000 so points strictly dominate)
            # Secondary criterion: total quality score as tiebreaker
            quality_score = sum(p['score'] for p in selected_starters)
            composite_value = (total_team_expected_pts * 1000.0) + quality_score
            
            if composite_value > best_composite_score:
                best_composite_score = composite_value
                best_module = form_name
                best_starters = selected_starters
                best_details = {
                    'formation': form_name,
                    'total_expected_points': total_team_expected_pts,
                    'base_expected_fv': round(base_expected_fv, 1),
                    'defense_modifier_bonus': mod_bonus,
                    'defense_modifier_avg': mod_avg,
                    'defense_modifier_tier': mod_tier,
                    'starters_count': len(selected_starters)
                }

        # Fallback to available players if criteria failed
        if not best_module:
            best_module = '3-4-3'
            best_starters = (by_role['P'][:1] + by_role['D'][:3] + by_role['C'][:4] + by_role['A'][:3])
            total_pts = round(sum(p['expected_fantavoto'] for p in best_starters), 1)
            best_details = {
                'formation': best_module,
                'total_expected_points': total_pts,
                'base_expected_fv': total_pts,
                'defense_modifier_bonus': 0.0,
                'defense_modifier_avg': 0.0,
                'defense_modifier_tier': 'Non applicabile',
                'starters_count': len(best_starters)
            }

        # Bench construction:
        # First include all healthy available players in priority order by role & quality score.
        # Then, append any injured/suspended squad players at the tail so that the entire
        # 25-man squad is completely visible and represented on the match sheet!
        starter_ids = {p.get('id', p.get('name')) for p in best_starters}
        bench = []
        bench_p = [p for p in by_role['P'] if p.get('id', p.get('name')) not in starter_ids]
        bench_d = [p for p in by_role['D'] if p.get('id', p.get('name')) not in starter_ids]
        bench_c = [p for p in by_role['C'] if p.get('id', p.get('name')) not in starter_ids]
        bench_a = [p for p in by_role['A'] if p.get('id', p.get('name')) not in starter_ids]
        
        bench.extend(bench_p)
        bench.extend(bench_d)
        bench.extend(bench_c)
        bench.extend(bench_a)
        
        # Complete bench with injured players if available
        if injured_players:
            role_order = {'P': 0, 'D': 1, 'C': 2, 'A': 3}
            injured_sorted = sorted(injured_players, key=lambda x: (role_order.get(x.get('role', 'C'), 4), -x.get('qa', 0)))
            bench.extend(injured_sorted)
        
        bench_ids = {p.get('id', p.get('name')) for p in bench}
        tribuna = [p for p in available_players if p.get('id', p.get('name')) not in starter_ids and p.get('id', p.get('name')) not in bench_ids]

        # Goal Range & Fantacalcio thresholds
        # First goal at 66 pt, then +1 goal every 6 pt (66=1, 72=2, 78=3, 84=4)
        tot_pts = best_details.get('total_expected_points', 72.0)
        if tot_pts < 66.0:
            goals_expected = 0
            tier_text = f"0 Gol (Mancano {round(66.0 - tot_pts, 1)} pt al 1° gol)"
            pts_to_next = round(66.0 - tot_pts, 1)
            next_goal = 1
        elif tot_pts < 72.0:
            goals_expected = 1
            tier_text = f"1 Gol ⚽ (Fascia 66.0 - 71.9 pt)"
            pts_to_next = round(72.0 - tot_pts, 1)
            next_goal = 2
        elif tot_pts < 78.0:
            goals_expected = 2
            tier_text = f"2 Gol ⚽⚽ (Fascia 72.0 - 77.9 pt)"
            pts_to_next = round(78.0 - tot_pts, 1)
            next_goal = 3
        elif tot_pts < 84.0:
            goals_expected = 3
            tier_text = f"3 Gol ⚽⚽⚽ (Fascia 78.0 - 83.9 pt)"
            pts_to_next = round(84.0 - tot_pts, 1)
            next_goal = 4
        else:
            goals_expected = 4
            tier_text = f"4+ Gol ⚽⚽⚽⚽ (Fascia ≥ 84.0 pt)"
            pts_to_next = 0.0
            next_goal = 5

        # Ballottaggi key choices
        key_decisions = []
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
                        'note': f"Ballottaggio serrato: {lowest_starter['name']} (★ {lowest_starter['score']}) vs {highest_bench['name']} (★ {highest_bench['score']}). Vantaggio: +{round(diff, 1)} pt a favore di {lowest_starter['name']}."
                    })

        return {
            'recommended_formation': best_module,
            'total_expected_score': best_details.get('total_expected_points', 72.0),
            'base_expected_score': best_details.get('base_expected_fv', 70.0),
            'goals_expected': goals_expected,
            'goals_tier_text': tier_text,
            'pts_to_next_goal': pts_to_next,
            'next_goal_tier': next_goal,
            'defense_modifier_active': use_defense_modifier,
            'defense_modifier_bonus': best_details.get('defense_modifier_bonus', 0.0),
            'defense_modifier_avg': best_details.get('defense_modifier_avg', 0.0),
            'defense_modifier_tier': best_details.get('defense_modifier_tier', ''),
            'starters': best_starters,
            'bench': bench,
            'tribuna': tribuna,
            'injured_players': injured_players,
            'key_decisions': key_decisions,
            'all_formations': list(ALLOWED_FORMATIONS.keys())
        }

if __name__ == '__main__':
    optimizer = LineupOptimizer()
    print("Optimizer with Super-Intelligence ready.")
