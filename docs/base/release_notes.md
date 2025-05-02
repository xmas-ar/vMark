# vMark Release Notes - v0.1.1

## ✨ New Features

*   **Dashboard UI:** A responsive web interface for managing and monitoring `vMark-node` instances.
*   **Node Management:** Added functionality to register (`Add`), delete (`Delete`), and update (`Manage`) `vMark-node` endpoints directly from the UI.
*   **Latency Visualization:** Implemented a chart to display node latency/heartbeat data. Users can select time ranges (2h, 6h, 12h, 24h).
*   **Node Filtering & Search:** Added options to filter nodes by status (All, Online, Offline) and search nodes by their ID.
*   **Backend API:** Established the core FastAPI backend to support UI operations and node communication.
*   Initial setup for serving the frontend and backend via Docker ([vMark/Dockerfile](vMark/Dockerfile)).
