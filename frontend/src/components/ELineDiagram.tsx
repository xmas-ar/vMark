import React, { useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  Node,
  Edge,
  Position,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ELineService, ForwardingRule } from '../types';

interface CustomNodeData {
  label: string;
  type: 'nodeA' | 'nodeZ' | 'connection'; // Changed 'cloud' to 'connection'
  ip?: string;
  ruleName?: string;
  rule?: ForwardingRule | null;
  imageSrc?: string; // For the connection node
}

// --- VMarkNode Component ---
const VMarkNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  const { label, ip, ruleName, rule, type: nodeTypeFromData } = data;

  const formatVlan = (vlan: number | string | null | undefined): string => {
    if (vlan === null || vlan === undefined || String(vlan).toLowerCase() === 'none' || String(vlan).trim() === '') return 'Any';
    return String(vlan);
  };
  const formatPushVlan = (vlan: number | string | null | undefined): string => {
    if (vlan === null || vlan === undefined || String(vlan).toLowerCase() === 'none' || String(vlan).trim() === '') return '';
    return String(vlan);
  };

  const renderRuleDetails = (isIngressRule: boolean) => {
    if (!rule) return null;

    const interfaceName = isIngressRule ? (rule.in_interface || 'N/A') : (rule.out_interface || 'N/A');
    let titleText = '';

    if (nodeTypeFromData === 'nodeA') {
      if (isIngressRule) { // Left box for Node A (Ingress)
        titleText = `${interfaceName}`;
      } else { // Right box for Node A (Egress)
        titleText = `${interfaceName}`;
      }
    } else { // nodeTypeFromData === 'nodeZ'
      if (isIngressRule) { // Right box for Node Z (Ingress)
        titleText = `${interfaceName}`;
      } else { // Left box for Node Z (Egress)
        titleText = `${interfaceName}`;
      }
    }
    
    const ruleStatusColor = rule.active ? 'text-green-300' : 'text-red-300';
    const ruleStatusText = rule.active ? 'Yes' : 'No';

    return (
      <div className="bg-[#2d2d2d] p-1 rounded text-[8px] w-[80px] h-16 shadow-md flex flex-col justify-between">
        <div>
          <p className="font-mono mb-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">{titleText}</p>
          {isIngressRule ? (
            <>
              <p>Match C-VLAN: <span className="text-yellow-300 font-medium">{formatVlan(rule.match_cvlan)}</span></p>
              <p>Match S-VLAN: <span className="text-yellow-300 font-medium">{formatVlan(rule.match_svlan)}</span></p>
            </>
          ) : (
            <>
              <p>Pop Tags: <span className="text-yellow-300 font-medium">{rule.pop_tags !== null && rule.pop_tags !== undefined ? String(rule.pop_tags) : '0'}</span></p>
              {formatPushVlan(rule.push_cvlan) && <p>Push C-VLAN: <span className="text-yellow-300 font-medium">{formatPushVlan(rule.push_cvlan)}</span></p>}
              {formatPushVlan(rule.push_svlan) && <p>Push S-VLAN: <span className="text-yellow-300 font-medium">{formatPushVlan(rule.push_svlan)}</span></p>}
              {(!formatPushVlan(rule.push_svlan) && !formatPushVlan(rule.push_cvlan)) && <p className="text-gray-500">Push: None</p>}
            </>
          )}
        </div>
      </div>
    );
  };

  const leftBoxIsIngress = nodeTypeFromData === 'nodeA';
  const rightBoxIsIngress = nodeTypeFromData === 'nodeZ';

  // For Node A: Left box is Ingress, Right box is Egress
  // For Node Z: Left box is Egress, Right box is Ingress
  const leftDetailsContent = renderRuleDetails(leftBoxIsIngress);
  const rightDetailsContent = renderRuleDetails(rightBoxIsIngress);


  return (
    <div className="rounded-md text-white flex flex-col items-center w-[480px]"> {/* Increased width for new layout */}
      {/* Image centered above */}
      <div className="flex justify-center mb-1">
        <img 
          src="/logos/vmark_rectanglev2.png" 
          alt="vMark Node" 
          className={`h-28 w-22 rounded-md shadow-lg ${nodeTypeFromData === 'nodeA' ? 'border-[#ea6508]' : 'border-purple-500'}`} 
        />
      </div>

      {/* Layout: Rule Details (Left) - General Info (Center) - Rule Details (Right) */}
      {/* Changed gap-2 to gap-1 */}
      <div className="flex flex-row items-start justify-center w-full mt-1 gap-1">
        {leftDetailsContent} {/* Ingress for Node A, Egress for Node Z */}
        
        {/* General Node Info - Centered between rule details */}
        {/* Changed w-40 to w-36 */}
        <div className="text-center flex-shrink-0 w-24"> 
          <div className="font-bold text-[12px]">{label}</div>
          {ip && <div className="text-[9px] text-gray-400">IP: {ip}</div>}
          {ruleName && <div className="text-[9px] text-gray-400">Rule: <span className="font-semibold text-gray-400">{ruleName}</span></div>}
          {rule && (
            <div className={`text-[9px] font-semibold ${rule.active ? 'text-green-300' : 'text-red-300'}`}>
              Status: {rule.active ? 'Active' : 'Inactive'}
            </div>
          )}
        </div>

        {rightDetailsContent} {/* Egress for Node A, Ingress for Node Z */}
      </div>
    </div>
  );
};

