import json
import sys
import os

def build_osmd_hierarchy(notes, ticks_per_measure):
    """
    Transforms a flat list of quantized notes into an OSMD-ready hierarchy:
    Measure -> Staff (RH/LH) -> Tick -> [Notes]
    """
    hierarchy = {}
    
    # Pre-sort notes to ensure stable assignment
    notes.sort(key=lambda x: (x['quantized']['measure'], x['quantized']['abs_tick_start'], -x['pitch']))

    for n in notes:
        m_num = n['quantized']['measure']
        q = n['quantized']
        tick = q['abs_tick_start']
        v_tag = n.get('voice_tag', 'Overflow (Chord)')
        
        # 1. Map Threads to Staves
        if v_tag in ['Voice 1', 'Voice 2']:
            staff = 'RH'
        elif v_tag in ['Voice 3', 'Voice 4']:
            staff = 'LH'
        else:
            # Handle Overflow: find the closest pitch currently starting on this tick
            concurrent_notes = [other for other in notes if other['quantized']['abs_tick_start'] == tick and other != n]
            if concurrent_notes:
                closest = min(concurrent_notes, key=lambda x: abs(x['pitch'] - n['pitch']))
                staff = 'RH' if closest.get('voice_tag') in ['Voice 1', 'Voice 2'] else 'LH'
            else:
                staff = 'RH' if n['pitch'] >= 60 else 'LH' # Fallback only if totally isolated

        # 2. Build Hierarchy
        if m_num not in hierarchy:
            hierarchy[m_num] = {'RH': {}, 'LH': {}}
            
        if tick not in hierarchy[m_num][staff]:
            hierarchy[m_num][staff][tick] = []
            
        # Clean up the output for the OSMD renderer
        hierarchy[m_num][staff][tick].append({
            'pitch': n['pitch'],
            'duration_ticks': q['duration_ticks'],
            'voice_tag': v_tag,
            'color': n.get('hue') # Pass the Phase 1 harmonic color through for the visualizer!
        })

    return hierarchy


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python phase3c_notation.py <phase3b_quantize_json> [<phase3_grid_json>]")
        sys.exit(1)
        
    p3b_path = sys.argv[1]
    
    with open(p3b_path, 'r') as f:
        data = json.load(f)
        
    ticks_per_measure = 16 # Default fallback
    if len(sys.argv) >= 3:
        try:
            with open(sys.argv[2], 'r') as f:
                grid_data = json.load(f)
                beats_per_measure = grid_data.get('beats_per_measure', 4)
                subdivision = grid_data.get('subdivision', 4)
                ticks_per_measure = beats_per_measure * subdivision
        except FileNotFoundError:
            pass

    notes = data.get('notes', [])
    valid_notes = [n for n in notes if 'quantized' in n]
    
    hierarchy = build_osmd_hierarchy(valid_notes, ticks_per_measure)
    
    # Save output
    basename = os.path.basename(p3b_path)
    out_name = basename.replace('phase3b_quantized_', 'phase3c_osmd_ready_')
    out_path = os.path.join(os.path.dirname(p3b_path), out_name)
    
    with open(out_path, 'w') as f:
        json.dump({
            "ticks_per_measure": ticks_per_measure,
            "measures": hierarchy
        }, f, indent=2)
        
    print(f"Phase 3C OSMD mapping complete! Wrote to {out_path}")
