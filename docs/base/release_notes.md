# vMark Release Notes

Version 0.1.5: 
--------------

- eBPF Rule Manager (under Automation): Enables advanced management of forwarding rules across vMark-node instances.
- E-Line Service Manager (under Automation): Introduces an abstraction layer for service delivery, paving the way for future orchestration and benchmarking features.
- UI Revamp: Introduced a new visual theme and updated branding with the redesigned vMark logo.
- General bug fixing and QOL improvements (filters, buttons).


Version 0.1.3/4: 
--------------

- Added a lockable sidebar menu with categorized tabs for improved navigation.
- Nodes can now be filtered by Tags in addition to Node IDs.
- Introduced Ad-hoc RFC 5357 (TWAMP) Benchmarks:
    - Configurable test parameters
    - Start/Stop control from the UI
- Optimized heartbeat graph rendering for better performance at scale.
- Added useful external and internal links in the footer section.
- Bug fixes


Version 0.1.2: 
--------------

- Bug fixes to styling and async function for node info fetching.


Version 0.1.1: 
--------------


*   **Dashboard UI:** A responsive web interface for managing and monitoring `vMark-node` instances.
*   **Node Management:** Added functionality to register (`Add`), delete (`Delete`), and update (`Manage`) `vMark-node` endpoints directly from the UI.
*   **Latency Visualization:** Implemented a chart to display node latency/heartbeat data. Users can select time ranges (2h, 6h, 12h, 24h).
*   **Node Filtering & Search:** Added options to filter nodes by status (All, Online, Offline) and search nodes by their ID.
*   **Backend API:** Established the core FastAPI backend to support UI operations and node communication.
*   Initial setup for serving the frontend and backend via Docker
