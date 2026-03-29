import React from 'react';
import { VexFlowRenderer } from './dreamflow/VexFlowRenderer';

/**
 * Modernized NotationView using the DreamFlow MIDI Rendering Engine.
 * This component acts as a lightweight wrapper around the VexFlowRenderer,
 * providing the IntermediateScore data fetched from Phase 3C.
 */
export default function NotationView({ phase3cData, darkMode = true }) {
  if (!phase3cData || !phase3cData.measures) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%', 
        color: darkMode ? '#666' : '#999',
        fontSize: '14px',
        fontFamily: 'Inter, sans-serif',
        background: darkMode ? '#0d0d12' : '#f8f9fa'
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
        background: darkMode ? '#0d0d12' : '#f8f9fa', 
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 0.3s ease'
      }} 
    >
      <div style={{ flex: 1, minWidth: 'fit-content' }}>
        <VexFlowRenderer 
          score={phase3cData} 
          musicFont="Bravura" 
          darkMode={darkMode} 
        />
      </div>
      
      <style jsx global>{`
        .notation-view-root::-webkit-scrollbar {
          height: 8px;
        }
        .notation-view-root::-webkit-scrollbar-track {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
        }
        .notation-view-root::-webkit-scrollbar-thumb {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          border-radius: 4px;
        }
        .notation-view-root::-webkit-scrollbar-thumb:hover {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        }
        
        /* Ensure VexFlow SVG scales properly within the container */
        .vexflow-container svg {
          filter: ${darkMode ? 'none' : 'none'}; /* We handle colors via setStyle, but filter can be used for extra contrast if needed */
        }
      `}</style>
    </div>
  );
}
