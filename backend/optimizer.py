import json
import os
import re
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta
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

    def get_fixtures_for_matchday(self, matchday: Optional[int] = None) -> Dict:
        """Returns fixtures data dynamically for any matchday."""
        now = datetime.now()
        # 1. If specific matchday requested, check specific file first
        if matchday:
            f_path = os.path.join(DATA_DIR, f'fixtures_giornata_{matchday}.json')
            if os.path.exists(f_path):
                data = self._load_json(f_path, {'fixtures': []})
                earliest = data.get('earliest_kickoff_iso')
                is_past = False
                if earliest:
                    try:
                        is_past = datetime.fromisoformat(earliest) < (now - timedelta(days=4))
                    except Exception:
                        pass
                data['matchday'] = matchday
                data['matchday_label'] = f"{matchday}ª Giornata ({'Referti' if is_past else 'In Arrivo'})"
                data['is_past'] = is_past
                return data

        # 2. Default: current fixtures cache
        data = self._load_json(FIXTURES_FILE, {'fixtures': []})
        current_md = data.get('matchday')
        if not current_md:
            from backend.sosfanta_analyzer import sosfanta_analyzer
            current_md = sosfanta_analyzer.get_matchday_number() or 7
        data['matchday'] = current_md
        data['matchday_label'] = f"{current_md}ª Giornata (Attuale / In Arrivo)"
        data['is_past'] = False
        return data

    def find_player_match(self, player_team: str, fixtures_list: Optional[List[Dict]] = None) -> Tuple[Dict, bool]:
        """Finds match and whether player plays at home."""
        flist = fixtures_list if fixtures_list is not None else self.fixtures_data.get('fixtures', [])
        for match in flist:
            if match.get('home_code') == player_team or player_team in match.get('home_team', ''):
                return match, True
            if match.get('away_code') == player_team or player_team in match.get('away_team', ''):
                return match, False
        return {}, False

    def evaluate_player(self, player: Dict, fixtures_list: Optional[List[Dict]] = None, matchday: Optional[int] = None) -> Dict:
        """
        Comprehensive Super-Intelligence evaluation:
        - Fanta-Score Index (0-100)
        - Expected Fantavoto (5.0 - 8.5)
        - Triple Consensus Lineups
        - Advanced SofaScore/Understat Metrics
        - Goalkeeper Clean Sheet Probability
        - Transparent motivation & score factors
        - Matchday-isolated SOS Fanta analysis
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
        match, is_home = self.find_player_match(team, fixtures_list=fixtures_list)
        opponent_code = match.get('away_code' if is_home else 'home_code', 'SERIE A') if match else 'N/A'
        opponent_name = match.get('away_team' if is_home else 'home_team', 'Avversario') if match else 'Avversario'
        opp_diff = TEAM_DIFFICULTY.get(opponent_code, 3.0)
        match_date = match.get('date_str', 'Prossimo turno') if match else 'Prossimo turno'

        try:
            from zoneinfo import ZoneInfo
            now = datetime.now(ZoneInfo('Europe/Rome')).replace(tzinfo=None)
        except Exception:
            now = datetime.now()

        is_official = False
        is_live = False
        is_finished = False
        kickoff_dt = None
        if match and match.get('datetime_iso'):
            try:
                kickoff_dt = datetime.fromisoformat(match['datetime_iso'])
            except Exception:
                pass
        
        if kickoff_dt:
            if now >= kickoff_dt - timedelta(minutes=60):
                is_official = True
            if kickoff_dt <= now < kickoff_dt + timedelta(minutes=115):
                is_live = True
            elif now >= kickoff_dt + timedelta(minutes=115):
                is_finished = True

        official_pct = 70
        is_starter = False
        ballottaggio_note = ""
        if match:
            lineups = (match.get('home_lineup') or []) + (match.get('away_lineup') or [])
            is_in_lineup = any(p_n.lower() in norm_name or norm_name in p_n.lower() for p_n in lineups)

            p_pcts = match.get('player_percentages', {})
            for p_key, p_val in p_pcts.items():
                if p_key in norm_name or norm_name in p_key:
                    official_pct = p_val.get('percentage', 70)
                    is_starter = p_val.get('is_starter', False)
                    break

            if (is_official or is_live or is_finished) and (is_in_lineup or is_starter):
                official_pct = 100
                is_starter = True

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
        
        # 100% titolarità is assigned ONLY when official lineups are out, match is live, or match is finished
        if (is_official and is_starter) or is_live or is_finished:
            calibrated_titolarita = 100
            consensus_data['consensus_percentage'] = 100
            consensus_data['consensus_level'] = '100% UFFICIALE'
            consensus_data['summary'] = 'Titolare confermato nelle formazioni ufficiali Serie A.'
        else:
            # For upcoming matches without official lineups, strictly respect the real statistical percentages
            calibrated_titolarita = consensus_data['consensus_percentage']

        if is_live:
            match_status_label = 'IN CORSO'
            status_badge_label = 'LIVE 🔴'
            display_match_info = f"🔴 LIVE vs {opponent_code} ({'C' if is_home else 'T'}) • In corso"
        elif is_finished:
            match_status_label = 'TERMINATA'
            status_badge_label = 'FINALE 🏁'
            display_match_info = f"🏁 FINALE vs {opponent_code} ({'C' if is_home else 'T'})"
        elif is_official:
            match_status_label = 'UFFICIALI'
            status_badge_label = 'UFFICIALI 🟢'
            display_match_info = f"🟢 UFFICIALI vs {opponent_code} ({'C' if is_home else 'T'}) • {match_date}"
        else:
            match_status_label = 'DA GIOCARE'
            status_badge_label = 'DA GIOCARE ⏳'
            display_match_info = f"vs {opponent_code} ({'C' if is_home else 'T'}) • {match_date}"

        # 4. SUPER-INTELLIGENCE MODULE 2: SofaScore/Understat Advanced Metrics
        metrics_data = super_intelligence.get_advanced_metrics(player['name'], role)

        # 5. SUPER-INTELLIGENCE MODULE 3: Goalkeeper Clean Sheet Grid
        gk_data = None
        if role == 'P':
            gk_data = super_intelligence.evaluate_goalkeeper_matchup(player['name'], team, opponent_code, is_home)

        # 6. Editorial boost from SOS Fanta
        target_md = matchday or self.fixtures_data.get('matchday', 7)
        sf_analysis = sosfanta_analyzer.analyze_player(player['name'], team, matchday=target_md)
        sf_cat = sf_analysis.get('category', 'NEUTRO')
        sf_is_published = sf_analysis.get('is_published', True)
        
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
        home_b_w = learned_w.get('home_bonus_weight', 3.2)
        match_slope = learned_w.get('matchup_difficulty_slope', 2.90)
        def_base_m = learned_w.get('def_base_multiplier', 11.2)
        mid_base_m = learned_w.get('mid_base_multiplier', 10.1)
        att_base_m = learned_w.get('att_base_multiplier', 6.8)
        gk_base_m = learned_w.get('gk_base_multiplier', 18.0)
        ed_mult = learned_w.get('editorial_bonus_multiplier', 1.02)

        # Advanced Opta / FBref / AIA parameters
        npxg_w = learned_w.get('npxg_weight', 5.5)
        sca_w = learned_w.get('sca_weight', 1.8)
        corner_w = learned_w.get('corner_specialty_weight', 2.5)
        turnover_damp = learned_w.get('turnover_damp_factor', 0.88)
        ref_strict_w = learned_w.get('referee_strictness_weight', 1.35)

        editorial_pts = (editorial_bonus_map.get(sf_cat, 0.0)) * ed_mult if sf_is_published else 0.0

        # Environmental & Advanced Context (Referee Strictness & Disciplinary Risk, European Turnover)
        disc_context = super_intelligence.evaluate_referee_and_discipline(player['name'], team, role, opponent_code)
        euro_context = super_intelligence.evaluate_european_turnover(player['name'], team)

        # --- COMPUTE COMPOSITE FANTA-SCORE INDEX (0 - 100) ---
        # A) Titolarità Consensus Factor (0 - 35 pt)
        titolarita_pts = (calibrated_titolarita / 100.0) * tit_max_w

        # B) Matchup & Opponent Factor (0 - 25 pt)
        home_bonus = home_b_w if is_home else 0.0
        matchup_pts = min(25.0, max(6.0, 11.0 + (5.0 - opp_diff) * match_slope + home_bonus))

        # C) Advanced Threat & Metrics Factor (0 - 25 pt) calibrated across all roles
        pure_base = metrics_data.get('pure_base_grade', 6.20)
        threat_score = metrics_data.get('threat_score', 3.0)
        npxg_val = metrics_data.get('npxg', metrics_data.get('xg', 0.0))
        sca_val = metrics_data.get('sca', 1.0)

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
            off_pts = min(7.0, ((threat_score / 10.0) * 4.5) + min(2.5, (sca_val / 3.0) * (sca_w / 1.8)))
            qa_pts = min(5.0, (min(30, qa) / 30.0) * 5.0)
            threat_pts = min(25.0, base_pts + off_pts + qa_pts)
        else: # A
            base_pts = min(11.0, max(5.0, 7.0 + (pure_base - 5.8) * att_base_m))
            off_pts = min(10.0, ((threat_score / 10.0) * 6.0) + min(4.0, (npxg_val * (npxg_w / 5.5) * 4.0)))
            qa_pts = min(4.0, (min(36, qa) / 36.0) * 4.0)
            threat_pts = min(25.0, base_pts + off_pts + qa_pts)

        # D) Penalties, Set Pieces & Specialties (0 - 10 pt)
        special_pts = 0.0
        if is_penalty:
            special_pts += 5.0
        if metrics_data.get('is_corner_taker'):
            special_pts += corner_w
        if metrics_data.get('is_freekick_taker'):
            special_pts += 1.5
        if role == 'D' and pure_base >= 6.25 and is_home:
            special_pts += 2.0

        # E) Disciplinary & Referee Malus Risk Adjustment
        disc_penalty = disc_context.get('malus_penalty_pts', 0.0) * (ref_strict_w / 1.35)

        # F) European Turnover / Fatigue Dampener
        turnover_penalty = 0.0
        if euro_context.get('turnover_level') == 'Medio (Gestione Minuti)' and not (is_official and is_starter):
            turnover_penalty = 2.5

        # Composite total score with natural nuances
        raw_score = titolarita_pts + matchup_pts + threat_pts + special_pts + editorial_pts - disc_penalty - turnover_penalty
        if euro_context.get('turnover_level') == 'Alto' and not (is_official and is_starter):
            raw_score *= turnover_damp

        total_score = round(max(10.0, min(99.0, raw_score)), 1)

        # --- COMPUTE REALISTIC EXPECTED FANTAVOTO (5.0 - 8.5) ---
        att_away_damp = learned_w.get('att_away_damp', 0.85) if not is_home else 1.0
        def_risk_p = learned_w.get('def_risk_penalty', 1.45)

        set_piece_fv_bonus = (0.20 if metrics_data.get('is_corner_taker') else 0.0) + (0.12 if metrics_data.get('is_freekick_taker') else 0.0)
        turnover_fv_discount = 0.15 if euro_context.get('turnover_level') == 'Medio (Gestione Minuti)' and not (is_official and is_starter) else 0.0

        if role == 'P':
            xgc = gk_data['expected_goals_conceded'] if gk_data else 1.2
            cs_p = (gk_data['clean_sheet_prob'] if gk_data else 30) / 100.0
            expected_fv = round(6.0 - (xgc * 0.9) + (cs_p * 0.8) + (0.3 if is_home else 0.0), 2)
        elif role == 'D':
            foul_discount = 0.25 * max(0.0, def_risk_p - 1.0) + (0.15 if disc_context.get('player_card_risk') == 'Alto' else 0.0)
            expected_fv = round(max(4.5, pure_base + (metrics_data['xa'] * 1.0) + (metrics_data['xg'] * 2.5) + set_piece_fv_bonus + (0.15 if is_home else 0.0) - foul_discount - turnover_fv_discount), 2)
        elif role == 'C':
            pen_bonus = 0.6 if is_penalty else 0.0
            card_disc = 0.10 if disc_context.get('player_card_risk') == 'Alto' else 0.0
            expected_fv = round(pure_base + (npxg_val * 2.8) + (metrics_data['xa'] * 1.0) + (sca_val * 0.10) + pen_bonus + set_piece_fv_bonus - card_disc - turnover_fv_discount, 2)
        else: # A
            pen_bonus = 0.8 if is_penalty else 0.0
            card_disc = 0.10 if disc_context.get('player_card_risk') == 'Alto' else 0.0
            expected_fv = round(pure_base + (((npxg_val * 2.8) + (metrics_data['xa'] * 1.0) + (sca_val * 0.08)) * att_away_damp) + pen_bonus + set_piece_fv_bonus - card_disc - turnover_fv_discount, 2)

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
        if metrics_data.get('is_corner_taker') or metrics_data.get('is_freekick_taker'):
            reasons_list.append("📐 Battitore piazzati/corner")
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
        if disc_context.get('player_card_risk') == 'Alto':
            reasons_list.append("⚠️ Rischio malus cartellino (arbitro severo)")

        if role == 'P' and gk_data:
            reasons_list.append(f"🧤 Clean sheet probabile al {gk_data['clean_sheet_prob']}% (xGC: {gk_data['expected_goals_conceded']})")

        if sf_is_published and sf_analysis.get('mentioned'):
            reasons_list.append(f"🔥 SOS Fanta: \"{sf_analysis['quote']}\"")

        # Paragraph explaining why he is recommended as starter or bench
        why_text = f"Consigliato titolare con indice {total_score}/100 e fanta-voto atteso di {expected_fv}. "
        if calibrated_titolarita >= 80:
            why_text += f"Presenza da titolare garantita all'unanimità (Fantacalcio.it, Sky Sport e Gazzetta). "
        if metrics_data['threat_score'] >= 5.0:
            why_text += f"Le metriche avanzate evidenziano grande pericolosità (xG/xA: {metrics_data['xg']}/{metrics_data['xa']} • SCA: {metrics_data.get('sca', 1.0)}). "
        if sf_is_published and sf_analysis.get('mentioned'):
            why_text += f"Verdetto SOS Fanta: {sf_analysis['category']} ({sf_analysis['summary']})."

        sf_val = sf_analysis.get('category', 'NEUTRO') if sf_is_published else 'IN ARRIVO ⏳'
        sf_desc = sf_analysis.get('quote', 'Valutazione partita standard.') if sf_is_published else f"Preview SOS Fanta {target_md}ª Giornata in arrivo (pubblicazione 24-48h prima del calcio d'inizio)."

        factors_detail = [
            {'label': 'Triplo Consenso Fonti', 'val': f"{calibrated_titolarita}% • {consensus_data['consensus_level']}", 'desc': consensus_data['summary']},
            {'label': 'Metriche SofaScore / Understat', 'val': f"xG: {metrics_data['xg']} (npxG: {metrics_data.get('npxg', metrics_data['xg'])}) | xA: {metrics_data['xa']}", 'desc': f"Trend: {metrics_data['trend']} • Tiri/p: {metrics_data['shots_per_game']} • SCA: {metrics_data.get('sca', 1.0)}"},
            {'label': 'Fattore Partita & Difesa Avversaria', 'val': f"{'In Casa 🏠' if is_home else 'Trasferta ✈️'} vs {opponent_code}", 'desc': f"Difficoltà avversario: {opp_diff}/5.0 • Rischio rotazione: {metrics_data.get('turnover_risk', 'Basso')}"},
            {'label': 'Piazzati & Corner (Opta)', 'val': ('🟢 Battitore Corner/Piazzati (+2.5 pt)' if metrics_data.get('is_corner_taker') or metrics_data.get('is_freekick_taker') else 'Nessun piazzato designato'), 'desc': ('Incaricato di corner e punizioni: alto potenziale di assist da fermo.' if metrics_data.get('is_corner_taker') else 'Non batte corner o punizioni dirette.')},
            {'label': 'Rischio Disciplinare Arbitro', 'val': f"{disc_context.get('referee_strictness', 'Equilibrato')} • Rischio {disc_context.get('player_card_risk', 'Basso')}", 'desc': disc_context.get('warning', 'Direzione arbitrale standard.')},
            {'label': f"Consiglio SOS Fanta ({target_md}ª G.)", 'val': sf_val, 'desc': sf_desc}
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
            'match_info': display_match_info,
            'match_status': match_status_label,
            'status_badge': status_badge_label,
            'is_live': is_live,
            'is_finished': is_finished,
            'is_official': is_official,
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

    def _generate_ballottaggio_comparison(self, starter: Dict, benched: Dict, role: str) -> Dict:
        role_map = {
            'P': 'Portiere',
            'D': 'Difensore',
            'C': 'Centrocampista',
            'A': 'Attaccante'
        }
        role_label = role_map.get(role, 'Giocatore')
        starter_name = starter.get('name', 'Titolare')
        benched_name = benched.get('name', 'Riserva')
        starter_score = round(starter.get('score', 0.0), 1)
        benched_score = round(benched.get('score', 0.0), 1)
        diff = round(starter_score - benched_score, 1)

        starter_fv = round(starter.get('expected_fantavoto', 6.0), 2)
        benched_fv = round(benched.get('expected_fantavoto', 6.0), 2)
        starter_tit = starter.get('titolarita_pct', 70)
        benched_tit = benched.get('titolarita_pct', 70)
        starter_home = starter.get('is_home', True)
        benched_home = benched.get('is_home', True)
        starter_opp = starter.get('opponent_name', starter.get('opponent', 'Avversario'))
        benched_opp = benched.get('opponent_name', benched.get('opponent', 'Avversario'))

        starter_intel = starter.get('super_intelligence', {})
        benched_intel = benched.get('super_intelligence', {})
        starter_metrics = starter_intel.get('metrics', {})
        benched_metrics = benched_intel.get('metrics', {})
        starter_sf = starter.get('sosfanta', {})
        benched_sf = benched.get('sosfanta', {})

        factors = []

        # 1. Calendario & Matchup
        venue_str_st = f"In Casa 🏠 vs {starter_opp}" if starter_home else f"Trasferta ✈️ vs {starter_opp}"
        venue_str_be = f"In Casa 🏠 vs {benched_opp}" if benched_home else f"Trasferta ✈️ vs {benched_opp}"
        factors.append({
            'label': 'Fattore Matchup & Sede',
            'icon': '🏟️',
            'starter_val': venue_str_st,
            'benched_val': venue_str_be,
            'advantage': 'starter' if (starter_home and not benched_home) else ('neutral' if (starter_home == benched_home) else 'benched'),
            'detail': "Il fattore campo a favore e la minor pressione offensiva dell'avversario premiano il titolare." if starter_home else "Match comunque favorevole nonostante l'impegno esterno."
        })

        # 2. Titolarità & Consenso Fonti
        st_cons = starter_intel.get('consensus', {})
        be_cons = benched_intel.get('consensus', {})
        st_cons_lvl = st_cons.get('consensus_level', 'Titolare')
        be_cons_lvl = be_cons.get('consensus_level', 'Ballottaggio')
        factors.append({
            'label': 'Titolarità & Consenso Fonti',
            'icon': '👥',
            'starter_val': f"{starter_tit}% ({st_cons_lvl})",
            'benched_val': f"{benched_tit}% ({be_cons_lvl})",
            'advantage': 'starter' if starter_tit >= benched_tit else 'benched',
            'detail': "Conferma da Fantacalcio.it, Sky e Gazzetta: certezza di voto dal 1° minuto senza rischiare s.v."
        })

        # 3. Metriche Avanzate di Reparto
        if role == 'P':
            st_gk = starter_intel.get('goalkeeper', {})
            be_gk = benched_intel.get('goalkeeper', {})
            st_cs = st_gk.get('clean_sheet_prob', 35)
            be_cs = be_gk.get('clean_sheet_prob', 25)
            st_xgc = st_gk.get('expected_goals_conceded', 1.1)
            be_xgc = be_gk.get('expected_goals_conceded', 1.5)
            factors.append({
                'label': 'Clean Sheet & Rischio Malus Portiere',
                'icon': '🧤',
                'starter_val': f"Clean Sheet: {st_cs}% | xGC: {st_xgc}",
                'benched_val': f"Clean Sheet: {be_cs}% | xGC: {be_xgc}",
                'advantage': 'starter' if st_cs >= be_cs else 'benched',
                'detail': f"Minore probabilità di malus da gol subito ({st_xgc} vs {be_xgc} gol previsti)."
            })
        elif role in ['A', 'C']:
            st_xg = starter_metrics.get('xg', 0.0)
            be_xg = benched_metrics.get('xg', 0.0)
            st_npxg = starter_metrics.get('npxg', st_xg)
            be_npxg = benched_metrics.get('npxg', be_xg)
            st_xa = starter_metrics.get('xa', 0.0)
            be_xa = benched_metrics.get('xa', 0.0)
            st_shots = starter_metrics.get('shots_per_game', 0.0)
            be_shots = benched_metrics.get('shots_per_game', 0.0)
            factors.append({
                'label': 'Metriche Avanzate SofaScore (xG / xA / Tiri)',
                'icon': '📊',
                'starter_val': f"xG: {st_xg} (npxG: {st_npxg}) • xA: {st_xa} • Tiri: {st_shots}/g",
                'benched_val': f"xG: {be_xg} (npxG: {be_npxg}) • xA: {be_xa} • Tiri: {be_shots}/g",
                'advantage': 'starter' if (st_xg + st_xa) >= (be_xg + be_xa) else 'benched',
                'detail': "Indice di minaccia offensiva e volume di conclusioni/assist attesi favorevoli al titolare."
            })
        else: # Difesa
            st_bg = starter_metrics.get('pure_base_grade', 6.2)
            be_bg = benched_metrics.get('pure_base_grade', 6.1)
            st_xa = starter_metrics.get('xa', 0.0)
            be_xa = benched_metrics.get('xa', 0.0)
            factors.append({
                'label': 'Impatto Modificatore & Spinta Fasce',
                'icon': '🛡️',
                'starter_val': f"Media Base: {st_bg} • xA: {st_xa}",
                'benched_val': f"Media Base: {be_bg} • xA: {be_xa}",
                'advantage': 'starter' if st_bg >= be_bg else 'benched',
                'detail': "Rendimento atteso più affidabile per raggiungere la sufficienza piena e bonus modificatore."
            })

        # 4. Parere Giornalistico SOS Fanta
        st_cat = starter_sf.get('category', 'SCHIERABILE')
        be_cat = benched_sf.get('category', 'SCHIERABILE')
        factors.append({
            'label': 'Verdetto Redazione SOS Fanta',
            'icon': '📰',
            'starter_val': f"{st_cat}",
            'benched_val': f"{be_cat}",
            'advantage': 'starter' if ('ASSOLUTO' in st_cat or 'PROMOSSO' in st_cat) else 'neutral',
            'detail': f"Citazione Titolare: \"{starter_sf.get('quote', 'Schierabile')}...\""
        })

        # 5. Piazzati & Corner (Opta)
        st_corner = starter_metrics.get('is_corner_taker', False) or starter_metrics.get('is_freekick_taker', False) or starter.get('is_penalty', False)
        be_corner = benched_metrics.get('is_corner_taker', False) or benched_metrics.get('is_freekick_taker', False) or benched.get('is_penalty', False)
        st_corner_str = "Rigorista / Corner 🎯" if starter.get('is_penalty') else ("Battitore Corner/Piazzati 📐" if st_corner else "Nessun piazzato")
        be_corner_str = "Rigorista / Corner 🎯" if benched.get('is_penalty') else ("Battitore Corner/Piazzati 📐" if be_corner else "Nessun piazzato")
        factors.append({
            'label': 'Calci Piazzati & Corner (Opta)',
            'icon': '📐',
            'starter_val': st_corner_str,
            'benched_val': be_corner_str,
            'advantage': 'starter' if (st_corner and not be_corner) else ('benched' if (be_corner and not st_corner) else 'neutral'),
            'detail': "Gli specialisti dei calci piazzati godono di una percentuale superiore di assist attesi (+0.20 FV)." if st_corner else "Nessuna discrepanza determinante sui calci da fermo."
        })

        # 6. Rischio Disciplinare & Impegni Coppe
        st_turnover = starter_metrics.get('turnover_risk', 'Basso')
        be_turnover = benched_metrics.get('turnover_risk', 'Basso')
        factors.append({
            'label': 'Fatica Coppe Europee & Disciplina',
            'icon': '⚖️',
            'starter_val': f"Turn-over: {st_turnover}",
            'benched_val': f"Turn-over: {be_turnover}",
            'advantage': 'starter' if (be_turnover != 'Basso' and st_turnover == 'Basso') else ('benched' if (st_turnover != 'Basso' and be_turnover == 'Basso') else 'neutral'),
            'detail': "Protezione dal rischio rotazioni o cartellini calcolata con i coefficienti AIA e UEFA."
        })

        # Discursive Narrative
        if role == 'P':
            summary_text = (
                f"L'AI consiglia {starter_name} (★ {starter_score}) rispetto a {benched_name} (★ {benched_score}) "
                f"con un margine calcolato di +{diff} punti. Il fattore determinante risiede nella solidità del reparto difensivo "
                f"e nel matchup: {starter_name} gode di una probabilità di Clean Sheet del {starter_intel.get('goalkeeper', {}).get('clean_sheet_prob', 35)}% "
                f"con appena {starter_intel.get('goalkeeper', {}).get('expected_goals_conceded', 1.0)} gol subiti attesi, "
                f"riducendo drasticamente il rischio di malus pesanti al fantacalcio rispetto a {benched_name}."
            )
        elif role == 'D':
            summary_text = (
                f"Nel ballottaggio difensivo, l'algoritmo accorda la preferenza a {starter_name} (★ {starter_score}) su {benched_name} (★ {benched_score}) "
                f"con uno scarto di +{diff} punti. {starter_name} garantisce una continuità di rendimento superiore "
                f"(media voto pura stimata di {starter_metrics.get('pure_base_grade', 6.20)}), massimizzando le chance di ottenere il bonus "
                f"del modificatore di difesa e offrendo maggiore pericolosità sulle palle inattive."
            )
        elif role == 'C':
            summary_text = (
                f"Scelta ponderata a centrocampo: {starter_name} (★ {starter_score}) è favorito su {benched_name} (★ {benched_score}) "
                f"con +{diff} punti di vantaggio. Le statistiche avanzate (SofaScore / Understat) indicano una frequenza più alta di inserimenti, "
                f"passaggi chiave ({starter_metrics.get('key_passes_per_game', 1.2)}/g) e conclusioni a rete, rendendo il potenziale di bonus (+3/+1) "
                f"statisticamente più probabile rispetto alla riserva."
            )
        else: # 'A'
            summary_text = (
                f"Duello caldissimo in attacco: l'AI preferisce schierare {starter_name} (★ {starter_score}) lasciando in panchina {benched_name} (★ {benched_score}) "
                f"(+{diff} punti). Oltre alla titolarità dal 1° minuto ({starter_tit}%), {starter_name} vanta un indice di pericolosità offensiva superiore "
                f"e un matchup più favorevole, mentre {benched_name} sconta una gestione del minutaggio più frazionata o una trasferta più complessa."
            )

        return {
            'role_label': role_label,
            'headline': f"Perché l'AI sceglie {starter_name} (+{diff} pt) rispetto a {benched_name}",
            'summary': summary_text,
            'advantage_pts': diff,
            'factors': factors
        }

    def compare_any_two_players(self, player_a_name: str, player_b_name: str, user_players: List[Dict], matchday: Optional[int] = None) -> Dict:
        """
        Interactively compares ANY two players from the user squad or database.
        Returns a rich Head-to-Head decision analysis with winner, score delta,
        detailed comparative factors and AI reasoning.
        """
        fixtures_data = self.get_fixtures_for_matchday(matchday)
        target_md = fixtures_data.get('matchday', matchday or 7)
        fixtures_list = fixtures_data.get('fixtures', [])

        def find_p(name_query: str) -> Optional[Dict]:
            if not name_query:
                return None
            norm = self._normalize_name(name_query)
            for p in user_players:
                p_n = self._normalize_name(p.get('name', ''))
                if p_n == norm or norm in p_n or p_n in norm:
                    return p
            if norm in self.players_lookup:
                return self.players_lookup[norm]
            for p in self.players_db:
                p_n = self._normalize_name(p.get('name', ''))
                if norm in p_n or p_n in norm:
                    return p
            return None

        p_a_raw = find_p(player_a_name)
        p_b_raw = find_p(player_b_name)

        if not p_a_raw or not p_b_raw:
            return {
                'success': False,
                'error': f"Impossibile trovare uno o entrambi i calciatori selezionati: '{player_a_name}', '{player_b_name}'"
            }

        eval_a = self.evaluate_player(p_a_raw, fixtures_list=fixtures_list, matchday=target_md)
        eval_b = self.evaluate_player(p_b_raw, fixtures_list=fixtures_list, matchday=target_md)

        score_a = round(eval_a.get('score', 0.0), 1)
        score_b = round(eval_b.get('score', 0.0), 1)
        fv_a = round(eval_a.get('expected_fantavoto', 6.0), 2)
        fv_b = round(eval_b.get('expected_fantavoto', 6.0), 2)

        if score_a >= score_b:
            favored_eval = eval_a
            underdog_eval = eval_b
            winner_key = 'player_a'
            diff_score = round(score_a - score_b, 1)
            diff_fv = round(fv_a - fv_b, 2)
        else:
            favored_eval = eval_b
            underdog_eval = eval_a
            winner_key = 'player_b'
            diff_score = round(score_b - score_a, 1)
            diff_fv = round(fv_b - fv_a, 2)

        shared_role = eval_a.get('role', 'C') if eval_a.get('role') == eval_b.get('role') else 'MIXED'
        comp_role = shared_role if shared_role != 'MIXED' else (favored_eval.get('role') or 'A')
        base_comp = self._generate_ballottaggio_comparison(favored_eval, underdog_eval, role=comp_role)

        fav_name = favored_eval.get('name', '')
        und_name = underdog_eval.get('name', '')

        if shared_role == 'MIXED':
            headline = f"🏆 Verdetto AI: Consigliato {fav_name} (Ruolo {favored_eval.get('role')}) rispetto a {und_name} (Ruolo {underdog_eval.get('role')})"
            ai_narrative = (
                f"Nel testa a testa inter-ruolo per la {target_md}ª Giornata, l'AI consiglia di schierare {fav_name} (★ {favored_eval.get('score')}) "
                f"rispetto a {und_name} (★ {underdog_eval.get('score')}) con un margine di +{diff_score} punti di indice schierabilità e una proiezione "
                f"di {favored_eval.get('expected_fantavoto')} vs {underdog_eval.get('expected_fantavoto')} fantapunti attesi. "
                f"La preferenza è motivata da un matchup favorevole ({'in casa 🏠' if favored_eval.get('is_home') else 'trasferta ✈️'} vs {favored_eval.get('opponent_name')}) "
                f"e da una probabilità di titolarità del {favored_eval.get('titolarita_pct')}%, che garantisce sicurezza di voto e opportunità di bonus."
            )
        else:
            headline = f"🏆 Verdetto AI: Consigliato {fav_name} (+{diff_score} pt su {und_name})"
            ai_narrative = base_comp.get('summary', '')

        return {
            'success': True,
            'matchday': target_md,
            'matchday_label': f"{target_md}ª Giornata",
            'winner': winner_key,
            'winner_name': fav_name,
            'loser_name': und_name,
            'diff_score': diff_score,
            'diff_fantavoto': diff_fv,
            'headline': headline,
            'ai_narrative': ai_narrative,
            'player_a': eval_a,
            'player_b': eval_b,
            'factors': base_comp.get('factors', [])
        }

    def optimize_lineup(self, user_players: List[Dict], preferred_formation: str = None, use_defense_modifier: bool = True, matchday: Optional[int] = None) -> Dict:
        """
        Optimizes lineup, calculates real expected fantapunti, tests all formations,
        and applies the user's defense modifier rules:
        - 6.00 to 6.49: +1 pt
        - 6.50 to 6.99: +3 pt
        - >= 7.00: +6 pt

        When preferred_formation is 'auto' or None, evaluates modules to find the absolute
        maximum expected points (comparing with vs without modifier impact).
        Supports matchday selection (e.g. 6=passata, 7=attuale/prossima).
        """
        fixtures_data = self.get_fixtures_for_matchday(matchday)
        fixtures_list = fixtures_data.get('fixtures', [])
        target_md = fixtures_data.get('matchday', matchday or 7)
        evaluated_players = [self.evaluate_player(p, fixtures_list=fixtures_list, matchday=target_md) for p in user_players]
        
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

        # Ballottaggi key choices: Portiere (P), Difensori (D), Centrocampisti (C), Attaccanti (A)
        key_decisions = []
        for r_name in ['P', 'D', 'C', 'A']:
            r_starters = [p for p in best_starters if p['role'] == r_name]
            r_bench = [p for p in bench if p['role'] == r_name]
            if r_starters and r_bench:
                lowest_starter = min(r_starters, key=lambda x: x['score'])
                highest_bench = max(r_bench, key=lambda x: x['score'])
                diff = abs(lowest_starter['score'] - highest_bench['score'])

                # For goalkeepers, always include if user has a bench goalkeeper!
                # For field players, include if diff is reasonable (<= 15.0)
                if r_name == 'P' or diff <= 15.0:
                    comp_data = self._generate_ballottaggio_comparison(lowest_starter, highest_bench, r_name)
                    key_decisions.append({
                        'role': r_name,
                        'role_label': comp_data['role_label'],
                        'starter': lowest_starter['name'],
                        'starter_score': lowest_starter['score'],
                        'starter_player': lowest_starter,
                        'benched': highest_bench['name'],
                        'benched_score': highest_bench['score'],
                        'benched_player': highest_bench,
                        'diff': round(diff, 1),
                        'note': f"Ballottaggio {comp_data['role_label']}: {lowest_starter['name']} (★ {lowest_starter['score']}) vs {highest_bench['name']} (★ {highest_bench['score']}). Vantaggio: +{round(diff, 1)} pt a favore di {lowest_starter['name']}.",
                        'comparison': comp_data
                    })

        return {
            'recommended_formation': best_module,
            'matchday': fixtures_data.get('matchday', 7),
            'matchday_label': fixtures_data.get('matchday_label', '7ª Giornata (Attuale / In Arrivo)'),
            'is_past_matchday': fixtures_data.get('is_past', False),
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

optimizer = LineupOptimizer()

if __name__ == '__main__':
    print("Optimizer with Super-Intelligence ready.")
