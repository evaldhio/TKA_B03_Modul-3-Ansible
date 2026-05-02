# TKA B03 Modul 3 — Ansible Automation

Proyek ini menggunakan **Ansible** untuk mengotomatisasi deployment aplikasi web berbasis Docker di dua node (simulasi VM menggunakan Docker container dengan SSH).

---

## Arsitektur

```
┌─────────────────────────────────────────────────────┐
│                  Ansible Controller                  │
│              (WSL / Local Machine)                   │
└───────────────┬─────────────────┬───────────────────┘
                │                 │
         SSH :2222         SSH :2223
                │                 │
     ┌──────────▼──┐       ┌──────▼──────────┐
     │    node1    │       │     node2        │
     │  (Backend)  │       │   (Frontend)     │
     │             │       │                  │
     │ ┌─────────┐ │       │ ┌──────────────┐ │
     │ │ Backend │ │       │ │   Frontend   │ │
     │ │ Node.js │ │       │ │  Nginx+HTML  │ │
     │ │  :5000  │ │       │ │    :8080     │ │
     │ └─────────┘ │       │ └──────────────┘ │
     │ ┌─────────┐ │       └──────────────────┘
     │ │Postgres │ │
     │ │  :5432  │ │
     │ └─────────┘ │
     └─────────────┘
```

---

## Struktur Project

```
TKA_B03_MODUL-3-ANSIBLE/
├── inventory.yml               # Daftar host (node1, node2)
├── playbook.yml                # Entry point utama Ansible
├── group_vars/
│   ├── all/
│   │   └── vault.yml           # Secret terenkripsi (Ansible Vault)
│   └── group_frontend.yml      # Variabel khusus group frontend
└── roles/
    ├── docker/                 # Role: install Docker di semua node
    │   └── tasks/
    │       └── main.yml
    ├── backend/                # Role: deploy backend + database
    │   ├── tasks/
    │   │   └── main.yml
    │   ├── templates/
    │   │   ├── .env.j2
    │   │   └── docker-compose.yml.j2
    │   ├── vars/
    │   │   ├── main.yml
    │   │   └── vault.yml
    │   └── files/
    │       └── backend/
    │           ├── server.js
    │           ├── package.json
    │           └── Dockerfile
    └── frontend/               # Role: deploy frontend
        ├── tasks/
        │   └── main.yml
        ├── templates/
        │   ├── config.js.j2
        │   └── docker-compose.yml.j2
        ├── vars/
        │   └── main.yml
        └── files/
            └── frontend/
                ├── index.html
                └── Dockerfile
```

---

## Prasyarat

Pastikan sudah terinstall di mesin controller (WSL/Linux):

- Docker
- Ansible
- sshpass

```bash
sudo apt install ansible sshpass -y
```

---

## Cara Menjalankan

### 1. Siapkan Node (simulasi VM)

Buat Docker network dan dua container sebagai node SSH:

```bash
docker network create ansible-net

docker run -d \
  --name node1 \
  --network ansible-net \
  --privileged \
  -p 2222:22 \
  rastasheep/ubuntu-sshd:18.04

docker run -d \
  --name node2 \
  --network ansible-net \
  --privileged \
  -p 2223:22 \
  rastasheep/ubuntu-sshd:18.04
```

### 2. Disable Host Key Checking

```bash
export ANSIBLE_HOST_KEY_CHECKING=False
```

### 3. Test Koneksi

```bash
ansible all -i inventory.yml -m ping --ask-vault-pass
```

Output yang diharapkan:
```
node1 | SUCCESS => { "ping": "pong" }
node2 | SUCCESS => { "ping": "pong" }
```

### 4. Jalankan Playbook

```bash
ansible-playbook -i inventory.yml playbook.yml --ask-vault-pass
```

---

## Penjelasan Per Role

### Role: `docker`
Dijalankan di **semua node**. Tugasnya:
- Fix apt source list
- Install Docker dan dependensinya
- Install Docker Compose plugin
- Start Docker daemon
- Install dan enable UFW (firewall)

### Role: `backend` — Praktikan 2
Dijalankan di **node1** (`group_backend`). Tugasnya:
- Buka port backend di firewall
- Copy source code backend (Node.js + Express)
- Generate file `.env` dari template Jinja2 (berisi DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET)
- Generate `docker-compose.yml` dari template (service backend + postgres)
- Jalankan dengan Docker Compose
- Health check ke endpoint `/`

