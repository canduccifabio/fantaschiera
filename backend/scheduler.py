import os
import json
import urllib.request
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from backend.database import get_settings

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
FIXTURES_FILE = os.path.join(DATA_DIR, 'fixtures_cache.json')

class AlertManager:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.last_alert_sent = False
        
    def start(self):
        if not self.scheduler.running:
            self.scheduler.add_job(self.check_alert_status, 'interval', minutes=2, id='check_alert_job')
            self.scheduler.start()
            print("[AlertManager] Background scheduler started.")

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
        now = datetime.now()
        
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
            message = f"Prossimo anticipo: {kickoff_dt.strftime('%d/%m/%Y alle %H:%M')}. Riceverai l'alert 1 ora prima (alle {alert_dt.strftime('%H:%M')})."

        return {
            'has_fixture': True,
            'status': status,
            'kickoff_time': kickoff_dt.strftime('%A %d %B, %H:%M'),
            'kickoff_iso': kickoff_dt.isoformat(),
            'alert_time': alert_dt.strftime('%d/%m/%Y alle %H:%M'),
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
