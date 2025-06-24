<p align="center">
  <img src="https://github.com/user-attachments/assets/766164e9-3a5a-46a2-9183-dcfef9bc0aa9" alt="xxx" style="width: 500px; height: auto;">
</p>

<p align="center">Latest (beta) version: 0.1.5 / Release notes: <a href="https://github.com/xmas-ar/vMark/blob/main/docs/base/release_notes.md">Link</a> / News at: <a href="https://linkedin.com/company/pathgate">LinkedIn</a> </p></p>

**🚀 Features:**
- Ad-hoc **RFC 5357 (TWAMP)** Benchmarks
- Node Management
- Heartbeat sensor (last 24hs)
- Node Filtering & Tags-based Search.
- **Docker** deployment.
- Remote vMark **MEF E-line services deployment** (eBPF/XDP). (v0.1.5)


<details>

  <summary>Feature roadmap</summary>
  
  
  ```
   1. Benchmarks:
  
  - Throughput / Latency / Frame Loss (RFC 2544).
  - Back-to-Back and Jitter Testing.
  - Packet Delay Variation (PDV) for voice/video service assurance. 
  - Path MTU Discovery (detect fragmentation issues)
  
  2. Performance Assurance
  
  - 24/7 Service Assurance sessions (XDP BFD implementation).
  - Ethernet OAM CFM/LFM. (IEEE 802.1ag / Y.1731)
  
  3. Automation
  
  - Scheduled Tests (hourly, daily, during maintenance windows)
  - Threshold-Based Alerts (ex: latency > 5 ms triggers an alert)
  - Trend Analysis and Forecasting (AI/ML for predicting future problems, suggest fixes)
  - Dynamic Baseline Learning

  4. Observability metrics
  - Flow Export and Analysis (NetFlow, sFlow, IPFIX support)
  - Real-Time Packet Capture (Wireshark-style exports)
  - Live Traffic Statistics (bandwidth per port, errors, discards, CRCs, etc.)
  - Interface Health Monitoring (up/down, speed mismatches, duplex mismatches)
  
  5. Protocol Support and Flexibility
  
  - DPDK/VPP
  - VLAN, QinQ, MPLS, Segment Routing aware
  - Option for encrypted link testing (IPSec, MACsec links)
  - MEF3 compliance.
  - Timing protocols support (ITU-T G.8262 Sync-E and IEEE 1588v2)
  
  5. UX and Integrations
  
  - Multi-Tenant Support (so multiple users can run tests in parallel)
  - Authentication/Authorization (LDAP, OIDC)
  - Report Generation (PDF/HTML reports after test runs)
  
  6. Advanced Features:
  
  - Adaptive holistic Testing (group tests report that changes dynamically based on live results)
  ```
  
</details>



<h2 align="center"></h2>
<h1 align="center"># Overview</h1>


<p align="center">vMark is an open-source Ethernet demarcation system, designed for flexibility and democratization in the Carrier industry.</p>

<p align="center">The endpoints orchestrated by this system are <a href="https://github.com/xmas-ar/vMark-node">vMark-node</a> instances. </p>


<p align="center">
  <img src="https://github.com/user-attachments/assets/a32578d7-03df-4c60-8b4e-41870e5b955e" alt="xxx">
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/223e165c-bd16-4fc6-9ac7-9a233ea42c23" alt="xxx">
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/048778a4-fe34-4be9-b9fd-7618f5beb1ed" alt="xxx">
</p>

<h1 align="center"># Architecture</h1>

**Web Frontend:**
Provides the user interface for monitoring and managing registered vMark-node instances. Built with **React**, **TypeScript**, and **Vite**, styled with **Tailwind CSS**, and uses **Recharts** for data visualization. It allows users to view node status, configure settings, and visualize performance data like latency.

**Backend API:**
The core engine built with **FastAPI** (Python). It handles requests from the Web Frontend, manages node registration and authentication, interacts with the database, and orchestrates communication with individual vMark-node instances.

**Database:**
Stores persistent data including registered node details (IP, capabilities, status, registration tokens), user accounts, historical latency data, and system configuration. Uses **SQLite** accessed via **SQLModel** (Python ORM).

**Heartbeat Service:**
A background **asyncio** task running within the FastAPI application. It's responsible for periodically checking the status and collecting latency information from all registered vMark-node instances via their respective APIs using **httpx**.

**Node Communication Layer:**
Handles the secure API interactions between the vMark server (using **httpx** within the Backend API and Heartbeat Service) and the individual vMark-node instances, facilitating remote command execution and data retrieval.

___

<h1 align="center">📎 Installation methods</h1>

You can install and run vMark using either Docker (recommended for ease of use) or by setting up the frontend and backend manually.

___

### Method 1: Docker Installation 🔄 (Recommended)

This method requires Docker to be installed on your system.

1.  **Pull the Docker Image:**

```
docker pull xmasar/vmark:v0.1.5
```

2.  **Run the Docker Container:**
```
docker run -d -p 8000:8000 --name vmark xmasar/vmark:v0.1.5
```

3.  **Access vMark:** Open your web browser and navigate to `http://localhost:8000`.

___
### Method 2: Manual Installation ✅

This method requires Python, Node.js, and npm to be installed.

1.  **Clone the Repository:**
   
```
git clone https://github.com/xmas-ar/vMark
```

2.  **Set up Frontend:**

```
cd frontend
npm install                # Install Node.js dependencies
npm run build              # Build static frontend files (output to frontend/dist
cd ..                      # Go back to the root vMark directory
```

3.  **Set up Backend & DB:**

```
cd backend
python3 -m venv venv        # Create a virtual environment
source venv/bin/activate
pip install -r requirements.txt # Install Python dependencies
cd ..                      # Go back to the root vMark directory
# Initialize database:
PYTHONPATH=. python backend/init_db.py
python -m backend.init_db
```

4.  **Modify line 17 in backend/main.py from:**
```
STATIC_FILES_DIR = os.path.join(os.path.dirname(__file__), "frontend/dist")
```
**to:** (temporal fix, will be removed in further versions).
```
STATIC_FILES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
```

5.  **Modify line 11 in frontend/App.tsx and line 8 in config.py from:**
```
const API_BASE_URL = '/api';
```
**to:**
```
const API_BASE_URL = 'http://<IPADDRESS>:8000/api';
```
**config.py:**
```
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
```
**to:**
```
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://<IPADDRESS>:5173"
```
  
6.  **Run Backend & Frontend Server:**

```
From the `vMark` root directory and with Virtual environment activated:
uvicorn backend.main:app --host <IPADDRESS> --reload

and from frontend directory:
npm run dev -- --host <IPADDRESS>
```


5.  **Access vMark:**

```
Open your web browser and navigate to `http://localhost:5173` (or the IP/port where the frontend is running).

```
