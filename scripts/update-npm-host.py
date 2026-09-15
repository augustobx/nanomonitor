import sqlite3
import shutil
import os
import subprocess

db_path = "/opt/infrastructure/nginx-proxy-manager/data/database.sqlite"
conf_path = "/opt/infrastructure/nginx-proxy-manager/data/nginx/proxy_host/5.conf"
backup_path = "/opt/infrastructure/nginx-proxy-manager/data/nginx/proxy_host/5.conf.glances.bak"

# 1. Backup existing conf
if os.path.exists(conf_path) and not os.path.exists(backup_path):
    shutil.copyfile(conf_path, backup_path)
    print(f"Backed up {conf_path} to {backup_path}")

# 2. Update SQLite
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute(
    "UPDATE proxy_host SET forward_host = ?, forward_port = ?, access_list_id = ? WHERE id = ?",
    ("nanomonitor-server", 4000, 0, 5)
)
conn.commit()
print("Updated SQLite record:", cursor.execute("SELECT id, forward_host, forward_port, access_list_id FROM proxy_host WHERE id = 5").fetchall())
conn.close()

# 3. Write new Nginx configuration
nginx_conf = """# ------------------------------------------------------------
# monitor.nanolabs.com.ar
# ------------------------------------------------------------

map $scheme $hsts_header {
    https   "max-age=63072000; preload";
}

server {
  set $forward_scheme http;
  set $server         "nanomonitor-server";
  set $port           4000;

  listen 80;
  listen [::]:80;

  listen 443 ssl;
  listen [::]:443 ssl;

  server_name monitor.nanolabs.com.ar;

  http2 on;

  # Let's Encrypt SSL
  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-cache.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-5/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-5/privkey.pem;

  # Block Exploits
  include conf.d/include/block-exploits.conf;

  # Force SSL
  set $trust_forwarded_proto "F";
  include conf.d/include/force-ssl.conf;

  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;
  proxy_http_version 1.1;

  access_log /data/logs/proxy-host-5_access.log proxy;
  error_log /data/logs/proxy-host-5_error.log warn;

  location / {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_http_version 1.1;

    # Proxy!
    include conf.d/include/proxy.conf;
  }

  # Custom
  include /data/nginx/custom/server_proxy[.]conf;
}
"""

with open(conf_path, "w") as f:
    f.write(nginx_conf)

print(f"Written new configuration to {conf_path}")

# 4. Test Nginx configuration
res = subprocess.run(["docker", "exec", "nginx-proxy-manager", "nginx", "-t"], capture_output=True, text=True)
print("nginx -t output:")
print(res.stdout)
print(res.stderr)

if res.returncode == 0:
    reload_res = subprocess.run(["docker", "exec", "nginx-proxy-manager", "nginx", "-s", "reload"], capture_output=True, text=True)
    print("nginx -s reload output:", reload_res.stdout, reload_res.stderr)
    print("✅ Nginx successfully reloaded!")
else:
    print("❌ Nginx test failed! Restoring backup...")
    shutil.copyfile(backup_path, conf_path)