Stack backend:
- **Node.js + Express** — REST API (register, login)
- **PostgreSQL** — database user
- **bcryptjs** — hash password
- **jsonwebtoken** — generate JWT token

### Role: `frontend` — Praktikan 3
Dijalankan di **node2** (`group_frontend`). Tugasnya:
- Buka port frontend di firewall
- Copy `index.html` dan `Dockerfile` ke node
- Generate `config.js` dari template Jinja2 — **URL backend di-inject otomatis**
- Generate `docker-compose.yml` dari template
- Jalankan container Nginx dengan Docker Compose
- Health check ke `http://localhost:8080`

Stack frontend:
- **Nginx Alpine** — serve static file
- **HTML + Vanilla JS** — halaman login dan registrasi
- **PicoCSS** — styling

---

## Variabel

### `group_vars/group_frontend.yml`

| Variabel | Nilai | Keterangan |
|---|---|---|
| `frontend_port` | `8080` | Port frontend di host |
| `backend_port` | `5000` | Port backend |
| `backend_url` | `http://127.0.0.1:5000` | URL backend untuk config.js |

### `roles/backend/vars/main.yml`

| Variabel | Keterangan |
|---|---|
| `db_name` | Nama database PostgreSQL |
| `db_username` | Username database |
| `backend_port` | Port backend (5000) |
| `db_password` | Diambil dari vault |
| `jwt_secret` | Diambil dari vault |

### `group_vars/all/vault.yml`
Terenkripsi dengan **Ansible Vault AES256**. Berisi:
- `vault_db_password`
- `vault_jwt_secret`

Untuk decrypt saat menjalankan playbook, gunakan flag `--ask-vault-pass`.

---

## Konsep Penting: Template Jinja2

Salah satu fitur utama Ansible yang digunakan di proyek ini adalah **template Jinja2** untuk generate file konfigurasi secara dinamis.

Contoh `config.js.j2`:
```javascript
const API_BASE_URL = "{{ backend_url }}";
```

Saat playbook dijalankan, Ansible akan generate `config.js` di node frontend dengan nilai variabel yang sudah didefinisikan. Ini berarti **URL backend tidak perlu hardcode** di source code HTML — cukup ubah variabel di `group_vars`, deploy ulang, selesai.

Untuk memverifikasi hasil generate:
```bash
docker exec -it node2 cat /home/ubuntu/app/frontend/config.js
# Output: const API_BASE_URL = "http://127.0.0.1:5000";
```

---

## Akses Aplikasi (Development / WSL)

Karena menggunakan Docker container di WSL, perlu SSH tunnel untuk akses dari browser Windows:

**Tunnel frontend (node2):**
```bash
ssh -p 2223 -L 9090:localhost:8080 root@127.0.0.1
# Buka browser: http://localhost:9090
```

**Tunnel backend (node1):**
```bash
ssh -p 2222 -L 5000:localhost:5000 root@127.0.0.1
```

Password SSH: `root`

---

## Skenario Demo

| Skenario | Aksi | Hasil yang Diharapkan |
|---|---|---|
| Register baru | Input username + password baru, klik Daftar | "Registrasi berhasil! Silakan login." |
| Register duplikat | Input username yang sama, klik Daftar | "Username sudah digunakan!" |
| Login password salah | Input password yang salah, klik Login | "Password salah!" |
| Login berhasil | Input kredensial yang benar, klik Login | "Login berhasil!" + JWT Token |

---

## Troubleshooting

**Error: `sshpass` not found**
```bash
sudo apt install sshpass -y
```

**Error: Host key checking**
```bash
export ANSIBLE_HOST_KEY_CHECKING=False
```

**Error: Docker daemon not running di node**
```bash
docker exec -it node1 bash
dockerd > /dev/null 2>&1 &
sleep 10
exit
```

**Error: Vault password**
Pastikan selalu tambahkan flag `--ask-vault-pass` saat menjalankan perintah Ansible.

---

## Anggota Kelompok

| Praktikan | NRP | Tugas |
|---|---|---|
| Erlangga Valdhio | 5027241030 | setup intial |
| Ivan Syarifuddin | 5027241045 | Role Backend + Database |
| Fika Arka Nuriyah | 5027241071 | Role Frontend |