// --- ConnectionNode (replaces CloudNode) ---
const ConnectionNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  return (
    <div className="flex items-center justify-center">
      <img 
        src={data.imageSrc || "/icons/arrow-orange-double-in-ap.png"} // Default to arrow-orange-double.png
        alt={data.label || "Connection"} 
        className="w-16 h-16 object-contain" // Adjust size as needed
      />
    </div>
  );
};

const nodeTypes = {
  vmarkNode: VMarkNode,
  connectionNode: ConnectionNode, // Changed from cloudNode
};

interface ELineDiagramProps {
  service: ELineService;
}

const ELineDiagramContent: React.FC<ELineDiagramProps> = ({ service }) => {
  const isOneNodeEline = !service.z_node_id; // Determina si es un One-node E-Line

  // Determina el estado general del servicio
  const isServiceActive = useMemo(() => {
    if (isOneNodeEline) {
      // Para servicios de un nodo, depende solo de la regla de Node A
      return service.a_rule_data?.active || false;
    }
    // Para servicios normales, depende de ambas reglas
    return service.a_rule_data?.active && service.z_rule_data?.active;
  }, [isOneNodeEline, service.a_rule_data, service.z_rule_data]);

  const nodes = useMemo((): Node<CustomNodeData>[] => {
    if (isOneNodeEline) {
      // Lógica para One-node E-Line
      return [
        {
          id: 'left-ingress',
          type: 'connectionNode',
          position: { x: 60, y: 30 }, // Posición a la izquierda del nodo
          data: {
            label: 'Service Connection',
            type: 'connection',
            imageSrc: "/icons/arrow-orange-right.png", // Flecha apuntando hacia la derecha
          },
          draggable: false,
          selectable: false,
        },
        {
          id: 'node-a',
          type: 'vmarkNode',
          position: { x: 0, y: 10 }, // Nodo centrado
          data: {
            label: `Node A: ${service.a_node_id}`,
            type: 'nodeA',
            ip: service.a_node_ip,
            ruleName: service.a_rule_name,
            rule: service.a_rule_data,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        },
        {
          id: 'right-egress',
          type: 'connectionNode',
          position: { x: 350, y: 30 }, // Posición a la derecha del nodo
          data: {
            label: 'Service Connection',
            type: 'connection',
            imageSrc: "/icons/arrow-orange-right.png", // Flecha apuntando hacia la izquierda
          },
          draggable: false,
          selectable: false,
        },
      ];
    }

    // Lógica existente para servicios normales (dos nodos)
    if (!service.a_rule_data || !service.z_rule_data) {
      console.warn("Diagram: Missing a_rule_data or z_rule_data for service:", service.name, service);
      return [];
    }
    return [
      {
        id: 'left-ingress',
        type: 'connectionNode',
        position: { x: 50, y: 25 },
        data: {
          label: 'Service Connection',
          type: 'connection',
          imageSrc: "/icons/arrow-orange-right.png",
        },
        draggable: false,
        selectable: false,
      },
      {
        id: 'node-a',
        type: 'vmarkNode',
        position: { x: 0, y: 0 },
        data: {
          label: `Node A: ${service.a_node_id}`,
          type: 'nodeA',
          ip: service.a_node_ip,
          ruleName: service.a_rule_name,
          rule: service.a_rule_data,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
      {
        id: 'connection',
        type: 'connectionNode',
        position: { x: 360, y: 25 },
        data: {
          label: 'Service Connection',
          type: 'connection',
          imageSrc: "/icons/arrow-orange-double-in-ap.png",
        },
        draggable: false,
        selectable: false,
      },
      {
        id: 'node-z',
        type: 'vmarkNode',
        position: { x: 310, y: 0 },
        data: {
          label: `Node Z: ${service.z_node_id}`,
          type: 'nodeZ',
          ip: service.z_node_ip,
          ruleName: service.z_rule_name,
          rule: service.z_rule_data,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
      {
        id: 'right-ingress',
        type: 'connectionNode',
        position: { x: 680, y: 25 },
        data: {
          label: 'Service Connection',
          type: 'connection',
          imageSrc: "/icons/arrow-orange-left.png",
        },
        draggable: false,
        selectable: false,
      },
    ];
  }, [service, isOneNodeEline]);

  if (isOneNodeEline) {
    return (
      <div style={{ height: '300px', width: '100%' }} className="bg-[#202020] rounded-lg">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ minZoom: 1.5 }}
          className="bg-[#202020]"
        >
          <Background color="#4B5563" gap={15} />
        </ReactFlow>
        <p className={`text-left font-semibold mt-4 p-2 ${isServiceActive ? 'text-green-400' : 'text-red-400'}`}>
          One-node E-Line Service Status: {isServiceActive ? 'Active' : 'Inactive'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '300px', width: '100%' }} className="bg-[#202020] rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ minZoom: 1.5 }}
        className="bg-[#202020]"
      >
        <Background color="#4B5563" gap={15} />
      </ReactFlow>
      <p className={`text-left font-semibold mt-4 p-2 ${isServiceActive ? 'text-green-400' : 'text-red-400'}`}>
        Overall E-Line Service Status: {isServiceActive ? 'Active' : 'Inactive'}
      </p>
    </div>
  );
};

const ELineDiagram: React.FC<ELineDiagramProps> = (props) => (
  <ReactFlowProvider>
    <ELineDiagramContent {...props} />
  </ReactFlowProvider>
);

export default ELineDiagram;