import os
import json
import urllib.request
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from backend.database import get_settings
from backend.scraper import get_rome_now

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
FIXTURES_FILE = os.path.join(DATA_DIR, 'fixtures_cache.json')

WEEKDAYS_IT = {
    0: "Venerdì",  # Python Monday is 0, but let's make standard mapping:
}
# Python datetime.weekday(): 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
WEEKDAYS_IT = {
    0: "Lunedì", 1: "Martedì", 2: "Mercoledì", 3: "Giovedì",
    4: "Venerdì", 5: "Sabato", 6: "Domenica"
}

MONTHS_IT = {
    1: "Gennaio", 2: "Febbraio", 3: "Marzo", 4: "Aprile",
    5: "Maggio", 6: "Giugno", 7: "Luglio", 8: "Agosto",
    9: "Settembre", 10: "Ottobre", 11: "Novembre", 12: "Dicembre"
}

class AlertManager:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.last_alert_sent = False
        
    def start(self):
        if not self.scheduler.running:
            now = datetime.now()
            self.scheduler.add_job(self.check_alert_status, 'interval', minutes=2, id='check_alert_job', next_run_time=now)
            self.scheduler.add_job(self.check_sosfanta_update, 'interval', minutes=30, id='check_sosfanta_job', next_run_time=now)
            self.scheduler.add_job(self.check_fixtures_update, 'interval', minutes=60, id='check_fixtures_job', next_run_time=now)
            self.scheduler.add_job(self.check_ai_auto_learning, 'interval', minutes=15, id='check_ai_learning_job')
            self.scheduler.start()
            print("[AlertManager] Background scheduler started with SOS Fanta auto-sync, fixtures updates and AI auto-learning.")

    def get_alert_info(self) -> dict:
        """Returns current alert timing and status."""
        data = {}
        if os.path.exists(FIXTURES_FILE):
            try:
                with open(FIXTURES_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                pass
                
        earliest_iso = data.get('earliest_kickoff_iso')
        alert_iso = data.get('alert_time_iso')
        now = get_rome_now()
        
        if not earliest_iso:
            return {
                'has_fixture': False,
                'message': "Nessuna partita programmata o dati in caricamento",
                'seconds_to_alert': 0,
                'alert_active': False
            }
            
        try:
            kickoff_dt = datetime.fromisoformat(earliest_iso)
            alert_dt = datetime.fromisoformat(alert_iso)
        except Exception:
            kickoff_dt = now + timedelta(days=1)
            alert_dt = kickoff_dt - timedelta(hours=1)
            
        diff_alert = (alert_dt - now).total_seconds()
        diff_kickoff = (kickoff_dt - now).total_seconds()
        
        # State:
        # - diff_alert > 0: In attesa dell'alert (countdown attivo)
        # - diff_alert <= 0 and diff_kickoff > 0: ALERT ATTIVO! Manca meno di un'ora al fischio d'inizio!
        # - diff_kickoff <= 0: Partita già iniziata o turno in corso
        
        weekday_it = WEEKDAYS_IT.get(kickoff_dt.weekday(), kickoff_dt.strftime('%A'))
        month_it = MONTHS_IT.get(kickoff_dt.month, kickoff_dt.strftime('%B'))
        kickoff_formatted = f"{weekday_it} {kickoff_dt.day} {month_it}, {kickoff_dt.strftime('%H:%M')}"
        alert_formatted = f"{alert_dt.strftime('%d/%m/%Y alle %H:%M')}"

        if diff_kickoff <= 0:
            status = "IN_CORSO"
            message = "La giornata è già iniziata! Le partite sono in corso."
            alert_active = False
            countdown_text = "Turno in corso"
        elif diff_alert <= 0:
            status = "ALERT_NOW"
            mins_left = max(0, int(diff_kickoff // 60))
            message = f"🚨 ATTENZIONE! Manca solo 1 ora al primo anticipo! Ricordati di schierare la tua formazione!"
            alert_active = True
            countdown_text = f"Mancano {mins_left} minuti al fischio d'inizio!"
        else:
            status = "UPCOMING"
            alert_active = False
            days = int(diff_alert // 86400)
            hours = int((diff_alert % 86400) // 3600)
            mins = int((diff_alert % 3600) // 60)
            countdown_text = f"{days}g {hours}h {mins}m all'alert"
            message = f"Prossimo anticipo: {kickoff_formatted}. Riceverai l'alert 1 ora prima (alle {alert_dt.strftime('%H:%M')})."

        return {
            'has_fixture': True,
            'status': status,
            'kickoff_time': kickoff_formatted,
            'kickoff_iso': kickoff_dt.isoformat(),
            'alert_time': alert_formatted,
            'alert_iso': alert_dt.isoformat(),
            'seconds_to_alert': max(0, int(diff_alert)),
            'seconds_to_kickoff': max(0, int(diff_kickoff)),
            'countdown_text': countdown_text,
            'alert_active': alert_active,
            'message': message
        }

    def check_alert_status(self):
        """Called periodically by scheduler."""
        info = self.get_alert_info()
        if info.get('alert_active') and not self.last_alert_sent:
            print("[AlertManager] TRIGGERING 1-HOUR PRE-MATCH ALERT!")
            self.last_alert_sent = True
            settings = get_settings()
            webhook = settings.get('webhook_url')
            if webhook:
                try:
                    payload = json.dumps({"text": info['message']}).encode('utf-8')
                    req = urllib.request.Request(webhook, data=payload, headers={'Content-Type': 'application/json'})
                    urllib.request.urlopen(req, timeout=5)
                except Exception as e:
                    print(f"[AlertManager] Webhook delivery failed: {e}")
        elif not info.get('alert_active'):
            self.last_alert_sent = False

    def check_sosfanta_update(self):
        """Periodically checks if SOS Fanta published a new preview article and syncs it."""
        try:
            from backend.sosfanta_analyzer import sosfanta_analyzer
            res = sosfanta_analyzer.check_and_update_latest_preview()
            if res.get('updated'):
                print(f"[Scheduler] SOS Fanta updated automatically to: {res.get('matchday')}")
        except Exception as e:
            print(f"[Scheduler] Error checking SOS Fanta update: {e}")

    def check_fixtures_update(self):
        """Periodically syncs fixtures, matchday lineups and percentages from Fantacalcio.it."""
        try:
            from backend.scraper import scrape_fixtures_and_lineups
            scrape_fixtures_and_lineups()
            print("[Scheduler] Fixtures and lineups refreshed automatically.")
        except Exception as e:
            print(f"[Scheduler] Error syncing fixtures: {e}")

    def check_ai_auto_learning(self):
        """Autonomous AI auto-learning check."""
        try:
            from backend.ai_learning import ai_learning_engine
            ai_learning_engine.auto_calibrate_if_needed([])
        except Exception as e:
            print(f"[Scheduler] Error in AI auto-learning check: {e}")
