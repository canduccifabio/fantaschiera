import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.scraper import sync_all_data, PLAYERS_FILE, FIXTURES_FILE, INJURIES_FILE
from backend.optimizer import LineupOptimizer
from backend.scheduler import AlertManager
from backend.database import (
    get_user_squad, save_user_squad, load_all_players_catalog,
    get_settings, save_settings, parse_text_and_match_players,
    DEFAULT_SAMPLE_SQUAD
)

app = FastAPI(title="FantaSchiera AI", description="Piattaforma intelligente per schierare la formazione del Fantacalcio")

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Initialize engines
optimizer = LineupOptimizer()
alert_manager = AlertManager()
alert_manager.start()

# --- Pydantic Request Models ---
class PlayerModel(BaseModel):
    name: str
    role: str
    team: str
    qa: Optional[int] = 10
    fvm: Optional[int] = 50
    photo: Optional[str] = ""
    is_penalty_taker: Optional[bool] = False

class SquadUpdateRequest(BaseModel):
    players: List[Dict[str, Any]]

class ImportTextRequest(BaseModel):
    text: str

class SettingsUpdateRequest(BaseModel):
    defense_modifier: Optional[bool] = None
    preferred_formation: Optional[str] = None
    webhook_url: Optional[str] = None

# --- UI Route ---
@app.api_route("/", methods=["GET", "HEAD"])
async def home_page():
    return FileResponse(os.path.join(TEMPLATES_DIR, "index.html"))

# --- Squad APIs ---
@app.get("/api/squad")
async def get_squad():
    players = get_user_squad()
    counts = {'P': 0, 'D': 0, 'C': 0, 'A': 0}
    for p in players:
        role = p.get('role', 'C').upper()
        if role in counts:
            counts[role] += 1
    return {
        'total': len(players),
        'counts': counts,
        'players': players
    }

@app.post("/api/squad")
async def update_squad(req: SquadUpdateRequest):
    success = save_user_squad(req.players)
    optimizer.reload_data()
    return {"success": success, "count": len(req.players)}

@app.post("/api/squad/add")
async def add_player_to_squad(player: Dict[str, Any]):
    current_squad = get_user_squad()
    # Check if already present
    p_name = player.get('name', '').lower()
    for existing in current_squad:
        if existing.get('name', '').lower() == p_name:
            return {"success": False, "message": "Calciatore già presente nella rosa!"}
            
    current_squad.append(player)
    save_user_squad(current_squad)
    return {"success": True, "players_count": len(current_squad)}

@app.post("/api/squad/remove")
async def remove_player_from_squad(payload: Dict[str, str]):
    player_name = payload.get('name', '').lower()
    current_squad = get_user_squad()
    updated = [p for p in current_squad if p.get('name', '').lower() != player_name]
    save_user_squad(updated)
    return {"success": True, "players_count": len(updated)}

@app.post("/api/squad/reset")
async def reset_squad():
    save_user_squad(DEFAULT_SAMPLE_SQUAD)
    return {"success": True, "message": "Rosa reimpostata con successo!", "players_count": len(DEFAULT_SAMPLE_SQUAD)}

@app.post("/api/squad/import-text")
async def import_squad_text(req: ImportTextRequest):
    matched = parse_text_and_match_players(req.text)
    if not matched:
        return {"success": False, "message": "Nessun giocatore riconosciuto nel testo incollato. Prova a scrivere i nomi chiaramente separati da virgole o a capo."}
    
    current_squad = get_user_squad()
    existing_names = {p.get('name', '').lower() for p in current_squad}
    added_count = 0
    for m in matched:
        if m.get('name', '').lower() not in existing_names:
            current_squad.append(m)
            existing_names.add(m.get('name', '').lower())
            added_count += 1
            
    save_user_squad(current_squad)
    return {
        "success": True,
        "added_count": added_count,
        "matched_count": len(matched),
        "total_players": len(current_squad)
    }

# Popular nicknames and aliases for common Fantacalcio player searches
PLAYER_ALIASES = {
    'lautaro': 'martinez l.',
    'kvara': 'kvaratskhelia',
    'calha': 'calhanoglu',
    'chalanoglu': 'calhanoglu',
    'theo': 'hernandez',
    'mike': 'maignan',
    'gigio': 'donnarumma',
    'nico': 'paz n.',
    'chico': 'conceicao',
    'leao': 'leao'
}

# --- Player Search & Catalog ---
@app.get("/api/players/search")
async def search_players(query: str = "", role: str = "", team: str = "", limit: int = 30):
    catalog = load_all_players_catalog()
    query = query.lower().strip()
    role = role.upper().strip()
    team = team.upper().strip()
    
    alias_target = PLAYER_ALIASES.get(query, '')
    
    results = []
    for p in catalog:
        if role and p.get('role', '') != role:
            continue
        if team and p.get('team', '') != team:
            continue
        p_name = p.get('name', '').lower()
        p_team = p.get('team', '').lower()
        if query:
            matches_direct = query in p_name or query in p_team
            matches_alias = alias_target and (alias_target in p_name)
            if not (matches_direct or matches_alias):
                continue
        results.append(p)
        if len(results) >= limit:
            break
            
    return {"results": results, "total": len(results)}

# --- Lineup Recommendation API ---
@app.get("/api/lineup/recommendation")
async def get_lineup_recommendation(formation: Optional[str] = None, use_modifier: Optional[bool] = None):
    user_players = get_user_squad()
    settings = get_settings()
    
    if formation == 'auto' or not formation:
        formation = None
    if use_modifier is None:
        use_modifier = settings.get('defense_modifier', True)
        
    lineup_res = optimizer.optimize_lineup(
        user_players=user_players,
        preferred_formation=formation,
        use_defense_modifier=use_modifier
    )
    return lineup_res

