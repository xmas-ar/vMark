<h1 align="center">vMark by Pathgate</h1>
<h2 align="center">Ethernet demarcation management system for <a href="https://github.com/xmas-ar/vMark-node">vMark-node</a> endpoints</h2>

![WhatsApp Image 2025-04-25 at 18 52 09_84bb6512](https://github.com/user-attachments/assets/aba9962c-a8a8-4a04-bc2c-e073c5f72b37)


**Feature roadmap:**

**1. Benchmarks:**

- Throughput / Latency / Frame Loss (RFC 2544).
- Back-to-Back and Jitter Testing.
- 24/7 Service Assurance sessions (XDP BFD implementation).
- Packet Delay Variation (PDV) for voice/video service assurance. 
- Path MTU Discovery (detect fragmentation issues)

**2. Performance Assurance**

- Flow Export and Analysis (NetFlow, sFlow, IPFIX support)
- Heartbeat node monitoring.
- Ethernet OAM.
- Real-Time Packet Capture (Wireshark-style exports)
- Live Traffic Statistics (bandwidth per port, errors, discards, CRCs, etc.)
- Interface Health Monitoring (up/down, speed mismatches, duplex mismatches)

**3. Automation and Analytics**

- Remote vMark MEF Ethernet services deployment & monitoring.
- Orchestation of vMark-nodes features.
- Scheduled Tests (hourly, daily, during maintenance windows)
- Threshold-Based Alerts (ex: latency > 5 ms triggers an alert)
- Historical Data Storage (keep performance logs for weeks/months)
- Trend Analysis and Forecasting (basic AI/ML for predicting future problems)
- Topology Awareness (map results back to logical/physical network maps)
- Dynamic Baseline Learning

**4. Protocol Support and Flexibility**

- IPv4 and IPv6
- VLAN, QinQ, MPLS, Segment Routing aware
- Option for encrypted link testing (IPSec, MACsec links)
- MEF3 compliance.

**5. UX and Integrations**

- Web UI Dashboards.
- CLI Access.
- API (REST/gRPC) for integration with orchestration tools.
- Multi-Tenant Support (so multiple users can run tests in parallel)
- Authentication/Authorization (LDAP, OIDC)
- Report Generation (PDF/HTML reports after test runs)

**6. Advanced Features:**

- Impairment Simulation (add artificial delay/loss/jitter to links)
- Adaptive Testing (tests change dynamically based on live results)
- Multi-Hop Path Tracing (reverse traceroute with performance metrics)

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

## Quick Install

```

```
