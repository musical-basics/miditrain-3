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
      
      let measureAbsStart = -1;
      
      // Attempt to find absolute start tick of the measure based on its notes
      if (ticks.length > 0) {
        // e.g., if tick is 34 and ticks_per_measure is 16, start is 32.
        measureAbsStart = ticks[0] - (ticks[0] % ticks_per_measure);
      } else {
        // Find it from any other hand that might have notes
        const otherHandKey = staffKey === 'RH' ? 'LH' : 'RH';
        const otherTicks = Object.keys(measures[m_num][otherHandKey] || {}).map(Number).sort((a,b) => a - b);
        if (otherTicks.length > 0) {
           measureAbsStart = otherTicks[0] - (otherTicks[0] % ticks_per_measure);
        }
      }
      
      if (measureAbsStart === -1) {
        partXml += `      <note>\n`;
        partXml += `        <rest/>\n`;
        partXml += `        <duration>${ticks_per_measure}</duration>\n`;
        partXml += `      </note>\n`;
      } else {
        let currentAbsTick = measureAbsStart;
        
        ticks.forEach(tick => {
          if (tick > currentAbsTick) {
            const restDur = tick - currentAbsTick;
            partXml += `      <note>\n`;
            partXml += `        <rest/>\n`;
            partXml += `        <duration>${restDur}</duration>\n`;
            partXml += `      </note>\n`;
            currentAbsTick = tick;
          }
          
          const tickNotes = staffMeasures[tick];
          // sort notes so highest pitches render better on top?
          tickNotes.sort((a, b) => b.pitch - a.pitch);
          
          let maxDur = 0;
          tickNotes.forEach((note, idx) => {
            partXml += `      <note>\n`;
            if (idx > 0) {
              partXml += `        <chord/>\n`;
            }
            partXml += `        <pitch>\n          ${midiToXmlPitch(note.pitch)}\n        </pitch>\n`;
            partXml += `        <duration>${note.duration_ticks}</duration>\n`;
            partXml += `      </note>\n`;
            
            if (note.duration_ticks > maxDur) maxDur = note.duration_ticks;
          });
          
          // Advance the tick cursor. 
          // Real MusicXML handles polyphony with <backup>, but for now just advance by max duration found at this tick.
          currentAbsTick += maxDur; 
        });
        
        // Pad end of measure
        const expectedMeasureEnd = measureAbsStart + ticks_per_measure;
        if (currentAbsTick < expectedMeasureEnd) {
          partXml += `      <note>\n`;
          partXml += `        <rest/>\n`;
          partXml += `        <duration>${expectedMeasureEnd - currentAbsTick}</duration>\n`;
          partXml += `      </note>\n`;
        }
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
