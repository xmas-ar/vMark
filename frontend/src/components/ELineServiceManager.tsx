import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ELineService, NodeInfo, ELineServiceCreatePayload, ELineServiceUpdatePayload, ForwardingRule } from '../types';
import ELineDiagram from './ELineDiagram';
import Modal from './Modal'; // Import your Modal component
// Assuming you have a Select component, e.g., react-select
// import Select from 'react-select';

interface ELineServiceManagerProps {
  nodes: NodeInfo[];
  apiBaseUrl: string;
}

const initialFormState: ELineServiceCreatePayload = {
  name: '',
  description: '',
  a_node_id: '',
  a_iface: '',
  a_rule_name: '',
  z_node_id: '',
  z_iface: '',
  z_rule_name: '',
};

const ELineServiceManager: React.FC<ELineServiceManagerProps> = ({ nodes, apiBaseUrl }) => {
  const [services, setServices] = useState<ELineService[]>([]);
  const [selectedService, setSelectedService] = useState<ELineService | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentServiceForm, setCurrentServiceForm] = useState<ELineServiceCreatePayload | ELineServiceUpdatePayload>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);

  const [nodeARules, setNodeARules] = useState<ForwardingRule[]>([]);
  const [nodeZRules, setNodeZRules] = useState<ForwardingRule[]>([]);
  const [isLoadingARules, setIsLoadingARules] = useState(false);
  const [isLoadingZRules, setIsLoadingZRules] = useState(false);

  const [nodeAIfaces, setNodeAIfaces] = useState<string[]>([]);
  const [nodeZIfaces, setNodeZIfaces] = useState<string[]>([]);
  const [isLoadingAIfaces, setIsLoadingAIfaces] = useState(false);
  const [isLoadingZIfaces, setIsLoadingZIfaces] = useState(false);


  const [selectedServiceForDiagram, setSelectedServiceForDiagram] = useState<ELineService | null>(null);

  // Ref para controlar si el refresco inicial de estados ya se hizo
  const initialStatusRefreshDoneRef = useRef(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  const [elineFilter, setElineFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchServices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // Resetear la bandera de refresco inicial cada vez que se fetchean los servicios
    initialStatusRefreshDoneRef.current = false; 
    try {
      const response = await fetch(`${apiBaseUrl}/eline-services`);
      if (!response.ok) {
        // Attempt to parse error detail from backend
        let errorDetail = `Failed to fetch E-Line services: ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData && errorData.detail) {
                errorDetail = errorData.detail;
            }
        } catch (parseError) {
            // Ignore if parsing fails, use default error
        }
        throw new Error(errorDetail);
      }
      const data: ELineService[] = await response.json();
      setServices(data);
    } catch (err: any) {
      setError(err.message);
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]); // setIsLoading, setError, setServices son estables

  // Efecto para cargar los servicios al montar el componente
  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const fetchNodeRules = useCallback(async (
    nodeId: string,
    setRules: React.Dispatch<React.SetStateAction<ForwardingRule[]>>,
    setIsLoadingRules: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!nodeId) {
      setRules([]);
      return;
    }
    setIsLoadingRules(true);
    try {
      const res = await fetch(`${apiBaseUrl}/nodes/${nodeId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'xdp-switch show-forwarding json' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching rules for ${nodeId}`);
      const data = await res.json();

      let rules: ForwardingRule[] = [];
      if (data.output && typeof data.output.table === 'string') {
        // Parse stringified JSON array
        try {
          rules = JSON.parse(data.output.table);
        } catch (err) {
          console.error("Failed to parse forwarding table JSON string:", err, data.output.table);
        }
      } else if (data.output && Array.isArray(data.output.table)) {
        rules = data.output.table;
      } else {
        console.warn("No forwarding table data or unexpected format for node:", nodeId, data.output);
      }
      setRules(rules);
      console.log("Fetched rules for node:", nodeId, rules);
    } catch (e: any) {
      console.error("Error fetching rules for node:", nodeId, e);
      setRules([]);
    } finally {
      setIsLoadingRules(false);
    }
  }, [apiBaseUrl]);

  const fetchNodeIfaces = useCallback(async (nodeId: string, setIfaces: React.Dispatch<React.SetStateAction<string[]>>, setIsLoading: React.Dispatch<React.SetStateAction<boolean>>) => {
    if (!nodeId) {
      setIfaces([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/nodes/${nodeId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'show interfaces' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching interfaces for ${nodeId}`);
      const data = await res.json();
      const output = (data.output?.stdout || data.output || '').replace(/\x1b\[[0-9;]*m/g, '');
      const ifaces = output
        .split('\n')
        .map((line: string) => line.trim().split(/\s+/)[0])
        .filter((name: string) =>
          name &&
          !name.startsWith('test/') &&
          name !== 'lo' &&
          !name.startsWith('>') &&
          !name.startsWith('-')
        );
      setIfaces(ifaces);
    } catch (e) {
      setIfaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isModalOpen) { // Fetch rules and interfaces only if modal is open
        if (modalMode === 'edit' && selectedService) {
            const { created_at, updated_at, active, a_node_ip, z_node_ip, a_rule_data, z_rule_data, ...editableFields } = selectedService;
            setCurrentServiceForm(editableFields);
            if (editableFields.a_node_id) {
                fetchNodeRules(editableFields.a_node_id, setNodeARules, setIsLoadingARules);
                fetchNodeIfaces(editableFields.a_node_id, setNodeAIfaces, setIsLoadingAIfaces);
            }
            if (editableFields.z_node_id) {
                fetchNodeRules(editableFields.z_node_id, setNodeZRules, setIsLoadingZRules);
                fetchNodeIfaces(editableFields.z_node_id, setNodeZIfaces, setIsLoadingZIfaces);
            }
        } else if (modalMode === 'create') {
            setCurrentServiceForm(initialFormState);
            setNodeARules([]);
            setNodeZRules([]);
            setNodeAIfaces([]);
            setNodeZIfaces([]);
            // If a node is pre-selected in create mode (e.g. from context), fetch its rules and interfaces
            if (initialFormState.a_node_id) {
                fetchNodeRules(initialFormState.a_node_id, setNodeARules, setIsLoadingARules);
                fetchNodeIfaces(initialFormState.a_node_id, setNodeAIfaces, setIsLoadingAIfaces);
            }
            if (initialFormState.z_node_id) {
                fetchNodeRules(initialFormState.z_node_id, setNodeZRules, setIsLoadingZRules);
                fetchNodeIfaces(initialFormState.z_node_id, setNodeZIfaces, setIsLoadingZIfaces);
            }
        }
    }
  }, [isModalOpen, modalMode, selectedService, fetchNodeRules, fetchNodeIfaces]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentServiceForm(prev => ({ ...prev, [name]: value }));

    if (name === "a_node_id") {
      fetchNodeRules(value, setNodeARules, setIsLoadingARules);
      fetchNodeIfaces(value, setNodeAIfaces, setIsLoadingAIfaces);
      setCurrentServiceForm(prev => ({ ...prev, a_rule_name: '', a_iface: '' }));
    }
    if (name === "z_node_id") {
      fetchNodeRules(value, setNodeZRules, setIsLoadingZRules);
      fetchNodeIfaces(value, setNodeZIfaces, setIsLoadingZIfaces);
      setCurrentServiceForm(prev => ({ ...prev, z_rule_name: '', z_iface: '' }));
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedService(null); 
    setCurrentServiceForm(initialFormState); // Reset form for create
    setNodeARules([]); // Clear previous rules
    setNodeZRules([]);  // Clear previous rules
    setNodeAIfaces([]); // Clear previous interfaces
    setNodeZIfaces([]);  // Clear previous interfaces
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (service: ELineService) => {
    setModalMode('edit');
    setSelectedService(service); 
    // Form population and rule fetching will be handled by useEffect listening to isModalOpen and selectedService
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentServiceForm(initialFormState);
    setNodeARules([]);
    setNodeZRules([]);
    setNodeAIfaces([]);
    setNodeZIfaces([]);
  };

  const [isOneNodeEline, setIsOneNodeEline] = useState(false); // Estado para el checkbox

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsLoading(true);

    const formData = { ...currentServiceForm };

    if (isOneNodeEline) {
      // Eliminar campos de Node Z si es un One-node E-Line
      delete formData.z_node_id;
      delete formData.z_iface;
      delete formData.z_rule_name;
    }

    const url = modalMode === 'create' 
      ? `${apiBaseUrl}/eline-services` 
      : `${apiBaseUrl}/eline-services/${selectedService?.name}`;
    
    const method = modalMode === 'create' ? 'POST' : 'PUT';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new Error(errorData.detail || `Failed to ${modalMode} service`);
      }
      await fetchServices(); // Refresh list
      handleCloseModal();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteService = async (serviceName: string) => {
    if (!window.confirm(`Are you sure you want to delete service "${serviceName}"?`)) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/eline-services/${serviceName}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new Error(errorData.detail || `Failed to delete service`);
      }
      await fetchServices(); // Refresh list
      if (selectedService?.name === serviceName) {
        setSelectedService(null); // Clear selection if deleted service was selected
      }
    } catch (err: any) {
      setError(err.message); // Show error in main area or a specific notification
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceSelect = (service: ELineService) => {
    // Solo mostrar/ocultar el diagrama, no volver a pedir datos al backend
    setSelectedService(prev =>
      prev && prev.name === service.name ? null : service
    );
  };

  const handleServiceCardClick = (service: ELineService) => {
    setSelectedServiceForDiagram(prev => {
      // Si ya está seleccionado, deselecciona
      if (prev && prev.name === service.name) return null;
      // Busca el servicio actualizado en el array services
      const updated = services.find(s => s.name === service.name);
      return updated || service;
    });
  };

  const fetchServiceDetails = async (serviceName: string) => {
    // This function would fetch GET /api/eline-services/{service_name}
    // which should return the service with a_rule_data and z_rule_data populated
    setIsLoading(true); // Or a specific loader for the diagram
    try {
        const response = await fetch(`${apiBaseUrl}/eline-services/${serviceName}`);
        if (!response.ok) throw new Error(`Failed to fetch details for ${serviceName}`);
        const detailedService: ELineService = await response.json();
        setSelectedService(detailedService);
        // Update the service in the main list as well
        setServices(prev => prev.map(s => s.name === serviceName ? detailedService : s));
    } catch (err: any) {
        setError(`Error fetching details for ${serviceName}: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchRuleDetails = async (nodeId: string, ruleName: string): Promise<ForwardingRule | null> => {
    try {
      const res = await fetch(`${apiBaseUrl}/nodes/${nodeId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'xdp-switch show-forwarding json' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      let rules: ForwardingRule[] = [];
      if (data.output && typeof data.output.table === 'string') {
        rules = JSON.parse(data.output.table);
      } else if (data.output && Array.isArray(data.output.table)) {
        rules = data.output.table;
      }
      return rules.find(r => r.name === ruleName) || null;
    } catch {
      return null;
    }
  };

  const refreshServiceStatuses = useCallback(async () => {
    if (services.length === 0) return;
    setIsLoading(true);
    try {
      const updatedServices = await Promise.all(
        services.map(async (service) => {
          const aRule = await fetchRuleDetails(service.a_node_id, service.a_rule_name);
          let zRule = null;

          // Solo buscar la regla de Node Z si no es un One-node E-Line
          if (service.z_node_id) {
            zRule = await fetchRuleDetails(service.z_node_id, service.z_rule_name);
          }

          // Determinar el estado activo del servicio
          const isActive = service.z_node_id
            ? !!(aRule && aRule.active) && !!(zRule && zRule.active) // Servicios normales
            : !!(aRule && aRule.active); // Servicios de un nodo

          return {
            ...service,
            a_rule_data: aRule,
            z_rule_data: zRule,
            active: isActive,
          };
        })
      );
      setServices(updatedServices);
    } catch (err) {
      setError('Error refreshing service statuses. Some services might show an outdated state.');
      console.error('Error during refreshServiceStatuses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [services, fetchRuleDetails]);

  // Ref para la función refreshServiceStatuses para usar en listeners sin causar re-suscripción
  const refreshServiceStatusesRef = useRef(refreshServiceStatuses);
  useEffect(() => {
    refreshServiceStatusesRef.current = refreshServiceStatuses;
  }, [refreshServiceStatuses]);

  // Efecto para el refresco inicial de estados después de que 'services' se cargan
  useEffect(() => {
    if (services.length > 0 && !initialStatusRefreshDoneRef.current && document.visibilityState === 'visible') {
      setIsCheckingStatus(true); // <--- Agrega esto
      refreshServiceStatusesRef.current().finally(() => setIsCheckingStatus(false));
      initialStatusRefreshDoneRef.current = true;
    }
  }, [services]);

  // Efecto para el listener de visibilidad de la pestaña
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsCheckingStatus(true); // <--- Agrega esto
        // Solo refrescar si la carga inicial de estados ya se hizo o si no hay servicios
        if (initialStatusRefreshDoneRef.current || services.length === 0) {
          refreshServiceStatusesRef.current().finally(() => setIsCheckingStatus(false));
        } else if (services.length > 0 && !initialStatusRefreshDoneRef.current) {
          refreshServiceStatusesRef.current().finally(() => setIsCheckingStatus(false));
          initialStatusRefreshDoneRef.current = true;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [services.length]); // Depender de services.length para re-evaluar la lógica del listener si los servicios se vacían/cargan.

  if (isLoading && services.length === 0) return <div className="text-gray-400">Loading E-Line services...</div>;
  // Removed the general error display here, as it's now in the header of the component
  // if (error) return <div className="text-red-400">Error: {error}</div>;
  const filteredServices = services.filter(s =>
    elineFilter === 'all'
      ? true
      : elineFilter === 'active'
        ? s.active
        : !s.active
);
  return (
    <div className="p-4 md:p-0 bg-black min-h-screen text-gray-100">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
  <div className="flex items-center gap-2">
    <label htmlFor="eline-filter" className="text-sm text-gray-300">Filter:</label>
    <select
      id="eline-filter"
      value={elineFilter}
      onChange={e => setElineFilter(e.target.value as 'all' | 'active' | 'inactive')}
      className="bg-[#202020] border border-gray-500 rounded px-3 py-1 text-sm text-white"
    >
      <option value="all">All</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  </div>
  <div className="flex justify-end items-center gap-4">
    <button
        onClick={() => {
          setIsCheckingStatus(true); // <--- Agrega esto
          refreshServiceStatuses().finally(() => setIsCheckingStatus(false));
        }}
        disabled={isLoading}
        className="bg-[#c6441a] hover:bg-[#c6441a] text-white font-semibold py-2 px-4 rounded-lg shadow-md disabled:opacity-50 transition duration-150 ease-in-out"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Refreshing...
          </div>
        ) : "Refresh"}
      </button>
      <button
        onClick={handleOpenCreateModal}
        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out"
      >
        New E-line
      </button>
  </div>
</div>
    {error && <div className="bg-red-800 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-4" role="alert">{error}</div>}
      
      {isLoading && services.length === 0 && <div className="text-center py-10 text-gray-400">Loading E-Line services...</div>}

      {!isLoading && services.length === 0 && !error && (
        <div className="text-center py-10 text-gray-400">No E-Line services found.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => (
          <div
            key={service.name}
            className={`p-5 rounded-xl shadow-xl cursor-pointer transition-all duration-200 ease-in-out transform hover:scale-105 
                        ${selectedServiceForDiagram?.name === service.name ? 'ring-4 ring-sky-500 bg-[#202020]' : 'bg-[#202020] hover:bg-[#202020]'}
                        border border-gray-500`}
            onClick={() => handleServiceCardClick(service)} // <--- LLAMAR A LA FUNCIÓN DE CLIC
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xl font-semibold text-sky-400">{service.name}</h3>
              <div className="flex space-x-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenEditModal(service); }}
                  className="text-gray-400 hover:text-yellow-400 transition-colors"
                  title="Edit Service"
                >
                  {/* Edit Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteService(service.name); }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete Service"
                >
                  {/* Delete Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1 line-clamp-2" title={service.description || "No description"}>{service.description || "No description"}</p>
            <p className="text-xs text-gray-500 mb-3">
              Nodes: {service.a_node_id} ({service.a_node_ip || 'N/A'}) &harr; {service.z_node_id} ({service.z_node_ip || 'N/A'})
            </p>
            <div className={`text-sm font-medium py-1 px-2 rounded-full inline-block ${
    isCheckingStatus
      ? 'bg-gray-700 text-gray-300'
      : service.active
        ? 'bg-green-700 text-green-200'
        : 'bg-red-700 text-red-200'
}`}>
  Status: {isCheckingStatus ? 'Checking' : (service.active ? 'Active' : 'Inactive')}
</div>
          </div>
        ))}
      </div>

      {/* Renderizado condicional del diagrama */}
      {selectedServiceForDiagram && (
        <div className="mt-8 p-6 bg-[#202020] rounded-xl shadow-2xl border border-gray-500">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-sky-400">
              eBPF mappings for service <span className="text-white">{selectedServiceForDiagram.name}</span>
            </h3>
            <button 
              onClick={() => setSelectedServiceForDiagram(null)} 
              className="text-gray-400 hover:text-white text-2xl"
              title="Close Diagram"
            >
              &times;
            </button>
          </div>
          <ELineDiagram service={selectedServiceForDiagram} />
        </div>
      )}

      {/* Modal para crear/editar servicios (tu código existente del modal) */}
      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={modalMode === 'create' ? 'Create E-Line Service' : 'Edit E-Line Service'}>
          <div className="bg-[#202020] pt-2 rounded-lg w-full max-w-full max-h-[80vh] overflow-y-auto">
            {formError && <div className="text-red-400 bg-red-900 p-3 rounded mb-4">{formError}</div>}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300">Service Name (ID)</label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  value={(currentServiceForm as ELineServiceCreatePayload).name || ''}
                  onChange={handleInputChange}
                  className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                  required
                  disabled={modalMode === 'edit'}
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300">Description (Optional)</label>
                <textarea
                  name="description"
                  id="description"
                  rows={2}
                  value={currentServiceForm.description || ''}
                  onChange={handleInputChange}
                  className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                />
              </div>

              {/* Node A Fields */}
              <fieldset className="border border-gray-500 p-4 rounded-md">
                <legend className="text-md font-semibold text-[#c6441a] px-2">Node A Ingress</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div>
                    <label htmlFor="a_node_id" className="block text-sm font-medium text-gray-300">Node A</label>
                    <select
                      name="a_node_id"
                      id="a_node_id"
                      value={currentServiceForm.a_node_id}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-white rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required
                    >
                      <option value="">Select Node A</option>
                      {nodes.map(node => <option key={node.id} value={node.id}>{node.id} ({node.ip})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="a_iface" className="block text-sm font-medium text-gray-300">Node A Interface</label>
                    <select
                      name="a_iface"
                      id="a_iface"
                      value={currentServiceForm.a_iface}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required
                      disabled={!currentServiceForm.a_node_id || isLoadingAIfaces}
                    >
                      <option value="">{isLoadingAIfaces ? "Loading interfaces..." : "Select interface"}</option>
                      {nodeAIfaces.map(iface => (
                        <option key={iface} value={iface}>{iface}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="a_rule_name" className="block text-sm font-medium text-gray-300">Node A Rule</label>
                    <select
                      name="a_rule_name"
                      id="a_rule_name"
                      value={currentServiceForm.a_rule_name}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required
                      disabled={!currentServiceForm.a_iface || isLoadingARules}
                    >
                      <option value="">
                        {isLoadingARules
                          ? "Loading rules..."
                          : (!currentServiceForm.a_iface
                              ? "Select interface first"
                              : nodeARules.filter(rule =>
                                  rule.in_interface &&
                                  currentServiceForm.a_iface &&
                                  rule.in_interface.trim().toLowerCase() === currentServiceForm.a_iface.trim().toLowerCase()
                                ).length === 0
                                ? "No rules found"
                                : "Select Rule A")}
                      </option>
                      {nodeARules
                        .filter(rule =>
                          rule.in_interface &&
                          currentServiceForm.a_iface &&
                          rule.in_interface.trim().toLowerCase() === currentServiceForm.a_iface.trim().toLowerCase()
                        )
                        .map(rule => (
                          <option key={rule.name} value={rule.name}>{rule.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Node Z Fields */}
               {!isOneNodeEline && (
              <fieldset className="border border-gray-500 p-4 rounded-md">
                <legend className="text-md font-semibold text-purple-400 px-2">Node Z Ingress</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div>
                    <label htmlFor="z_node_id" className="block text-sm font-medium text-gray-300">Node Z</label>
                    <select
                      name="z_node_id"
                      id="z_node_id"
                      value={currentServiceForm.z_node_id}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required={!isOneNodeEline}
                    >
                      <option value="">Select Node Z</option>
                      {nodes.map(node => <option key={node.id} value={node.id}>{node.id} ({node.ip})</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="z_iface" className="block text-sm font-medium text-gray-300">Node Z Interface</label>
                    <select
                      name="z_iface"
                      id="z_iface"
                      value={currentServiceForm.z_iface}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required
                      disabled={!currentServiceForm.z_node_id || isLoadingZIfaces}
                    >
                      <option value="">{isLoadingZIfaces ? "Loading interfaces..." : "Select interface"}</option>
                      {nodeZIfaces.map(iface => (
                        <option key={iface} value={iface}>{iface}</option>
                      ))}
                    </select>
                  </div>
                   <div>
                    <label htmlFor="z_rule_name" className="block text-sm font-medium text-gray-300">Node Z Rule</label>
                    <select
                      name="z_rule_name"
                      id="z_rule_name"
                      value={currentServiceForm.z_rule_name}
                      onChange={handleInputChange}
                      className="mt-1 block w-full bg-[#303030] border-gray-500 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-[#c6441a] focus:border-[#c6441a] sm:text-sm"
                      required
                      disabled={!currentServiceForm.z_iface || isLoadingZRules}
                    >
                      <option value="">
                        {isLoadingZRules
                          ? "Loading rules..."
                          : (!currentServiceForm.z_iface
                              ? "Select interface first"
                              : nodeZRules.filter(rule =>
                                  rule.in_interface &&
                                  currentServiceForm.z_iface &&
                                  rule.in_interface.trim().toLowerCase() === currentServiceForm.z_iface.trim().toLowerCase()
                                ).length === 0
                                ? "No rules found"
                                : "Select Rule Z")}
                      </option>
                      {nodeZRules
                        .filter(rule =>
                          rule.in_interface &&
                          currentServiceForm.z_iface &&
                          rule.in_interface.trim().toLowerCase() === currentServiceForm.z_iface.trim().toLowerCase()
                        )
                        .map(rule => (
                          <option key={rule.name} value={rule.name}>{rule.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              </fieldset>
               )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="one-node-eline"
                  checked={isOneNodeEline}
                  onChange={(e) => setIsOneNodeEline(e.target.checked)}
                  className="accent-[#c6441a] w-4 h-4"
                />
                <label htmlFor="one-node-eline" className="text-sm text-gray-300 select-none">
                  One-node E-Line
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-500 rounded-md text-sm font-medium text-gray-300 hover:bg-[#202020] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading} // Consider a specific form loading state: isFormSubmitting
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#c6441a] hover:bg-[#c6441a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#c6441a] focus:ring-offset-gray-800 disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : (modalMode === 'create' ? 'Create Service' : 'Save Changes')}
                </button>
              </div>
            </form>
        </div>
      </Modal>
    )}
    </div>
  );
};

export default ELineServiceManager;