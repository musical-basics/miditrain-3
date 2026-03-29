const PITCH_MAP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ALTER_MAP = [ 0,   1,   0,   1,   0,   0,   1,   0,   1,   0,   1,   0];

function midiToXmlPitch(pitch) {
  const step = PITCH_MAP[pitch % 12];
  const alter = ALTER_MAP[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  let xml = `<step>${step}</step>`;
  if (alter !== 0) xml += `<alter>${alter}</alter>`;
  xml += `<octave>${octave}</octave>`;
  return xml;
}

export function buildMusicXml(phase3cJson) {
  const { ticks_per_measure, measures } = phase3cJson;

  const timeSigBeats = 4;
  const timeSigBeatType = 4;
  const divisions = Math.max(1, ticks_per_measure / timeSigBeats);

  const measureKeys = Object.keys(measures).map(Number).sort((a,b) => a - b);

  if (measureKeys.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><part-list/></score-partwise>`;
  }

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
  xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
  xml += `<score-partwise version="3.1">\n`;
  
  xml += `  <part-list>\n`;
  xml += `    <score-part id="P1"><part-name>RH</part-name></score-part>\n`;
  xml += `    <score-part id="P2"><part-name>LH</part-name></score-part>\n`;
  xml += `  </part-list>\n`;

  const generatePart = (partId, staffKey) => {
    let partXml = `  <part id="${partId}">\n`;
    
    measureKeys.forEach((m_num, i) => {
      partXml += `    <measure number="${m_num}">\n`;
      
      if (i === 0) {
        partXml += `      <attributes>\n`;
        partXml += `        <divisions>${divisions}</divisions>\n`;
        partXml += `        <key><fifths>0</fifths></key>\n`;
        partXml += `        <time><beats>${timeSigBeats}</beats><beat-type>${timeSigBeatType}</beat-type></time>\n`;
        partXml += `        <clef>\n`;
        partXml += `          <sign>${staffKey === 'RH' ? 'G' : 'F'}</sign>\n`;
        partXml += `          <line>${staffKey === 'RH' ? '2' : '4'}</line>\n`;
        partXml += `        </clef>\n`;
        partXml += `      </attributes>\n`;
      }
      
      const staffMeasures = measures[m_num][staffKey] || {};
      const ticks = Object.keys(staffMeasures).map(Number).sort((a,b) => a - b);
      
      let minTick = Number.MAX_SAFE_INTEGER;
      const rhTicks = Object.keys(measures[m_num]['RH'] || {}).map(Number);
      const lhTicks = Object.keys(measures[m_num]['LH'] || {}).map(Number);
      rhTicks.concat(lhTicks).forEach(t => { if (t < minTick) minTick = t; });
      
      const measureAbsStart = minTick === Number.MAX_SAFE_INTEGER ? 0 : minTick - (minTick % ticks_per_measure);
      const expectedMeasureEnd = measureAbsStart + ticks_per_measure;

      // Group notes into voices
      const voiceBuckets = {};
      ticks.forEach(tick => {
        staffMeasures[tick].forEach(note => {
          let vId = '1';
          if (staffKey === 'RH' && note.voice_tag === 'Voice 2') vId = '2';
          if (staffKey === 'LH' && note.voice_tag === 'Voice 4') vId = '2';
          
          if (!voiceBuckets[vId]) voiceBuckets[vId] = {};
          if (!voiceBuckets[vId][tick]) voiceBuckets[vId][tick] = [];
          voiceBuckets[vId][tick].push(note);
        });
      });
      
      const vKeys = Object.keys(voiceBuckets).sort();

      if (vKeys.length === 0) {
        partXml += `      <note>\n`;
        partXml += `        <rest/>\n`;
        partXml += `        <duration>${ticks_per_measure}</duration>\n`;
        partXml += `        <voice>1</voice>\n`;
        partXml += `      </note>\n`;
      } else {
        vKeys.forEach((vId, vIndex) => {
          if (vIndex > 0) {
            // Backup cursor for simultaneous voices
            partXml += `      <backup>\n`;
            partXml += `        <duration>${ticks_per_measure}</duration>\n`;
            partXml += `      </backup>\n`;
          }
          
          let currentAbsTick = measureAbsStart;
          const voiceTicks = Object.keys(voiceBuckets[vId]).map(Number).sort((a,b) => a - b);
          
          voiceTicks.forEach(tick => {
            if (tick > currentAbsTick) {
              const restDur = tick - currentAbsTick;
              partXml += `      <note>\n`;
              partXml += `        <rest/>\n`;
              partXml += `        <duration>${restDur}</duration>\n`;
              partXml += `        <voice>${vId}</voice>\n`;
              partXml += `      </note>\n`;
              currentAbsTick = tick;
            }
            
            const tickNotes = voiceBuckets[vId][tick];
            tickNotes.sort((a, b) => b.pitch - a.pitch); // top to bottom rendering priority
            
            let maxDur = 0;
            tickNotes.forEach((note, idx) => {
              const isGrace = note.duration_ticks <= 0;
              let safeDuration = 0;
              
              if (!isGrace) {
                safeDuration = note.duration_ticks;
                // Truncate overlapping barline durations strictly for OSMD formatting
                if (currentAbsTick + safeDuration > expectedMeasureEnd) {
                   safeDuration = expectedMeasureEnd - currentAbsTick;
                }
                if (safeDuration < 1) safeDuration = 1;
              }

              partXml += `      <note>\n`;
              if (isGrace) partXml += `        <grace/>\n`;
              if (idx > 0 && !isGrace) partXml += `        <chord/>\n`; // OSMD doesn't typically mix chords with grace, but safe fallback
              
              partXml += `        <pitch>\n          ${midiToXmlPitch(note.pitch)}\n        </pitch>\n`;
              
              if (!isGrace) {
                partXml += `        <duration>${safeDuration}</duration>\n`;
              }
              
              partXml += `        <voice>${vId}</voice>\n`;
              
              // Prevent rendering tiny grace notes natively causing OSMD crashes
              // if we need to explicitly declare type we could, but standard OSMD parses it fine.
              partXml += `      </note>\n`;
              
              if (!isGrace && safeDuration > maxDur) maxDur = safeDuration;
            });
            
            currentAbsTick += maxDur; // Grace notes don't advance the cursor!
          });
          
          // Pad the remainder of the measure out to exactly the measureEnd
          if (currentAbsTick < expectedMeasureEnd) {
             partXml += `      <note>\n`;
             partXml += `        <rest/>\n`;
             partXml += `        <duration>${expectedMeasureEnd - currentAbsTick}</duration>\n`;
             partXml += `        <voice>${vId}</voice>\n`;
             partXml += `      </note>\n`;
          }
        });
      }

      partXml += `    </measure>\n`;
    });
    
    partXml += `  </part>\n`;
    return partXml;
  };

  xml += generatePart('P1', 'RH');
  xml += generatePart('P2', 'LH');
  
  xml += `</score-partwise>\n`;
  return xml;
}
