/** Reference role taxonomy, transcribed from supplied production source; not a payroll roster. */
const departments = {
 'PRODUCTION': 'Executive Producer|Producer|Line Producer|Co-Producer|Associate Producer|Production Manager|Production Coordinator|Production Accountant|Production Secretary|Screenwriter|Head Writer|Script Editor|Story Editor|Researcher|Casting Director|Casting Assistant|Location Manager|Location Scout|Unit Production Manager|Production Assistant / Runner',
 'DIRECTION': 'Director|First Assistant Director|Second Assistant Director|Third Assistant Director|Script Supervisor|Second Unit Director|Crowd Assistant Director|Intimacy Coordinator',
 'CAMERA': 'Director of Photography|Camera Operator|First Assistant Camera|Second Assistant Camera|Digital Imaging Technician|Data Wrangler|Steadicam Operator|Drone Camera Operator|Underwater Camera Operator|Video Assist Operator',
 'LIGHTING_GRIP': 'Gaffer|Best Boy Electric|Lighting Technician|Lighting Programmer|Key Grip|Best Boy Grip|Dolly Grip|Crane / Jib Operator|Rigging Grip',
 'ART_COSTUME_SFX': 'Production Designer|Art Director|Set Designer|Set Decorator|Construction Manager|Prop Master|Prop Maker|Scenic Artist|Concept Artist|Graphic Designer|Costume Designer|Costume Supervisor|Wardrobe Assistant|Hair Designer|Make-up Artist|Prosthetics Artist|Creature Designer|Special Effects Supervisor',
 'PERFORMANCE': 'Lead Actor|Supporting Actor|Background Actor|Voice Actor|Performance Capture Actor|Stunt Coordinator|Stunt Performer|Fight Choreographer|Movement Director|Dialect Coach|Acting Coach|Military / Medical / Historical Advisor',
 'SOUND_MUSIC': 'Production Sound Mixer|Boom Operator|Sound Utility Technician|Sound Designer|Dialogue Editor|ADR Supervisor|Foley Artist|Foley Mixer|Re-recording Mixer|Composer|Music Editor',
 'POST_VFX': 'Post-production Supervisor|Film Editor|Assistant Editor|Colourist|Online Editor|VFX Supervisor|VFX Producer|Compositor|Matchmove Artist|Rotoscope Artist|3D Generalist|Lighting / Rendering Artist|CG Supervisor|Pipeline TD|Deliverables Producer|Localization Specialist|QC Operator',
 'CHILD_SAFEGUARDING': 'Children’s Content Producer|Developmental Psychology Consultant|Educational Consultant|Curriculum Specialist|Child Safeguarding Lead|Child Welfare Coordinator|Chaperone|On-set Tutor|Child Casting Specialist|Child Acting Coach|Child-Friendly Dialogue Writer|Accessibility Consultant|Child Audience Researcher|Developmental Content Reviewer|Educational Game Designer|Puppeteer',
 'ANIMATION': 'Animation Director|Head of Story|Character Designer|Background Designer|Storyboard Artist|Storyboard Supervisor|Animatic Editor|Layout Artist|2D Animator|3D Character Modeler|Environment Modeler|Texture Artist|Look Development Artist|Character TD|Rigger|Skinning Artist|Character Animator|Facial Animator|Lip Sync Artist|Crowd Animator|Effects Animator|Simulation Artist|Lighting Artist|Render TD|Compositing Artist|Render Wrangler',
 'CINEMATICS': 'Cinematic Director|Game Director|Narrative Director|Narrative Designer|Game Writer|Dialogue Designer|Cinematic Designer|Cinematic Artist|Virtual Camera Artist|Interactive Dialogue Designer|Branching Narrative Designer|Narrative Continuity Specialist|Previsualization Artist|Scene Producer|Performance Capture Director|Motion Capture Supervisor|Motion Capture Technician|Facial Capture Supervisor|Facial Capture Technician|Motion Data Processing Artist|Retargeting Artist|Animation Cleanup Artist|Technical Animator|Gameplay Animator',
 'ENGINEERING': 'Engine Programmer|Gameplay Programmer|Graphics Programmer|Animation Programmer|Tools Programmer|Technical Artist|Rendering Engineer|Physics Programmer|AI Gameplay Programmer|Build Engineer|Performance Engineer|QA Automation Engineer|Pipeline Engineer',
 'WORLD': 'World Director|World Builder|Environment Art Director|Environment Artist|Level Designer|Level Artist|Landscape Artist|Terrain Technical Artist|Vegetation Artist|Architectural Designer|Prop Artist|Material Artist|Photogrammetry Specialist|Weather FX Artist|VFX Artist|Simulation Engineer|Procedural Content Artist|Environment Optimization Artist|Technical Level Designer|World QA Tester'
};
const aliases={'Producer':'PRODUCER','Director':'DIRECTOR'};
export function loadRoleCatalogue() {
  const out=[]; const used=new Set();
  for(const [department,names] of Object.entries(departments)) for(const name of names.split('|')){
    const base=aliases[name]??name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    const id=used.has(base)?`${department}_${base}`:base;
    used.add(id);out.push({id,name,department});
  }
  return out;
}
export const DEPARTMENTS=Object.freeze(Object.keys(departments));
