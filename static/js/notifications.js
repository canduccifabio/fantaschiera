/**
 * FantaSchiera AI - Notification & Countdown Manager
 */

class AlertController {
  constructor() {
    this.alertData = null;
    this.timerInterval = null;
    this.audioCtx = null;
    this.audioUnlocked = false;
    this.hasNotifiedInApp = false;
  }

  init() {
    this.fetchAlertInfo();
    // Poll alert status every 60s
    setInterval(() => this.fetchAlertInfo(), 60000);
    // Realtime seconds countdown
    this.startCountdownLoop();
    
    // Unlock Web Audio on first user touch / click (vital for iOS Safari)
    ['click', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, () => this.unlockAudio(), { once: true });
    });
  }

  unlockAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.audioUnlocked = true;
  }

  playChime() {
    try {
      this.unlockAudio();
      if (!this.audioCtx) return;
      
      const now = this.audioCtx.currentTime;
      // High-pitch referee whistle / bell chime
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15); // A6
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.4); // E6
      
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.85);
    } catch (e) {
      console.warn("Audio playback error:", e);
    }
  }

  async fetchAlertInfo() {
    try {
      const res = await fetch('/api/alert-info');
      if (res.ok) {
        this.alertData = await res.json();
        this.updateAlertUI();
      }
    } catch (e) {
      console.warn("Could not fetch alert info:", e);
    }
  }

  updateAlertUI() {
    if (!this.alertData) return;
    
    const banner = document.getElementById('alertBanner');
    const bannerText = document.getElementById('alertBannerText');
    const bannerBadge = document.getElementById('alertBannerBadge');
    
    if (!banner || !bannerText) return;

    if (this.alertData.alert_active) {
      banner.style.display = 'flex';
      banner.style.background = 'linear-gradient(90deg, rgba(220, 38, 38, 0.4), rgba(245, 158, 11, 0.4))';
      bannerBadge.innerText = '🚨 SCADENZA';
      bannerBadge.className = 'alert-badge-live';
      bannerText.innerHTML = `<strong>ALERT FORMAZIONI:</strong> Manca meno di 1 ora al primo match! Schiera subito la rosa!`;
      
      if (!this.hasNotifiedInApp) {
        this.hasNotifiedInApp = true;
        this.playChime();
        this.triggerSystemNotification(
          "🚨 FANTACALCIO: Schiera la formazione!",
          "Manca solo 1 ora alla prima partita della giornata di Serie A!"
        );
      }
    } else if (this.alertData.status === 'UPCOMING') {
      banner.style.display = 'flex';
      bannerBadge.innerText = '🔔 PROSSIMO TURNO';
      bannerBadge.className = 'alert-badge-live';
      bannerBadge.style.background = '#2563eb';
      bannerText.innerHTML = `Primo anticipo: <strong>${this.alertData.kickoff_time || 'Sabato'}</strong> (Alert 1h prima attivo: ${this.alertData.alert_time})`;
    } else {
      banner.style.display = 'none';
    }

    // Update settings tab elements if open
    const alertTimeEl = document.getElementById('settingAlertTime');
    if (alertTimeEl && this.alertData.alert_time) {
      alertTimeEl.innerText = this.alertData.alert_time;
    }
    const kickoffTimeEl = document.getElementById('settingKickoffTime');
    if (kickoffTimeEl && this.alertData.kickoff_time) {
      kickoffTimeEl.innerText = this.alertData.kickoff_time;
    }
  }

  startCountdownLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      if (!this.alertData || !this.alertData.kickoff_iso) return;
      
      const kickoff = new Date(this.alertData.kickoff_iso).getTime();
      const alertTime = new Date(this.alertData.alert_iso).getTime();
      const now = Date.now();
      
      const diffAlert = alertTime - now;
      const diffKickoff = kickoff - now;
      
      const timerEl = document.getElementById('liveCountdownDisplay');
      if (timerEl) {
        if (diffKickoff <= 0) {
          timerEl.innerText = "Partite in corso";
        } else if (diffAlert <= 0) {
          const mins = Math.max(0, Math.floor(diffKickoff / 60000));
          const secs = Math.floor((diffKickoff % 60000) / 1000);
          timerEl.innerHTML = `<span style="color:#ef4444; font-weight:800;">🚨 ${mins}m ${secs}s al fischio d'inizio!</span>`;
        } else {
          const days = Math.floor(diffAlert / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diffAlert % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diffAlert % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diffAlert % (1000 * 60)) / 1000);
          timerEl.innerText = `${days}g ${hours}h ${mins}m ${secs}s all'alert`;
        }
      }
    }, 1000);
  }

  async requestPermission() {
    if (!("Notification" in window)) {
      alert("Il tuo browser non supporta le notifiche di sistema. Su iPhone, aggiungi la pagina alla schermata Home per abilitarle!");
      return false;
    }
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.playChime();
        new Notification("✅ Notifiche FantaSchiera Attive!", {
          body: "Riceverai un alert automatico esattamente 1 ora prima della prima partita di Serie A.",
          icon: "/static/icon.svg"
        });
        return true;
      }
    } catch (e) {
      console.warn("Notification permission error:", e);
    }
    return false;
  }

  triggerSystemNotification(title, body) {
    if ("Notification" in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: "/static/icon.svg",
          vibrate: [200, 100, 200]
        });
      } catch (e) {
        console.warn("Could not dispatch system notification:", e);
      }
    }
  }
}

window.alertController = new AlertController();
document.addEventListener('DOMContentLoaded', () => {
  window.alertController.init();
});
