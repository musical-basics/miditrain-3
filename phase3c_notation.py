import json
import sys
import os

def midi_to_vex(midi):
    """Converts MIDI pitch to VexFlow key string like 'c/4'"""
    notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
    name = notes[midi % 12]
    octave = (midi // 12) - 1
    return f"{name}/{octave}"

def get_accidental(key):
    """Extracts accidental from VexFlow key string"""
    if '#' in key: return '#'
    if 'b' in key: return 'b'
    return None

def get_vex_duration(dur_ticks, ticks_per_measure, beats_per_measure):
    """
    Approximates VexFlow duration string from ticks.
    Simplistic mapping for now focusing on standard values.
    """
    ticks_per_whole = (ticks_per_measure / beats_per_measure) * 4
    ratio = dur_ticks / ticks_per_whole
    
    # Standard VexFlow durations
    durs = [
        (1.0, 'w', 0),
        (0.75, 'h', 1),
        (0.5, 'h', 0),
        (0.375, 'q', 1),
        (0.25, 'q', 0),
        (0.1875, '8', 1),
        (0.125, '8', 0),
        (0.09375, '16', 1),
        (0.0625, '16', 0),
        (0.03125, '32', 0)
    ]
    
    closest = min(durs, key=lambda d: abs(ratio - d[0]))
    return closest[1], closest[2]

def build_dreamflow_score(notes, ticks_per_measure, beats_per_measure, time_sig_num, time_sig_den):
    """
    Transforms flat list of quantized notes into an IntermediateScore JSON structure.
    """
    # Group notes by measure
    measures_dict = {}
    for n in notes:
        m_num = n['quantized']['measure']
        if m_num not in measures_dict:
            measures_dict[m_num] = []
        measures_dict[m_num].append(n)
        
    sorted_m_nums = sorted(measures_dict.keys())
    
    measures_output = []
    
    for m_num in sorted_m_nums:
        m_notes = measures_dict[m_num]
        
        # IntermediateMeasure structure
        measure_obj = {
            "measureNumber": int(m_num) + 1, # 1-indexed for the renderer
            "staves": [
                {"staffIndex": 0, "clef": "treble", "voices": []}, # Treble (RH)
                {"staffIndex": 1, "clef": "bass", "voices": []}   # Bass (LH)
            ]
        }
        
        if m_num == 0:
            measure_obj["timeSignatureNumerator"] = time_sig_num
            measure_obj["timeSignatureDenominator"] = time_sig_den
            measure_obj["keySignature"] = "C"

        # Group notes by staff and voice
        # Voice mapping: 1,2 -> Treble; 3,4 -> Bass
        voice_map = {
            'Voice 1': (0, 0),
            'Voice 2': (0, 1),
            'Voice 3': (1, 0),
            'Voice 4': (1, 1),
            'Overflow (Chord)': (0, 0) # Fallback
        }
        
        staff_voice_notes = {} # (staff_idx, voice_idx) -> [notes]
        
        for n in m_notes:
            v_tag = n.get('voice_tag', 'Overflow (Chord)')
            staff_idx, voice_idx = voice_map.get(v_tag, (0, 0))
            
            key = (staff_idx, voice_idx)
            if key not in staff_voice_notes:
                staff_voice_notes[key] = []
            staff_voice_notes[key].append(n)
            
        for (staff_idx, voice_idx), v_notes in staff_voice_notes.items():
            # Sort notes by tick
            v_notes.sort(key=lambda x: x['quantized']['abs_tick_start'])
            
            voices_list = measure_obj["staves"][staff_idx]["voices"]
            
            # Find or create voice
            voice_obj = next((v for v in voices_list if v["voiceIndex"] == voice_idx), None)
            if not voice_obj:
                voice_obj = {"voiceIndex": voice_idx, "notes": []}
                voices_list.append(voice_obj)
            
            current_tick = m_num * ticks_per_measure
            
            for vn in v_notes:
                q = vn['quantized']
                start_tick = q['abs_tick_start']
                dur_ticks = q['duration_ticks']
                
                # Handle rests if there is a gap
                if start_tick > current_tick:
                    gap = start_tick - current_tick
                    dur_str, dots = get_vex_duration(gap, ticks_per_measure, beats_per_measure)
                    voice_obj["notes"].append({
                        "keys": ["b/4" if staff_idx == 0 else "d/3"],
                        "duration": dur_str + "r",
                        "dots": dots,
                        "isRest": True,
                        "accidentals": [None],
                        "tiesToNext": [False],
                        "articulations": [],
                        "beat": (current_tick % ticks_per_measure) / (ticks_per_measure / beats_per_measure) + 1,
                        "vfId": f"rest-{current_tick}"
                    })
                
                # Add Note
                vex_key = midi_to_vex(vn['pitch'])
                dur_str, dots = get_vex_duration(dur_ticks, ticks_per_measure, beats_per_measure)
                
                # Build Note object
                note_obj = {
                    "keys": [vex_key],
                    "duration": dur_str,
                    "dots": dots,
                    "isRest": False,
                    "accidentals": [get_accidental(vex_key)],
                    "tiesToNext": [False],
                    "articulations": [],
                    "beat": (start_tick % ticks_per_measure) / (ticks_per_measure / beats_per_measure) + 1,
                    "vfId": f"n-{vn['pitch']}-{start_tick}"
                }
                
                if 'hue' in vn:
                    # Convert hue to HSL string
                    note_obj["color"] = f"hsl({vn['hue']}, 90%, 50%)"
                
                voice_obj["notes"].append(note_obj)
                current_tick = start_tick + dur_ticks

            # Fill remaining measure with rest
            measure_end_tick = (m_num + 1) * ticks_per_measure
            if current_tick < measure_end_tick:
                gap = measure_end_tick - current_tick
                dur_str, dots = get_vex_duration(gap, ticks_per_measure, beats_per_measure)
                voice_obj["notes"].append({
                    "keys": ["b/4" if staff_idx == 0 else "d/3"],
                    "duration": dur_str + "r",
                    "dots": dots,
                    "isRest": True,
                    "accidentals": [None],
                    "tiesToNext": [False],
                    "articulations": [],
                    "beat": (current_tick % ticks_per_measure) / (ticks_per_measure / beats_per_measure) + 1,
                    "vfId": f"rest-end-{current_tick}"
                })
        
        # Ensure staves have voices (even if empty) to satisfy renderer
        for staff in measure_obj["staves"]:
            if not staff["voices"]:
                # Add an empty voice with a whole note rest
                staff["voices"].append({
                    "voiceIndex": 0,
                    "notes": [{
                        "keys": ["b/4" if staff["staffIndex"] == 0 else "d/3"],
                        "duration": "wr",
                        "dots": 0,
                        "isRest": True,
                        "accidentals": [None],
                        "tiesToNext": [False],
                        "articulations": [],
                        "beat": 1,
                        "vfId": f"m-{m_num}-empty-rest"
                    }]
                })

        measures_output.append(measure_obj)
        
    return {"measures": measures_output}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python phase3c_notation.py <phase3b_quantize_json> [<phase3_grid_json>]")
        sys.exit(1)
        
    p3b_path = sys.argv[1]
    
    with open(p3b_path, 'r') as f:
        data = json.load(f)
        
    ticks_per_measure = 16 # Default fallback
    beats_per_measure = 4
    subdivision = 4
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
    
    score = build_dreamflow_score(valid_notes, ticks_per_measure, beats_per_measure, beats_per_measure, 4)
    
    # Save output
    basename = os.path.basename(p3b_path)
    # Keep the same output name so ETMEVisualizer.js doesn't need to change its fetch logic
    out_name = basename.replace('phase3b_quantized_', 'phase3c_osmd_ready_')
    out_path = os.path.join(os.path.dirname(p3b_path), out_name)
    
    with open(out_path, 'w') as f:
        json.dump(score, f, indent=2)
        
    print(f"Phase 3C DreamFlow mapping complete! Wrote to {out_path}")
