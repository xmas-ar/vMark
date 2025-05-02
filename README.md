<h1 align="center">vMark by Pathgate</h1>
<h2 align="center">Ethernet demarcation management system for <a href="https://github.com/xmas-ar/vMark-node">vMark-node</a> endpoints</h2>

<p align="center">Latest version: 0.1.1 / Release notes: <a href="https://github.com/xmas-ar/vMark/blob/main/docs/base/release_notes.md">Link</a> </p>

**🚀 Features:**
- Node Management: CRUD operations.
- Heartbeat sensor (last 24hs)
- Node Filtering & Search.
- Docker deployment.


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
  - Heartbeat node monitoring.
  - Ethernet OAM. (IEEE 802.1ag / Y.1731)
  
  3. Automation
  
  - Remote vMark MEF Ethernet services deployment & monitoring.
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
  
  - IPv4 and IPv6
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


___

![WhatsApp Image 2025-04-25 at 18 52 09_84bb6512](https://github.com/user-attachments/assets/aba9962c-a8a8-4a04-bc2c-e073c5f72b37)


<h2 align="center"></h2>
<h1 align="center"># Overview</h1>

<p align="center">vMark is an open-source Ethernet demarcation orchestration system, designed for flexibility and democratization in the Carrier industry.</p>

<p align="center">The endpoints managed by this system are <a href="https://github.com/xmas-ar/vMark-node">vMark-node</a> endpoints. </p>



<p align="center">
  <img src="https://github.com/user-attachments/assets/a0ff9c06-6466-40df-bda7-70f73f2d7bf9" alt="xxx">
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
docker pull xmasar/vmark:v0.1.1
```

2.  **Run the Docker Container:**
```
docker run -d -p 8000:8000 --name vmark xmasar/vmark:v0.1.1
```

3.  **Access vMark:** Open your web browser and navigate to `http://localhost:8000`.

___
### Method 2: Manual Installation ✅

This method requires Python, Node.js, and npm to be installed.

1.  **Clone the Repository:**
   
```
git clone https://github.com/xmas-ar/vMark
```

2.  **Set up Backend:**

```
cd backend
python3 -m venv venv        # Create a virtual environment
source venv/bin/activate   # Activate (use venv\Scripts\activate on Windows)
pip install -r requirements.txt # Install Python dependencies
# Initialize database if needed (e.g., python init_db.py)
cd ..                      # Go back to the root vMark directory
```

3.  **Set up Frontend:**

```
cd frontend
npm install                # Install Node.js dependencies
npm run build              # Build static frontend files (output to frontend/dist)
cd ..                      # Go back to the root vMark directory
```

4.  **Run Backend Server:**

```
From the `vMark` root directory:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```


5.  **Access vMark:**

```
Open your web browser and navigate to `http://localhost:8000` (or the IP/port where the backend is running).
If using the frontend dev server, access it at its specific address (e.g., `http://localhost:5173`).

```
