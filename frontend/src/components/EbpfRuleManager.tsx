import { time } from 'console';
import React, { useState } from 'react';
import Select from 'react-select';
import Draggable from 'react-draggable';

interface Node {
  id: string;
  node_id?: string;
  ip?: string;
  status?: string;
}

interface ForwardingTableEntry {
  name: string;
  in_interface: string;
  svlan: string | null;
  cvlan: string | null;
  out_interface: string;
  pop_tags: string;
  push_svlan: string | null;
  push_cvlan: string | null;
  active: string;
}

interface ForwardingTableResult {
  updated_at: string;
  table: ForwardingTableEntry[];
}

interface Props {
  nodes: Node[];
  apiBaseUrl: string;
}

interface NodeOption {
  value: string;
  label: string;
  node: Node;
}

function formatTable(table: ForwardingTableEntry[]): string {
  if (!table || table.length === 0) return 'No entries found.';
  const headers = [
    'name', 'in_interface', 'svlan', 'cvlan', 'out_interface',
    'pop_tags', 'push_svlan', 'push_cvlan', 'active'
  ];
  const colWidths = headers.map(h =>
    Math.max(
      h.length,
      ...table.map(row => String(row[h as keyof ForwardingTableEntry] ?? '').length)
    )
  );
  const pad = (str: string, len: number) => str + ' '.repeat(len - str.length);
  const headerLine = '| ' + headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |';
  const sepLine = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const rows = table.map(row =>
    '| ' +
    headers.map((h, i) => pad(String(row[h as keyof ForwardingTableEntry] ?? ''), colWidths[i])).join(' | ') +
    ' |'
  );
  return [sepLine, headerLine, sepLine, ...rows, sepLine].join('\n');
}

