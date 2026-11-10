import os
import sys
import socket
import threading
import uvicorn

def proxy_connection(client_sock, target_port):
    try:
        remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        remote_sock.connect(('127.0.0.1', target_port))
    except Exception:
        try:
            client_sock.close()
        except Exception:
            pass
        return

    def pipe(src, dst):
        try:
            while True:
                data = src.recv(4096)
                if not data:
                    break
                dst.sendall(data)
        except Exception:
            pass
        finally:
            try:
                src.close()
            except Exception:
                pass
            try:
                dst.close()
            except Exception:
                pass

    threading.Thread(target=pipe, args=(client_sock, remote_sock), daemon=True).start()
    threading.Thread(target=pipe, args=(remote_sock, client_sock), daemon=True).start()

def start_port_forwarder(from_port, to_port):
    def run_forwarder():
        try:
            server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(('0.0.0.0', from_port))
            server.listen(50)
            print(f"[Bridge] Port forwarder active: 0.0.0.0:{from_port} -> 127.0.0.1:{to_port}")
            while True:
                client, _ = server.accept()
                proxy_connection(client, to_port)
        except Exception as e:
            print(f"[Bridge] Forwarder on {from_port} note: {e}")

    t = threading.Thread(target=run_forwarder, daemon=True)
    t.start()

if __name__ == "__main__":
    port_env = os.getenv("PORT")
    main_port = int(port_env) if port_env and port_env.isdigit() else 10000

    # Ensure both port 8000 and port 10000 always answer, eliminating any port mismatch on Render
    if main_port != 8000:
        start_port_forwarder(8000, main_port)
    if main_port != 10000:
        start_port_forwarder(10000, main_port)

    print(f"[Start] Starting FantaSchiera AI on port {main_port} (dual-bind 8000 & 10000 enabled)...")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=main_port, log_level="info")
