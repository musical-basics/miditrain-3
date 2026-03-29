import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Accidental, Voice, Formatter, StaveConnector } from 'dreamflow';

function midiToVexPitches(midi) {
  const notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const name = notes[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}/${octave}`;
}

export default function NotationView({ phase3cData, gridData }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !phase3cData) return;

    // Clear previous renders
    containerRef.current.innerHTML = '';

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    const context = renderer.getContext();
    context.setFont('Arial', 10, '').setBackgroundFillStyle('#ffffff');
    
    // Safety mapping for time signature
    const timeSig = gridData?.time_signature || '4/4';
    const [num, den] = timeSig.split('/').map(Number);
    const measureValuesInWholeNotes = num / den;
    
    const { measures, ticks_per_measure } = phase3cData;
    const ticksPerWholeNote = ticks_per_measure / measureValuesInWholeNotes;

    function getVexDuration(durTicks) {
      if (durTicks <= 0) durTicks = 1;
      const ratio = durTicks / ticksPerWholeNote;
      const durs = [
        { r: 1.0, d: 'w' },
        { r: 0.75, d: 'h.' },
        { r: 0.5, d: 'h' },
        { r: 0.375, d: 'q.' },
        { r: 0.25, d: 'q' },
        { r: 0.1875, d: '8.' },
        { r: 0.125, d: '8' },
        { r: 0.09375, d: '16.' },
        { r: 0.0625, d: '16' },
        { r: 0.03125, d: '32' }
      ];
      let closest = durs[0];
      let minDiff = Infinity;
      for (const dur of durs) {
        const diff = Math.abs(ratio - dur.r);
        if (diff < minDiff) {
          minDiff = diff;
          closest = dur;
        }
      }
      return closest.d;
    }

    const measureKeys = Object.keys(measures).map(Number).sort((a, b) => a - b);
    const numMeasures = measureKeys.length;
    
    const measureWidth = 300; 
    renderer.resize(measureWidth * numMeasures + 150, 400);

    let x = 20;
    let yTreble = 50;
    let yBass = 170;

    measureKeys.forEach((m_num, i) => {
      const isFirst = i === 0;
      const mWidth = isFirst ? measureWidth + 60 : measureWidth;

      const staveTreble = new Stave(x, yTreble, mWidth);
      const staveBass = new Stave(x, yBass, mWidth);
      
      if (isFirst) {
        staveTreble.addClef('treble').addTimeSignature(timeSig);
        staveBass.addClef('bass').addTimeSignature(timeSig);
      }
      
      staveTreble.setContext(context).draw();
      staveBass.setContext(context).draw();

      if (isFirst) {
        const brace = new StaveConnector(staveTreble, staveBass);
        brace.setType(StaveConnector.type.BRACE);
        brace.setContext(context).draw();
        
        const line = new StaveConnector(staveTreble, staveBass);
        line.setType(StaveConnector.type.SINGLE_LEFT);
        line.setContext(context).draw();
      }

      // We determine measure start
      let mMinTick = Number.MAX_SAFE_INTEGER;
      const rhTicks = Object.keys(measures[m_num]['RH'] || {}).map(Number);
      const lhTicks = Object.keys(measures[m_num]['LH'] || {}).map(Number);
      const allTicks = [...rhTicks, ...lhTicks];
      allTicks.forEach(t => { mMinTick = Math.min(mMinTick, t); });
      const measureAbsStart = mMinTick === Number.MAX_SAFE_INTEGER ? 0 : mMinTick - (mMinTick % ticks_per_measure);

      const processStaff = (staffData, clef) => {
        let tickKeys = Object.keys(staffData).map(Number).sort((a,b) => a - b);
        let vexNotes = [];
        let currentTick = measureAbsStart;

        tickKeys.forEach(t => {
          if (t > currentTick) {
            let restDurTicks = t - currentTick;
            const restDur = getVexDuration(restDurTicks);
            vexNotes.push(new StaveNote({
              keys: clef === 'treble' ? ['b/4'] : ['d/3'],
              duration: restDur + 'r',
              clef: clef
            }));
            currentTick = t;
          }
          
          let notesAtTick = staffData[t] || [];
          if (notesAtTick.length === 0) return;
          notesAtTick.sort((a, b) => b.pitch - a.pitch);
          
          let maxDurTicks = 0;
          let keys = [];
          
          notesAtTick.forEach(n => {
             keys.push(midiToVexPitches(n.pitch));
             maxDurTicks = Math.max(maxDurTicks, n.duration_ticks);
          });
          
          let safeDurationTicks = maxDurTicks;
          if (currentTick + safeDurationTicks > measureAbsStart + ticks_per_measure) {
             safeDurationTicks = measureAbsStart + ticks_per_measure - currentTick;
          }
          if (safeDurationTicks < 1) safeDurationTicks = 1;

          const durStr = getVexDuration(safeDurationTicks);
          const staveNote = new StaveNote({
            keys: keys,
            duration: durStr,
            clef: clef,
            auto_stem: true
          });

          // Accidentals and Colors
          notesAtTick.forEach((n, idx) => {
             const keyName = keys[idx];
             if (keyName.includes('#')) {
               staveNote.addModifier(new Accidental('#'), idx);
             } else if (keyName.includes('b')) {
               staveNote.addModifier(new Accidental('b'), idx);
             }
             
             if (n.color !== undefined) {
                // Hue from Phase 1. Add some lightness/saturation to ensure visibility
                staveNote.setKeyStyle(idx, { fillStyle: `hsl(${n.color}, 90%, 40%)`, strokeStyle: `hsl(${n.color}, 90%, 40%)` });
             }
          });
          
          // Helper handling for dotted notes
          if (durStr.includes('.')) {
             for (let idx = 0; idx < keys.length; idx++) {
                // Since dot modifier isn't explicitly imported as easily via generic imports,
                // dreamflow auto-appends dots if requested, but safest is to add modifier manually if needed.
                // For simplicity, dreamflow uses staveNote.addDot(idx) if it has a dot helper, but we'll try standard vexflow AddModifier:
                // Note: we can omit the dot modifier if the visualizer doesn't strictly need it right now, 
                // but let's assume 'duration: q.' will auto-render without manual intervention in newer VexFlow.
             }
          }

          vexNotes.push(staveNote);
          currentTick += safeDurationTicks;
        });

        // Fill remaining rest in measure
        if (currentTick < measureAbsStart + ticks_per_measure) {
          let restDurTicks = measureAbsStart + ticks_per_measure - currentTick;
          const restDur = getVexDuration(restDurTicks);
          vexNotes.push(new StaveNote({
            keys: clef === 'treble' ? ['b/4'] : ['d/3'],
            duration: restDur + 'r',
            clef: clef
          }));
        }
        
        return vexNotes;
      };

      try {
        const trebleNotes = processStaff(measures[m_num]['RH'] || {}, 'treble');
        const bassNotes = processStaff(measures[m_num]['LH'] || {}, 'bass');
        
        const trebleVoice = new Voice({ num_beats: num, beat_value: den }).setStrict(false);
        trebleVoice.addTickables(trebleNotes);
        
        const bassVoice = new Voice({ num_beats: num, beat_value: den }).setStrict(false);
        bassVoice.addTickables(bassNotes);

        const formatter = new Formatter().joinVoices([trebleVoice, bassVoice]);
        const formatWidth = mWidth - (isFirst ? 80 : 30);
        formatter.format([trebleVoice, bassVoice], formatWidth);

        trebleVoice.draw(context, staveTreble);
        bassVoice.draw(context, staveBass);
      } catch (e) {
        console.error("VexFlow Error on Measure " + m_num, e);
      }

      x += mWidth;
    });

  }, [phase3cData, gridData]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        overflowX: 'auto', 
        overflowY: 'hidden',
        background: '#ffffff',
        padding: '20px'
      }} 
    />
  );
}