# --- Fixtures, Injuries & Intel ---
@app.get("/api/fixtures")
async def get_fixtures():
    from datetime import datetime, timedelta
    data = optimizer._load_json(FIXTURES_FILE, {'fixtures': []})
    now = datetime.now()
    for f in data.get('fixtures', []):
        kickoff_dt = None
        if f.get('datetime_iso'):
            try:
                kickoff_dt = datetime.fromisoformat(f['datetime_iso'])
            except Exception:
                pass
        
        # If match is within 60 min of kickoff or already started
        if kickoff_dt and now >= kickoff_dt - timedelta(minutes=60):
            f['is_official_lineup'] = True
            pcts = f.setdefault('player_percentages', {})
            lineups = (f.get('home_lineup') or []) + (f.get('away_lineup') or [])
            for p_name in lineups:
                p_norm = p_name.lower()
                if p_norm in pcts:
                    pcts[p_norm]['percentage'] = 100
                    pcts[p_norm]['is_starter'] = True
                    pcts[p_norm]['is_official'] = True
                else:
                    pcts[p_norm] = {
                        'name': p_name,
                        'percentage': 100,
                        'role': 'C',
                        'is_starter': True,
                        'is_official': True
                    }
    return data

@app.get("/api/injuries")
async def get_injuries():
    data = optimizer._load_json(INJURIES_FILE, {})
    return {"injuries": list(data.values()), "count": len(data)}

# --- Alert & Countdown API ---
@app.get("/api/alert-info")
async def get_alert_info():
    return alert_manager.get_alert_info()

# --- Sync Data ---
@app.post("/api/sync")
async def trigger_sync():
    res = sync_all_data()
    optimizer.reload_data()
    return {"success": True, "result": res}

# --- SOS Fanta Intelligence API ---
from backend.sosfanta_analyzer import sosfanta_analyzer

class SOSFantaUrlRequest(BaseModel):
    url: str

@app.get("/api/sosfanta/analysis")
async def get_sosfanta_analysis():
    user_players = get_user_squad()
    analysis = sosfanta_analyzer.analyze_entire_squad(user_players)
    return {
        "success": True,
        "preview_url": sosfanta_analyzer.preview_url,
        "matchday": sosfanta_analyzer.get_matchday_label(),
        "results": analysis
    }

@app.get("/api/sosfanta/full-article")
def get_sosfanta_full_article():
    user_players = get_user_squad()
    data = sosfanta_analyzer.get_full_article_data(user_players)
    return {
        "success": True,
        **data
    }

@app.post("/api/sosfanta/auto-discover")
async def auto_discover_sosfanta():
    res = sosfanta_analyzer.check_and_update_latest_preview(force=True)
    optimizer.reload_data()
    return {"success": True, **res}

@app.post("/api/sosfanta/update-url")
async def update_sosfanta_url(req: SOSFantaUrlRequest):
    sosfanta_analyzer.preview_url = req.url.rstrip('/') + '/'
    sosfanta_analyzer.scrape_all_slides()
    optimizer.reload_data()
    return {
        "success": True,
        "preview_url": sosfanta_analyzer.preview_url,
        "matchday": sosfanta_analyzer.get_matchday_label()
    }

# --- Live & Matchday Ratings API ---
from backend.live_tracker import live_tracker

@app.get("/api/live/votes")
async def get_live_votes():
    user_players = get_user_squad()
    settings = get_settings()
    use_modifier = settings.get('defense_modifier', True)
    pref_formation = settings.get('preferred_formation', None)
    
    lineup_res = optimizer.optimize_lineup(
        user_players=user_players,
        preferred_formation=pref_formation,
        use_defense_modifier=use_modifier
    )
    starters = lineup_res.get('starters', [])
    data = live_tracker.get_live_data(user_players=user_players, starters=starters)
    return data

@app.post("/api/live/refresh")
async def refresh_live_votes():
    user_players = get_user_squad()
    settings = get_settings()
    lineup_res = optimizer.optimize_lineup(user_players=user_players, use_defense_modifier=settings.get('defense_modifier', True))
    data = live_tracker.get_live_data(user_players=user_players, starters=lineup_res.get('starters', []))
    return {"success": True, "data": data}

# --- AI Self-Learning & Auto-Improvement API ---
from backend.ai_learning import ai_learning_engine

@app.get("/api/ai/learning-status")
async def get_ai_learning_status():
    return {
        "success": True,
        "status": ai_learning_engine.get_status()
    }

@app.post("/api/ai/trigger-learning")
async def trigger_ai_learning():
    user_players = get_user_squad()
    settings = get_settings()
    lineup_res = optimizer.optimize_lineup(user_players=user_players, use_defense_modifier=settings.get('defense_modifier', True))
    live_data = live_tracker.get_live_data(user_players=user_players, starters=lineup_res.get('starters', []))
    
    recalibration_result = ai_learning_engine.run_recalibration(live_data.get('players', []))
    optimizer.reload_data()
    return recalibration_result

# --- Tunnel Info ---
from backend.tunnel import tunnel_instance

@app.get("/api/tunnel-info")
async def get_tunnel_info():
    url = tunnel_instance.get_url()
    return {
        "active": url is not None,
        "public_url": url or ""
    }

# --- Settings ---
@app.get("/api/settings")
async def read_settings():
    return get_settings()

@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    save_settings(update_data)
    return {"success": True, "settings": get_settings()}
