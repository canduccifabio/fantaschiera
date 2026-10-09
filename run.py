import os
import sys
import socket

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import uvicorn
from backend.scraper import sync_all_data, PLAYERS_FILE

def get_local_ip():
    """Detects primary local IP address to access from iPhone on same Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def main():
    print("=" * 65)
    print("   [+] FANTASCHIERA AI - PIATTAFORMA SMART FANTACALCIO")
    print("=" * 65)
    
    # Check if data cache exists, else sync
    if not os.path.exists(PLAYERS_FILE):
        print("[Avvio] Cache giocatori mancante, avvio sincronizzazione iniziale...")
        sync_all_data()

    local_ip = get_local_ip()
    port = 8000
    
    # Start Cloudflare public tunnel if available
    from backend.tunnel import tunnel_instance
    public_url = tunnel_instance.start()
    
    print("\n[OK] Piattaforma avviata con successo!")
    print(f"👉 Accesso da Computer:          http://localhost:{port}")
    print(f"📱 Accesso Wi-Fi (stessa rete):  http://{local_ip}:{port}")
    if public_url:
        print(f"🌍 ACCESSO DA FUORI RETE (4G/5G): {public_url}")
    print("\n[i] ISTRUZIONI PER IPHONE:")
    print("   • Se sei a casa sulla stessa Wi-Fi: apri http://" + f"{local_ip}:{port}")
    if public_url:
        print(f"   • Se sei fuori casa / con connessione dati 4G/5G: apri {public_url}")
    print("   • Su Safari tocca 'Condividi' (quadrato con freccia) e 'Aggiungi a Schermata Home'")
    print("   • Avrai l'app a schermo intero con notifiche e countdown attivo ovunque!\n")
    print("=" * 65)
    
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=False, log_level="info")

if __name__ == "__main__":
    main()
