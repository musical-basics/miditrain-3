import React from 'react';
import { VexFlowRenderer } from './dreamflow/VexFlowRenderer';

/**
 * Modernized NotationView using the DreamFlow MIDI Rendering Engine.
 * This component acts as a lightweight wrapper around the VexFlowRenderer,
 * providing the IntermediateScore data fetched from Phase 3C.
 */
export default function NotationView({ phase3cData }) {
  if (!phase3cData || !phase3cData.measures) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%', 
        color: '#666',
        fontSize: '14px',
        fontFamily: 'Inter, sans-serif'
      }}>
        No notation data available. Please run the ETME Engine.
      </div>
    );
  }

  return (
    <div 
      className="notation-view-root"
      style={{ 
        width: '100%', 
        height: '100%', 
        overflowX: 'auto', 
        overflowY: 'hidden',
        background: '#0d0d12', // Match visualizer dark theme
        padding: '20px',
        display: 'flex',
        flexDirection: 'column'
      }} 
    >
      <div style={{ flex: 1, minWidth: 'fit-content' }}>
        <VexFlowRenderer 
          score={phase3cData} 
          musicFont="Bravura" 
          darkMode={true} 
        />
      </div>
      
      <style jsx global>{`
        .notation-view-root::-webkit-scrollbar {
          height: 8px;
        }
        .notation-view-root::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .notation-view-root::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .notation-view-root::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        /* Ensure VexFlow SVG scales properly within the container */
        .vexflow-container svg {
          filter: drop-shadow(0 0 2px rgba(255,255,255,0.05));
        }
      `}</style>
    </div>
  );
}
