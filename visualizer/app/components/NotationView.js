import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Accidental, Voice, Formatter, StaveConnector, Dot } from 'dreamflow';

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
    
    // Correct time signature logic based on Phase 3C container values
    const num = phase3cData.beats_per_measure || 4;
    const den = phase3cData.denominator || 4;
    const timeSig = `${num}/${den}`;
    const measureValuesInWholeNotes = num / den;
    
    const { measures, ticks_per_measure } = phase3cData;
    const ticksPerWholeNote = ticks_per_measure / measureValuesInWholeNotes;

    // Zoom-level pixel density (we can just compute how wide a single tick is)
    // Assuming standard 4/4 measure at 320 ticks could be 320 pixels -> 1 px/tick. 
    // Let's define pixelsPerTick
    const pixelsPerTick = 2.0; 

    function getVexDuration(durTicks) {
      if (durTicks <= 0) durTicks = 1;
      const ratio = durTicks / ticksPerWholeNote;
      const durs = [
        { r: 1.0, d: 'w', dots: 0 },
        { r: 0.75, d: 'h', dots: 1 },
        { r: 0.5, d: 'h', dots: 0 },
        { r: 0.375, d: 'q', dots: 1 },
        { r: 0.25, d: 'q', dots: 0 },
        { r: 0.1875, d: '8', dots: 1 },
        { r: 0.125, d: '8', dots: 0 },
        { r: 0.09375, d: '16', dots: 1 },
        { r: 0.0625, d: '16', dots: 0 },
        { r: 0.03125, d: '32', dots: 0 }
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
      return closest;
    }

    const measureKeys = Object.keys(measures).map(Number).sort((a, b) => a - b);
    const numMeasures = measureKeys.length;
    
    // Estimate total canvas width based on total ticks
    const totalTicks = numMeasures * ticks_per_measure;
    renderer.resize(totalTicks * pixelsPerTick + 200, 400);

    let x = 20;
    let yTreble = 50;
    let yBass = 170;

    measureKeys.forEach((m_num, i) => {
      const isFirst = i === 0;
      
      // Calculate start and end offset to find precise ticks for measure content
      let mMinTick = Number.MAX_SAFE_INTEGER;
      let mMaxTick = 0;
      const rhTicks = Object.keys(measures[m_num]['RH'] || {}).map(Number);
      const lhTicks = Object.keys(measures[m_num]['LH'] || {}).map(Number);
      const allTicks = [...rhTicks, ...lhTicks];
      allTicks.forEach(t => { 
          mMinTick = Math.min(mMinTick, t); 
          mMaxTick = Math.max(mMaxTick, t);
      });
      // Safety bounds if measure is totally empty
      const measureAbsStart = mMinTick === Number.MAX_SAFE_INTEGER ? m_num * ticks_per_measure : mMinTick - (mMinTick % ticks_per_measure);

      
      // The Rigid Linear Trick: force the Stave width to strictly equal its duration * pixelsPerTick!
      const paddingParams = isFirst ? 60 : 0;
      const mWidth = (ticks_per_measure * pixelsPerTick) + paddingParams;

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

      // Replaced by measureAbsStart above

      const processStaff = (staffData, clef) => {
        let tickKeys = Object.keys(staffData).map(Number).sort((a,b) => a - b);
        let vexNotes = [];
        let currentTick = measureAbsStart;

        tickKeys.forEach(t => {
          if (t > currentTick) {
            let restDurTicks = t - currentTick;
            const restDur = getVexDuration(restDurTicks);
            const rNote = new StaveNote({
              keys: clef === 'treble' ? ['b/4'] : ['d/3'],
              duration: restDur.d + 'r',
              dots: restDur.dots,
              clef: clef
            });
            if (restDur.dots > 0) {
              rNote.addModifier(new Dot(), 0);
            }
            vexNotes.push(rNote);
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

          const durObj = getVexDuration(safeDurationTicks);
          const staveNote = new StaveNote({
            keys: keys,
            duration: durObj.d,
            dots: durObj.dots,
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
          
          if (durObj.dots > 0) {
             keys.forEach((_, idx) => {
                staveNote.addModifier(new Dot(), idx);
             });
          }

          vexNotes.push(staveNote);
          currentTick += safeDurationTicks;
        });

        // Fill remaining rest in measure
        if (currentTick < measureAbsStart + ticks_per_measure) {
          let restDurTicks = measureAbsStart + ticks_per_measure - currentTick;
          const restDur = getVexDuration(restDurTicks);
          const rNote = new StaveNote({
            keys: clef === 'treble' ? ['b/4'] : ['d/3'],
            duration: restDur.d + 'r',
            dots: restDur.dots,
            clef: clef
          });
          if (restDur.dots > 0) {
            rNote.addModifier(new Dot(), 0);
          }
          vexNotes.push(rNote);
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
        
        // Target format width is strictly the Stave's drawable width (Stave width minus padding)
        const formatWidth = mWidth - paddingParams - 20;
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