export default function EbpfRuleManager({ nodes, apiBaseUrl }: Props) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(false);
  const [table, setTable] = useState<ForwardingTableResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [manageRule, setManageRule] = useState<ForwardingTableEntry | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<ForwardingTableEntry | null>(null);
  const [processedMsg, setProcessedMsg] = useState<string | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [addFields, setAddFields] = useState<ForwardingTableEntry>({
    name: '',
    in_interface: '',
    svlan: '',
    cvlan: '',
    out_interface: '',
    pop_tags: '',
    push_svlan: '',
    push_cvlan: '',
    active: 'Disabled',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [ifaceOptions, setIfaceOptions] = useState<string[]>([]);
  const [ifaceLoading, setIfaceLoading] = useState(false);
  const [ifaceError, setIfaceError] = useState<string | null>(null);
  const [hideEgress, setHideEgress] = useState(true); // Por defecto activado

  const nodeOptions: NodeOption[] = nodes.map(n => ({
    value: n.id,
    label: `${n.node_id || n.id} (${n.ip || 'Sin IP'})`,
    node: n,
  }));

  const fetchTable = async (node: Node): Promise<ForwardingTableEntry[] | null> => {
    setLoading(true);
    setError(null);
    setTable(null);
    try {
      const res = await fetch(`${apiBaseUrl}/nodes/${node.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'xdp-switch show-forwarding json' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.output || typeof data.output.table !== 'string') {
        throw new Error('No forwarding table data or invalid format.');
      }
      const parsedTable = JSON.parse(data.output.table);
      if (!Array.isArray(parsedTable)) {
        throw new Error('Parsed table is not an array.');
      }
      const formattedTable: ForwardingTableEntry[] = parsedTable.map((entry: any) => ({
        name: entry.name || '',
        in_interface: entry.in_interface || '',
        svlan: entry.match_svlan || null, // Changed from entry.svlan
        cvlan: entry.match_cvlan || null, // Changed from entry.cvlan
        out_interface: entry.out_interface || '',
        pop_tags: entry.pop_tags !== undefined && entry.pop_tags !== null ? String(entry.pop_tags) : '0', // Ensure pop_tags is a string
        push_svlan: entry.push_svlan !== undefined && entry.push_svlan !== null ? String(entry.push_svlan) : null, // Ensure push_svlan is a string or null
        push_cvlan: entry.push_cvlan !== undefined && entry.push_cvlan !== null ? String(entry.push_cvlan) : null, // Ensure push_cvlan is a string or null
        active: entry.active ? 'Forwarding' : 'Disabled',
      }));

      setTable({ updated_at: new Date().toISOString(), table: formattedTable });
      setLastRefresh(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
      return formattedTable;
    } catch (e: any) {
      setError(e.message || 'Error fetching table');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchInterfaces = async (node: Node) => {
    setIfaceLoading(true);
    setIfaceError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/nodes/${node.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'show interfaces' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Suponiendo que la salida está en data.output.stdout o similar
      const output = (data.output?.stdout || data.output || '')
        .replace(/\x1b\[[0-9;]*m/g, ''); // Elimina códigos de color ANSI
      // Parsear nombres de interfaces (primer campo de cada línea, ignorando encabezados y líneas vacías)
      const ifaces = output
        .split('\n')
        .map((line: string) => line.trim().split(/\s+/)[0])
        .map((name: string) => name.replace(/[^a-zA-Z0-9:_-]/g, '')) // <-- limpia caracteres raros
        .filter((name: string) =>
          name &&
          !name.startsWith('test/') &&
          name !== 'lo' &&
          !name.startsWith('>') &&
          !name.startsWith('-')
        );
      setIfaceOptions(ifaces);
    } catch (e: any) {
      setIfaceError(e.message || 'Error fetching interfaces');
      setIfaceOptions([]);
    } finally {
      setIfaceLoading(false);
    }
  };

  const handleRuleAction = async (action: 'enable' | 'disable' | 'delete' | 'update' | 'refresh') => {
    if (!selectedNode || !manageRule) return;
    setManageLoading(true);
    setManageError(null);
    try {
      let command = '';
      setProcessedMsg(null);
      if (action === 'enable') command = `xdp-switch enable-rule ${manageRule.name}`;
      if (action === 'disable') command = `xdp-switch disable-rule ${manageRule.name}`;
      if (action === 'delete') command = `xdp-switch delete-rule ${manageRule.name}`;
      if (action === 'refresh') {
        const updatedTable = await fetchTable(selectedNode);
        if (updatedTable) {
          const updated = updatedTable.find(r => r.name === manageRule.name);
          if (updated) {
            setManageRule({ ...updated });
            setEditFields({ ...updated });
          }
        }
        setManageLoading(false);
        return;
      }
      if (action === 'update' && editFields) {
        await fetch(`${apiBaseUrl}/nodes/${selectedNode.id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `xdp-switch delete-rule ${manageRule.name}` }),
        });

        // Normaliza los campos igual que en el add
        const svlan = editFields.svlan && editFields.svlan.trim() !== '' ? editFields.svlan : null;
        const cvlan = editFields.cvlan && editFields.cvlan.trim() !== '' ? editFields.cvlan : null;
        const push_svlan = editFields.push_svlan && editFields.push_svlan.trim() !== '' ? editFields.push_svlan : null;
        const push_cvlan = editFields.push_cvlan && editFields.push_cvlan.trim() !== '' ? editFields.push_cvlan : null;
        const pop_tags = editFields.pop_tags && editFields.pop_tags.trim() !== '' ? editFields.pop_tags : 0;

        const createCmd = `xdp-switch create-rule name ${editFields.name} in_interface ${editFields.in_interface} svlan ${svlan} cvlan ${cvlan} out_interface ${editFields.out_interface} pop_tags ${pop_tags} push_svlan ${push_svlan} push_cvlan ${push_cvlan}`;
        await fetch(`${apiBaseUrl}/nodes/${selectedNode?.id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: createCmd }),
        });
        await fetchTable(selectedNode);
        setManageRule(null);
        setManageLoading(false);
        return;
      }
      if (command) {
        await fetch(`${apiBaseUrl}/nodes/${selectedNode.id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const updatedTable = await fetchTable(selectedNode);
        if (updatedTable) {
          const updated = updatedTable.find(r => r.name === manageRule.name);
          if (updated) {
            setManageRule({ ...updated });
            setEditFields({ ...updated });
          }
        }
        setProcessedMsg('Processed');
        if (action === 'delete') setManageRule(null);
        setManageLoading(false);
        return;
      }
    } catch (e: any) {
      setManageError(e.message || 'Error');
      setManageLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex w-full items-center gap-2">
          <div className="w-full md:w-96">
            <Select<NodeOption>
              options={nodeOptions}
              value={selectedNode ? nodeOptions.find(o => o.value === selectedNode.id) || null : null}
              onChange={option => {
                setSelectedNode(option ? option.node : null);
                if (option) fetchTable(option.node);
              }}
              placeholder="Select a node..."
              isClearable
              classNamePrefix="react-select"
              styles={{
                control: (base) => ({ ...base, backgroundColor: '#202020', borderColor: '#374151', color: '#e5e7eb' }),
                menu: (base) => ({ ...base, backgroundColor: '#202020', color: '#e5e7eb' }),
                singleValue: (base) => ({ ...base, color: '#e5e7eb' }),
                input: (base) => ({ ...base, color: '#e5e7eb' }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isFocused ? '#010101' : '#202020',
                  color: state.isFocused ? '#fff' : '010101',
                }),
              }}
            />
          </div>
          {selectedNode && (
            <div className="flex flex-1 justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <button
                  className="bg-[#c6441a] hover:bg-[#c6441a] text-white px-4 py-2 rounded"
                  onClick={() => fetchTable(selectedNode)}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hide-egress"
                    checked={hideEgress}
                    onChange={e => setHideEgress(e.target.checked)}
                    className="accent-[#c6441a] w-4 h-4"
                  />
                  <label htmlFor="hide-egress" className="text-sm text-gray-200 select-none cursor-pointer">
                    Hide egress rules
                  </label>
                </div>
              </div>
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                onClick={async () => {
                  setAddFields({
                    name: '',
                    in_interface: '',
                    svlan: '',
                    cvlan: '',
                    out_interface: '',
                    pop_tags: '',
                    push_svlan: '',
                    push_cvlan: '',
                    active: 'Disabled',
                  });
                  setAddError(null);
                  setAddSuccess(null);
                  setShowAddRule(true);
                  if (selectedNode) await fetchInterfaces(selectedNode);
                }}
              >
                + Add Rule
              </button>
            </div>
          )}
        </div>
      </div>
      {selectedNode && (
        <div className="mt-10">
          <div className="bg-[#202020] rounded p-4 mt-2 font-mono text-sm text-gray-200 overflow-x-auto border border-gray-500">
            <div className="mb-2 text-white-300 text-lg">
            <div className="mt-1">
            </div>
              • eBPF Rules present in XDP Forwarding table:
            {lastRefresh && (
                <> <span className="text-gray-400">({lastRefresh})</span></>
              )}
            </div>
            <div className="mt-8">
            </div>
            {error && <div className="text-red-400">{error}</div>}
            {loading && <div className="text-gray-400">Loading...</div>}
            {!loading && table && Array.isArray(table.table) && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-500 rounded text-base">
                  <thead>
                    <tr className="bg-[#202020]">
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Name</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">In Interface</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">SVLAN</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">CVLAN</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Out Interface</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Pop Tags</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Push SVLAN</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Push CVLAN</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Active</th>
                      <th className="px-3 py-2 border-b border-gray-500 font-semibold text-blue-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.table
                    .filter(row => !hideEgress || !row.name.startsWith('egress-')) // <-- filtro aquí
                    .map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-[#202020]" : "bg-[#202020]"}>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.name}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.in_interface}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.svlan ?? ''}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.cvlan ?? ''}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.out_interface}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.pop_tags}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.push_svlan ?? ''}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">{row.push_cvlan ?? ''}</td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">
                          <span className={row.active === 'Forwarding' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                          {row.active}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-800 text-center">
                          <button
                            className="bg-[#c6441a] hover:bg-[#c6441a] text-white px-2 py-1 rounded text-xs"
                            onClick={async () => {
                              const updatedTable = await fetchTable(selectedNode!);
                              if (updatedTable) {
                                const updated = updatedTable.find(r => r.name === row.name);
                                if (updated) {
                                  setManageRule({ ...updated });
                                  setEditFields({ ...updated });
                                } else {
                                  setManageRule({ ...row }); // fallback
                                  setEditFields({ ...row });
                                }
                              } else {
                                setManageRule({ ...row }); // fallback
                                setEditFields({ ...row });
                              }
                            }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && table && typeof table.table === 'string' && (
              <pre className="whitespace-pre text-lg">{table.table}</pre>
            )}
            {!loading && !table && !error && (
              <div className="text-gray-400">No forwarding table data.</div>
            )}
          </div>
        </div>
      )}
      {manageRule && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          {/* @ts-ignore */}
          <Draggable handle=".modal-drag-handle">
            <div className="bg-[#202020] rounded-lg p-6 w-full max-w-2xl border border-gray-500 relative cursor-default">
              <div className="modal-drag-handle cursor-move flex items-center justify-between mb-4 select-none">
                <h2 className="text-lg font-bold text-[#c6441a]">
                  Forwarding rule <span className="text-white">{manageRule.name}</span> in  <span className="text-white">
                    {selectedNode?.node_id || selectedNode?.id}
                  </span>
                </h2>
                <button
                  className="bg-[#c6441a] hover:bg-[#c6441a] px-3 py-1 rounded text-white ml-4"
                  onClick={() => handleRuleAction('refresh')}
                  disabled={manageLoading}
                >Refresh</button>
                <button
                  className="absolute top-2 right-2 text-gray-400 hover:text-white"
                  onClick={() => setManageRule(null)}
                >✕</button>
              </div>
              {manageError && <div className="text-red-400 mb-2">{manageError}</div>}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleRuleAction('update');
                }}
              >
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {/* Títulos de columna */}
                  <div className="col-span-1 mb-2">
                    <span className="text-[#c6441a] font-semibold text-base">Ingress</span>
                  </div>
                  <div className="col-span-1 mb-2">
                    <span className="text-[#c6441a] font-semibold text-base">Egress</span>
                  </div>
                  {/* Columna izquierda: Ingress */}
                  <div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Name:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.name : manageRule.name}
                        disabled
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">In Interface:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.in_interface : manageRule.in_interface}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), in_interface: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">SVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.svlan ?? '' : manageRule.svlan ?? ''}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), svlan: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">CVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.cvlan ?? '' : manageRule.cvlan ?? ''}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), cvlan: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  {/* Columna derecha: Egress */}
                  <div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Out Interface:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.out_interface : manageRule.out_interface}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), out_interface: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Pop Tags:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.pop_tags : manageRule.pop_tags}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), pop_tags: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Push SVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.push_svlan ?? '' : manageRule.push_svlan ?? ''}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), push_svlan: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Push CVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={editFields ? editFields.push_cvlan ?? '' : manageRule.push_cvlan ?? ''}
                        disabled={manageRule.active === 'Forwarding'}
                        onChange={e =>
                          setEditFields(f => ({ ...(f ?? manageRule), push_cvlan: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
                {/* Estado activo */}
                <div className="flex items-center mt-6 mb-8">
                  <span className="font-semibold text-gray-300 mr-2">Forwarding state:</span>
                  <span className={manageRule.active === 'Forwarding' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {manageRule.active}
                  </span>
                </div>
                {/* Botones abajo */}
                <div className="flex justify-between items-center mt-8">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={
                        manageRule.active === 'Forwarding'
                          ? "bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white font-semibold"
                          : "bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white font-semibold"
                      }
                      onClick={() => handleRuleAction(manageRule.active === 'Forwarding' ? 'disable' : 'enable')}
                      disabled={manageLoading}
                    >
                      {manageRule.active === 'Forwarding' ? 'Disable' : 'Enable'}
                    </button>
                      <div className="w-full flex justify-center mt-2">
                      <span className="text-gray-500 text-xs font-mono">
                        - Might prompt for sudo password on host.
                      </span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-white font-semibold"
                      disabled={manageRule.active === 'Forwarding' || manageLoading}
                    >Update</button>
                    <button
                      type="button"
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white font-semibold"
                      onClick={() => handleRuleAction('delete')}
                      disabled={manageRule.active === 'Forwarding' || manageLoading}
                    >Delete</button>
                  </div>
                </div>
                {manageLoading && <div className="text-gray-400 mt-4">Processing...</div>}
                {processedMsg && !manageLoading && <div className="text-[#c6441a] mt-4">{processedMsg}</div>}
              </form>
            </div>
          </Draggable>
        </div>
      )}
      {showAddRule && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          {/* @ts-ignore */}
          <Draggable handle=".modal-drag-handle">
            <div className="bg-[#202020] rounded-lg p-6 w-full max-w-2xl border border-gray-500 relative cursor-default">
              <div className="modal-drag-handle cursor-move flex items-center justify-between mb-4 select-none">
                <h2 className="text-lg font-bold text-green-300">
                  Create forwarding rule
                </h2>
                <button
                  className="absolute top-2 right-2 text-gray-400 hover:text-white"
                  onClick={() => setShowAddRule(false)}
                >✕</button>
              </div>
              {addError && <div className="text-red-400 mb-2">{addError}</div>}
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  setAddLoading(true);
                  setAddError(null);
                  setAddSuccess(null);
                  try {
                    // Si el campo está vacío, usa null para svlan/cvlan y 0 para push_svlan/push_cvlan
                    const svlan = addFields.svlan && addFields.svlan.trim() !== '' ? addFields.svlan : null;
                    const cvlan = addFields.cvlan && addFields.cvlan.trim() !== '' ? addFields.cvlan : null;
                    const push_svlan = addFields.push_svlan && addFields.push_svlan.trim() !== '' ? addFields.push_svlan : null;
                    const push_cvlan = addFields.push_cvlan && addFields.push_cvlan.trim() !== '' ? addFields.push_cvlan : null;
                    const pop_tags = addFields.pop_tags && addFields.pop_tags.trim() !== '' ? addFields.pop_tags : 0;
                    const createCmd = `xdp-switch create-rule name ${addFields.name} in_interface ${addFields.in_interface} svlan ${svlan} cvlan ${cvlan} out_interface ${addFields.out_interface} pop_tags ${pop_tags} push_svlan ${push_svlan} push_cvlan ${push_cvlan}`;
                    await fetch(`${apiBaseUrl}/nodes/${selectedNode?.id}/execute`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: createCmd }),
                    });
                    await fetchTable(selectedNode!);
                    setAddSuccess('Rule created!');
                    setShowAddRule(false);
                  } catch (e: any) {
                    setAddError(e.message || 'Error creating rule');
                  } finally {
                    setAddLoading(false);
                  }
                }}
              >
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <div className="col-span-1 mb-2">
                    <span className="text-[#c6441a] font-semibold text-base">Ingress</span>
                  </div>
                  <div className="col-span-1 mb-2">
                    <span className="text-[#c6441a] font-semibold text-base">Egress</span>
                  </div>
                  {/* Ingress */}
                  <div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Name:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.name}
                        required
                        onChange={e => setAddFields(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">In Interface:</label>
                      <select
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.in_interface}
                        required
                        onChange={e => setAddFields(f => ({ ...f, in_interface: e.target.value }))}
                      >
                        <option value="">Select...</option>
                        {ifaceOptions.map(iface => (
                          <option key={iface} value={iface}>{iface}</option>
                        ))}
                      </select>
                      {ifaceLoading && <div className="text-gray-400 text-xs">Loading interfaces...</div>}
                      {ifaceError && <div className="text-red-400 text-xs">{ifaceError}</div>}
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">SVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.svlan ?? ''}
                        onChange={e => setAddFields(f => ({ ...f, svlan: e.target.value }))}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">CVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.cvlan ?? ''}
                        onChange={e => setAddFields(f => ({ ...f, cvlan: e.target.value }))}
                      />
                    </div>
                  </div>
                  {/* Egress */}
                  <div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Out Interface:</label>
                      <select
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.out_interface}
                        required
                        onChange={e => setAddFields(f => ({ ...f, out_interface: e.target.value }))}
                      >
                        <option value="">Select...</option>
                        {ifaceOptions.map(iface => (
                          <option key={iface} value={iface}>{iface}</option>
                        ))}
                      </select>
                      {ifaceLoading && <div className="text-gray-400 text-xs">Loading interfaces...</div>}
                      {ifaceError && <div className="text-red-400 text-xs">{ifaceError}</div>}
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Pop Tags:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.pop_tags}
                        onChange={e => setAddFields(f => ({ ...f, pop_tags: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Push SVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.push_svlan ?? ''}
                        onChange={e => setAddFields(f => ({ ...f, push_svlan: e.target.value }))}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="block text-gray-300">Push CVLAN:</label>
                      <input
                        className="w-full bg-[#202020] border border-gray-500 rounded px-2 py-1 text-gray-100"
                        value={addFields.push_cvlan ?? ''}
                        onChange={e => setAddFields(f => ({ ...f, push_cvlan: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-8">
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white font-semibold"
                    disabled={addLoading}
                  >
                    {addLoading ? 'Creating...' : 'Create Rule'}
                  </button>
                </div>
              </form>
            </div>
          </Draggable>
        </div>
      )}
    </div>
  );
}