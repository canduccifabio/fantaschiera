import os
import re
import sys
import time
import subprocess
import threading
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFLARED_EXE = os.path.join(BASE_DIR, 'cloudflared.exe')
DATA_DIR = os.path.join(BASE_DIR, 'data')
TUNNEL_FILE = os.path.join(DATA_DIR, 'tunnel_info.json')

class CloudflareTunnel:
    def __init__(self, local_port=8000):
        self.local_port = local_port
        self.public_url = None
        self.process = None

    def start(self):
        if not os.path.exists(CLOUDFLARED_EXE):
            print("[Tunnel] cloudflared.exe non trovato, tunnel pubblico non avviato.")
            return None

        # Check if already running or file has active url
        if os.path.exists(TUNNEL_FILE):
            try:
                with open(TUNNEL_FILE, 'r') as f:
                    data = json.load(f)
                    if data.get('url'):
                        self.public_url = data['url']
            except Exception:
                pass

        cmd = [CLOUDFLARED_EXE, 'tunnel', '--url', f'http://localhost:{self.local_port}']
        print(f"[Tunnel] Avvio tunnel Cloudflare per la porta {self.local_port}...")
        
        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            # Start background reader for stderr (cloudflared prints to stderr)
            t = threading.Thread(target=self._read_output, daemon=True)
            t.start()
            
            # Wait up to 10 seconds for URL
            start_t = time.time()
            while not self.public_url and time.time() - start_t < 10:
                time.sleep(0.5)

            if self.public_url:
                print(f"[Tunnel] Link pubblico attivo: {self.public_url}")
            return self.public_url
        except Exception as e:
            print(f"[Tunnel] Errore avvio tunnel: {e}")
            return None

    def _read_output(self):
        for line in self.process.stderr:
            match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', line)
            if match:
                self.public_url = match.group(1)
                os.makedirs(DATA_DIR, exist_ok=True)
                with open(TUNNEL_FILE, 'w') as f:
                    json.dump({'url': self.public_url, 'started_at': time.time()}, f)
                break

    def get_url(self):
        if self.public_url:
            return self.public_url
        if os.path.exists(TUNNEL_FILE):
            try:
                with open(TUNNEL_FILE, 'r') as f:
                    return json.load(f).get('url')
            except Exception:
                pass
        return None

tunnel_instance = CloudflareTunnel()
